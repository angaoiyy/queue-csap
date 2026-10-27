create function test_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end;
$$;
create function test_office(slug text default 'accounting') returns uuid language sql stable as $$
  select id from offices where offices.slug = $1;
$$;
create function test_window(name text default 'Window 1', slug text default 'accounting') returns uuid language sql stable as $$
  select id from windows where windows.name = $1 and office_id = test_office($2);
$$;
create function test_ticket(slug text default 'accounting', priority text default null)
returns reservations language plpgsql as $$
declare ticket reservations;
begin
  insert into reservations(office_id, student_name, student_id, department, term_school_year,
    inquiry_type, application_type, queue_number, position, priority_type)
  values(test_office(slug), 'Test Student', 'TEST-001', 'Test Department', 'Test Term',
    'Other Inquiry', 'old', '', 0, priority) returning * into ticket;
  return ticket;
end;
$$;
insert into auth.users(id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000001', 'accounting@example.test', '{"office_slug":"accounting"}'),
  ('10000000-0000-0000-0000-000000000002', 'registrar@example.test', '{"office_slug":"registrar"}'),
  ('10000000-0000-0000-0000-000000000003', 'pending@example.test', '{"office_slug":"accounting"}');
update profiles set status = 'approved' where email <> 'pending@example.test';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

-- Unconfigured windows retain unlimited admission and numeric tie-breaking.
set role anon;
select test_assert((get_window_quota_availability(test_office())->'windows'->0->>'capacity') is null, 'missing config is unlimited');
select test_assert((test_ticket()).window_id = test_window(), 'first ticket chooses Window 1');
select test_assert((test_ticket()).window_id = test_window('Window 2'), 'next ticket uses least loaded window');
reset role;
truncate reservations;

-- Validation is enforced by the database, not just the dialog.
select test_assert(valid_quota_periods('[{"start":"08:00","end":"12:00","capacity":50},{"start":"12:00","end":"17:00","capacity":7}]'), 'adjacent periods allowed');
select test_assert(not valid_quota_periods('[{"start":"08:00","end":"12:00","capacity":50},{"start":"11:00","end":"13:00","capacity":7}]'), 'overlaps rejected');
select test_assert(not valid_quota_periods('[{"start":"12:00","end":"08:00","capacity":1}]'), 'overnight rejected');
select test_assert(not valid_quota_periods('[{"start":"08:00","end":"12:00","capacity":0}]'), 'zero rejected');
select test_assert(not valid_quota_periods('[{"start":"08:00","end":"12:00","capacity":1.5}]'), 'fraction rejected');
select test_assert(not valid_quota_periods('[{"start":"08:00","end":"12:00","capacity":2147483648}]'), 'overflow rejected');
select test_assert(not valid_quota_periods('[{"start":"25:00","end":"26:00","capacity":1}]'), 'invalid hours rejected');
select test_assert(not valid_quota_periods('[{}]'), 'missing fields rejected');

set role authenticated;
insert into window_daily_quotas(window_id, office_id, quota_date, enabled, periods)
values(test_window(), test_office(), (now() at time zone 'Asia/Manila')::date, true,
  '[{"start":"08:00","end":"12:00","capacity":50},{"start":"13:00","end":"17:00","capacity":7}]');
reset role;
do $$
declare today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform test_assert(window_quota_capacity(test_window(), (today + time '07:59') at time zone 'Asia/Manila') = 0, 'closed before start');
  perform test_assert(window_quota_capacity(test_window(), (today + time '08:00') at time zone 'Asia/Manila') = 50, 'inclusive start');
  perform test_assert(window_quota_capacity(test_window(), (today + time '12:00') at time zone 'Asia/Manila') = 0, 'exclusive end and midday gap');
  perform test_assert(window_quota_capacity(test_window(), (today + time '13:00') at time zone 'Asia/Manila') = 7, 'afternoon limit');
  perform test_assert(window_quota_capacity(test_window(), (today + time '17:00') at time zone 'Asia/Manila') = 0, 'closed after final period');
  perform test_assert(window_quota_capacity(test_window(), ((today + 1) + time '08:00') at time zone 'Asia/Manila') is null, 'tomorrow is unlimited');
end;
$$;
select test_assert(exists(select 1 from activity_logs where action = 'window_quota_changed' and actor_user_id = auth.uid()), 'configuration audited with actor');

-- Cross-office, anonymous, pending, stale-date and mismatched-window writes fail.
set role authenticated;
do $$ begin
  begin
    insert into window_daily_quotas values(test_window('Window 1', 'registrar'), test_office('registrar'), (now() at time zone 'Asia/Manila')::date, false, '[]');
    raise exception 'FAIL: cross-office insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into window_daily_quotas values(test_window('Window 1', 'registrar'), test_office(), (now() at time zone 'Asia/Manila')::date, false, '[]');
    raise exception 'FAIL: mismatched window allowed';
  exception when raise_exception then if sqlerrm not like 'Window does not belong%' then raise; end if; end;
  begin
    insert into window_daily_quotas values(test_window(), test_office(), (now() at time zone 'Asia/Manila')::date - 1, false, '[]');
    raise exception 'FAIL: stale date allowed';
  exception when raise_exception then if sqlerrm not like 'The date has changed%' then raise; end if; end;
  begin
    perform set_office_window_count(test_office('registrar'), 2);
    raise exception 'FAIL: cross-office RPC allowed';
  exception when raise_exception then if sqlerrm <> 'Forbidden' then raise; end if; end;
end; $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);
do $$ begin
  begin
    insert into window_daily_quotas values(test_window('Window 2'), test_office(), (now() at time zone 'Asia/Manila')::date, false, '[]');
    raise exception 'FAIL: pending staff allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
