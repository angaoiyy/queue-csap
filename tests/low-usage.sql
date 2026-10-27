reset role;
delete from reservations;
delete from window_daily_quotas;
delete from staff_window_assignments;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
select set_office_window_count(test_office(), 1);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
set role authenticated;
select switch_staff_window(test_window());

do $$ declare expiry timestamptz; previous_revision uuid; begin
  select expires_at into expiry from staff_window_assignments where user_id = auth.uid();
  select e.revision into previous_revision from window_assignment_events e where office_id = test_office();
  perform get_staff_window_state(test_office());
  perform test_assert((select expires_at = expiry from staff_window_assignments where user_id = auth.uid()), 'assignment snapshot is truly read-only');
  perform renew_staff_window(test_window());
  perform test_assert((select e.revision = previous_revision from window_assignment_events e where office_id = test_office()), 'heartbeat does not fan out realtime messages');
end; $$;
select 'PASS: assignment reads do not renew leases and heartbeats do not publish events';

reset role;
set role anon;
select test_ticket();
select test_assert((select active_count = 1 from window_queue_counts where window_id = test_window()), 'compact counter tracks admission');
select test_assert(get_office_quota_snapshot('accounting')->>'officeId' = test_office()::text, 'public snapshot includes only office availability');
select test_assert(get_office_quota_snapshot('accounting')::text not like '%student_name%', 'availability payload excludes student records');
do $$ begin
  begin
    insert into window_queue_counts values(test_window(), test_office(), current_date, 100);
    raise exception 'FAIL: public count tampering allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
set role authenticated;
do $$ declare previous_version text; begin
  select xmin::text into previous_version from window_queue_counts where window_id = test_window();
  perform dispatch_window_queue(test_window(), 'call_next');
  perform test_assert((select xmin::text = previous_version from window_queue_counts where window_id = test_window()), 'waiting-to-serving does not emit redundant count events');
end; $$;
select dispatch_window_queue(test_window(), 'call_next');
select test_assert((select active_count = 0 from window_queue_counts where window_id = test_window()), 'completion updates compact count');
select 'PASS: compact counts are exact, protected, and update only when necessary';

reset role;
set role anon;
select test_ticket() from generate_series(1, 25);
select test_assert(jsonb_array_length(get_office_display_snapshot(test_office())->'assignedTickets') = 15, 'display payload is bounded to rendered tickets');
select test_assert(get_office_display_snapshot(test_office())->>'lunchBreakStart' = '12:00', 'display settings preserve time format');
select test_assert((select active_count = 25 from window_queue_counts where window_id = test_window()), 'bulk admissions retain correct counts');
reset role;
truncate reservations;
select test_assert((select active_count = 0 from window_queue_counts where window_id = test_window()), 'administrative reset also resets compact counts');
set role authenticated;
select release_staff_window();
do $$ begin
  perform test_assert(renew_staff_window(test_window()) is null, 'heartbeat cannot reacquire released claim');
end; $$;
select switch_staff_window(test_window());
insert into window_daily_quotas values(test_window(), test_office(), (now() at time zone 'Asia/Manila')::date, true,
  '[{"start":"00:00","end":"23:59","capacity":1}]');
reset role;
select 'PASS: display egress is bounded and released claims cannot be renewed';
