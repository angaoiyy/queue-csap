-- Upgrade fixtures from quota-only behavior to exclusive window operation.
truncate reservations;
delete from window_daily_quotas;
insert into auth.users(id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000004', 'second-accounting@example.test', '{"office_slug":"accounting"}'),
  ('10000000-0000-0000-0000-000000000005', 'admin@example.test', '{"office_slug":"accounting"}');
update profiles set status = 'approved' where id in (
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005');
update profiles set role = 'super_admin' where id = '10000000-0000-0000-0000-000000000005';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
select set_office_window_count(test_office(), 3);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
set role authenticated;
select test_assert(get_staff_window_state(test_office())->>'currentWindowId' is null, 'no implicit claim on first visit');
do $$ begin
  begin perform dispatch_window_queue(test_window(), 'call_next'); raise exception 'FAIL: unclaimed dispatch allowed';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
  begin perform dispatch_window_queue_internal(test_window(), 'call_next'); raise exception 'FAIL: internal dispatch exposed';
  exception when insufficient_privilege or undefined_function then null; end;
  begin perform rebalance_waiting_tickets(test_office()); raise exception 'FAIL: staff can rebalance other windows';
  exception when insufficient_privilege then null; end;
  begin
    insert into staff_window_assignments values(auth.uid(), test_window(), test_office(), now() + interval '1 day');
    raise exception 'FAIL: direct claim write allowed';
  exception when insufficient_privilege then null; end;
end; $$;
select switch_staff_window(test_window());
select test_assert(owns_staff_window(test_window()), 'selected window is owned');
select test_assert(get_staff_window_state(test_office())->>'currentWindowId' = test_window()::text, 'reload restores current window');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
select switch_staff_window(test_window('Window 2'));
select test_assert((select (w->>'occupied')::boolean and not (w->>'isMine')::boolean
  from jsonb_array_elements(get_staff_window_state(test_office())->'windows') w where w->>'id' = test_window()::text), 'other operator sees window in use');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
do $$ begin
  begin perform switch_staff_window(test_window('Window 2')); raise exception 'FAIL: occupied target claimed';
  exception when raise_exception then if sqlerrm not like 'WINDOW_OCCUPIED:%' then raise; end if; end;
  perform test_assert(owns_staff_window(test_window()), 'failed switch preserves original assignment');
  begin perform switch_staff_window(test_window('Window 1', 'registrar')); raise exception 'FAIL: cross-office claim allowed';
  exception when raise_exception then if sqlerrm <> 'Forbidden' then raise; end if; end;
  begin perform get_staff_window_state(test_office('registrar')); raise exception 'FAIL: cross-office state exposed';
  exception when raise_exception then if sqlerrm <> 'Forbidden' then raise; end if; end;
end; $$;

-- Saving is locked to the claimed window, including direct API upserts.
insert into window_daily_quotas values(test_window(), test_office(), (now() at time zone 'Asia/Manila')::date, true,
  '[{"start":"00:00","end":"23:59","capacity":5}]');
do $$ begin
  begin
    insert into window_daily_quotas values(test_window('Window 2'), test_office(), (now() at time zone 'Asia/Manila')::date, false, '[]');
    raise exception 'FAIL: quota for another window saved';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
end; $$;
select 'PASS: exclusive claims, reload restoration, occupied targets, office boundaries, and quota ownership';

-- Public intake keeps working; assignment ownership restricts staff operation.
reset role;
set role anon;
select test_ticket(); select test_ticket(); select test_ticket();
do $$ begin
  begin perform switch_staff_window(test_window()); raise exception 'FAIL: anonymous claim allowed';
  exception when insufficient_privilege then null; end;
  begin perform recall_window_ticket(test_window()); raise exception 'FAIL: anonymous recall allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
update reservations set priority_type = 'PWD' where window_id = test_window('Window 2');
set role authenticated;
do $$ declare affected integer; begin
  update reservations set status = 'serving' where window_id = test_window('Window 2');
  get diagnostics affected = row_count;
  perform test_assert(affected = 0, 'direct updates cannot operate another window');
  begin perform dispatch_window_queue(test_window('Window 2'), 'call_next'); raise exception 'FAIL: other window dispatched';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
  begin perform recall_window_ticket(test_window('Window 2')); raise exception 'FAIL: other window recalled';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
end; $$;
select dispatch_window_queue(test_window(), 'call_next');
select test_assert(exists(select 1 from reservations where window_id = test_window('Window 2') and is_priority and status = 'waiting'), 'dispatch does not take another window priority ticket');
select recall_window_ticket(test_window());
select test_assert(exists(select 1 from window_recalls where window_id = test_window()), 'own recall emits database event');
do $$ declare previous_nonce uuid; begin
  select nonce into previous_nonce from window_recalls where window_id = test_window();
  perform recall_window_ticket(test_window());
  perform test_assert((select nonce <> previous_nonce from window_recalls where window_id = test_window()), 'repeated recall emits a distinct update');
  begin
    insert into window_recalls(window_id, office_id, payload) values(test_window('Window 2'), test_office(), '{}');
    raise exception 'FAIL: fake recall event published';
  exception when insufficient_privilege then null; end;
end; $$;
select dispatch_window_queue(test_window(), 'call_next');
select test_assert(not exists(select 1 from reservations where window_id = test_window() and status = 'serving'), 'empty own queue does not pull another operator tickets');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
select dispatch_window_queue(test_window('Window 2'), 'call_next');
select 'PASS: queue and recall controls enforce ownership, including direct writes and forged events';

-- Switching invalidates the old window for every tab of the same staff account.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select switch_staff_window(test_window('Window 3'));
select test_assert(not owns_staff_window(test_window()) and owns_staff_window(test_window('Window 3')), 'switch releases old and claims new');
do $$ begin
  begin
    update window_daily_quotas set enabled = false where window_id = test_window();
    -- RLS may return zero rows; the old quota must remain unchanged either way.
    perform test_assert((select enabled from window_daily_quotas where window_id = test_window()), 'stale dialog cannot edit old window');
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
  begin perform dispatch_window_queue(test_window(), 'call_next'); raise exception 'FAIL: stale tab dispatched old window';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
end; $$;
reset role;
update staff_window_assignments set expires_at = clock_timestamp() - interval '1 second'
  where user_id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select test_assert(not owns_staff_window(test_window('Window 3')), 'expired assignment has no authority');
select test_assert(get_staff_window_state(test_office())->>'currentWindowId' is null, 'heartbeat does not resurrect an expired assignment');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
select switch_staff_window(test_window('Window 3'));
reset role;
update staff_window_assignments set expires_at = clock_timestamp() + interval '10 seconds'
  where user_id = '10000000-0000-0000-0000-000000000004';
set role authenticated;
select renew_staff_window(test_window('Window 3'));
select test_assert((select expires_at > clock_timestamp() + interval '110 seconds' from staff_window_assignments where user_id = auth.uid()), 'heartbeat renews a live assignment');
select release_staff_window();
select test_assert(not owns_staff_window(test_window('Window 3')), 'release removes authority immediately');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select switch_staff_window(test_window('Window 3'));
select 'PASS: switching, stale tabs, lease expiry, heartbeat renewal, release, and abandoned-window recovery';

-- Staff cannot use shared controls to bypass the one-window restriction.
do $$ declare affected integer; begin
  begin perform set_office_window_count(test_office(), 2); raise exception 'FAIL: staff changed office windows';
  exception when raise_exception then if sqlerrm not like 'Only the super admin%' then raise; end if; end;
  begin perform set_office_window_count_internal(test_office(), 2); raise exception 'FAIL: internal configuration exposed';
  exception when insufficient_privilege then null; end;
  update display_settings set marquee_text = 'Unauthorized' where office_id = test_office();
  get diagnostics affected = row_count;
  perform test_assert(affected = 0, 'staff cannot change shared display');
  begin
    insert into windows(office_id, name) values(test_office(), 'Unauthorized');
    raise exception 'FAIL: staff created another window';
  exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
do $$ begin
  begin perform set_office_window_count(test_office(), 2); raise exception 'FAIL: occupied window closed';
  exception when raise_exception then if sqlerrm not like 'A staff member is assigned%' then raise; end if; end;
  perform test_assert((select count(*) = 3 from windows where office_id = test_office() and is_active), 'occupied-window close rolls back');
  begin perform dispatch_window_queue(test_window('Window 3'), 'call_next'); raise exception 'FAIL: admin operated another staff window';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
end; $$;
update display_settings set marquee_text = 'Authorized' where office_id = test_office();
select test_assert((select marquee_text = 'Authorized' from display_settings where office_id = test_office()), 'super admin retains shared display control');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);
do $$ begin
  begin perform switch_staff_window(test_window()); raise exception 'FAIL: pending staff claimed window';
  exception when raise_exception then if sqlerrm <> 'Forbidden' then raise; end if; end;
end; $$;
reset role;
select 'PASS: shared controls require super admin, occupied windows cannot be closed, and pending accounts cannot claim windows';