set role anon;
do $$ begin
  begin
    insert into window_daily_quotas values(test_window('Window 2'), test_office(), (now() at time zone 'Asia/Manila')::date, false, '[]');
    raise exception 'FAIL: anonymous config write allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform dispatch_window_queue(test_window(), 'call_next');
    raise exception 'FAIL: anonymous dispatch allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select 'PASS: validation, clock boundaries, date expiry, auditing, and office permissions';

-- Set all Accounting windows to capacity one; Registrar stays unlimited.
insert into window_daily_quotas(window_id, office_id, quota_date, enabled, periods)
select id, office_id, (now() at time zone 'Asia/Manila')::date, true,
  '[{"start":"00:00","end":"23:59","capacity":1}]'::jsonb from windows where office_id = test_office()
on conflict(window_id, quota_date) do update set periods = excluded.periods, enabled = true;
set role anon;
select test_assert((test_ticket()).window_id = test_window(), 'admit first');
select test_assert((test_ticket('accounting', 'PWD')).window_id = test_window('Window 2'), 'priority counts and routes around full window');
select test_assert((test_ticket()).window_id = test_window('Window 3'), 'last window fills');
do $$ begin
  begin perform test_ticket(); raise exception 'FAIL: over quota admitted';
  exception when raise_exception then if sqlerrm <> 'QUOTA_UNAVAILABLE' then raise; end if; end;
end; $$;
select test_assert((test_ticket('registrar')).office_id = test_office('registrar'), 'other office unaffected');
reset role;
update reservations set status = 'completed' where window_id = test_window();
set role anon;
select test_assert((test_ticket()).window_id = test_window(), 'completion frees a slot');
reset role;
update reservations set status = 'skipped' where window_id = test_window() and status = 'waiting';
set role anon;
select test_assert((test_ticket()).window_id = test_window(), 'skipping frees a slot');
reset role;
select test_assert((select count(*) = count(distinct queue_number) from reservations where office_id = test_office()), 'completed tickets do not cause duplicate ticket numbers');

-- Neither direct transfers nor restoring a completed ticket bypass capacity.
set role authenticated;
do $$ begin
  begin
    update reservations set window_id = test_window() where window_id = test_window('Window 2');
    raise exception 'FAIL: direct transfer overfilled';
  exception when raise_exception then if sqlerrm <> 'QUOTA_UNAVAILABLE' then raise; end if; end;
  begin
    update reservations set status = 'waiting' where status = 'completed';
    raise exception 'FAIL: restoration overfilled';
  exception when raise_exception then if sqlerrm <> 'QUOTA_UNAVAILABLE' then raise; end if; end;
end; $$;

-- Closing a full source cannot partially change the active windows or tickets.
do $$ begin
  begin perform set_office_window_count(test_office(), 2); raise exception 'FAIL: impossible close succeeded';
  exception when raise_exception then if sqlerrm not like 'Cannot close window:%' then raise; end if; end;
  perform test_assert((select count(*) = 3 from windows where office_id = test_office() and is_active), 'failed close rolls back active flags');
end; $$;
reset role;
update reservations set status = 'completed' where window_id = test_window() and status = 'waiting';
set role authenticated;
select set_office_window_count(test_office(), 2);
select test_assert(not exists(select 1 from reservations r join windows w on w.id = r.window_id where r.status = 'waiting' and not w.is_active), 'displaced tickets reassigned within limits');
reset role;
truncate reservations;
select set_office_window_count(test_office(), 3);
select 'PASS: active counting, priority admission, completion, skipping, direct-write guards, and atomic window closure';

-- A full window calls its own ticket instead of stealing another priority ticket.
select test_ticket();
select test_ticket('accounting', 'PWD');
select dispatch_window_queue(test_window(), 'call_next');
select test_assert(exists(select 1 from reservations where window_id = test_window() and status = 'serving' and not is_priority), 'full receiver serves its own ticket');
select dispatch_window_queue(test_window(), 'call_next');
select test_assert(exists(select 1 from reservations where window_id = test_window() and status = 'serving' and is_priority), 'completion frees capacity for priority transfer');
truncate reservations;

-- Lowering limits preserves backlog, which counts toward the new period limit.
update window_daily_quotas set enabled = false;
select set_office_window_count(test_office(), 1);
select test_ticket(); select test_ticket();
update window_daily_quotas set enabled = true, periods = '[{"start":"00:00","end":"23:59","capacity":1}]';
select test_assert(window_active_count(test_window()) = 2 and not window_accepts_ticket(test_window()), 'existing backlog survives lowered limit and blocks admission');
select dispatch_window_queue(test_window(), 'call_next');
select test_assert(window_active_count(test_window()) = 2, 'calling own waiting ticket does not consume another slot');
update window_daily_quotas set periods = '[{"start":"00:00","end":"00:01","capacity":1}]';
select dispatch_window_queue(test_window(), 'call_next');
select test_assert(exists(select 1 from reservations where status = 'serving'), 'existing tickets still served outside periods');
do $$ begin
  begin perform test_ticket(); raise exception 'FAIL: closed-period admission allowed';
  exception when raise_exception then if sqlerrm <> 'QUOTA_UNAVAILABLE' then raise; end if; end;
end; $$;
update window_daily_quotas set enabled = false;
select test_ticket();
select test_assert(window_active_count(test_window()) = 2, 'turning quota off restores unlimited admission');
truncate reservations;
select 'PASS: priority transfers respect capacity, backlog survives limit changes, and existing service continues outside periods';

-- A single statement inserting multiple rows must also enforce capacity; the
-- entire statement rolls back if its later row would consume an extra slot.
update window_daily_quotas set enabled = true, periods = '[{"start":"00:00","end":"23:59","capacity":1}]';
set role anon;
do $$ begin
  begin
    insert into reservations(office_id, student_name, student_id, department, term_school_year,
      inquiry_type, application_type, queue_number, position)
    select test_office(), 'Bulk Student', 'TEST', 'Test', 'Test', 'Other Inquiry', 'old', '', 0
      from generate_series(1, 2);
    raise exception 'FAIL: multi-row statement overfilled';
  exception when raise_exception then if sqlerrm <> 'QUOTA_UNAVAILABLE' then raise; end if; end;
  perform test_assert(not exists(select 1 from reservations), 'failed multi-row insert is atomic');
end; $$;
reset role;
select 'PASS: multi-row direct inserts cannot bypass capacity';
