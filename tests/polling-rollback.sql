select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
reset role;
update staff_window_assignments set expires_at = clock_timestamp() + interval '10 seconds'
  where user_id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select get_staff_window_state(test_office());
select test_assert((select expires_at > clock_timestamp() + interval '110 seconds'
  from staff_window_assignments where user_id = auth.uid()), 'polling renews a live claim again');
select dispatch_window_queue(test_window(), 'call_next');
select recall_window_ticket(test_window());
select test_assert(exists(select 1 from window_recalls where window_id = test_window()), 'authorized recall stays available to display polling');
select dispatch_window_queue(test_window(), 'skip_current');
select test_assert(not exists(select 1 from reservations where window_id = test_window() and status = 'serving'), 'own skip works after rollback');
update window_daily_quotas set enabled = false where window_id = test_window();
select test_assert(not (select enabled from window_daily_quotas where window_id = test_window()), 'own quota configuration still works');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', false);
select set_office_window_count(test_office(), 2);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
select switch_staff_window(test_window('Window 2'));
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
do $$ begin
  begin perform switch_staff_window(test_window('Window 2')); raise exception 'FAIL: occupied window allowed after rollback';
  exception when raise_exception then if sqlerrm not like 'WINDOW_OCCUPIED:%' then raise; end if; end;
  perform test_assert(owns_staff_window(test_window()), 'failed switch preserves own window');
  begin perform dispatch_window_queue(test_window('Window 2'), 'call_next'); raise exception 'FAIL: other window operation allowed after rollback';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
  begin
    insert into window_daily_quotas values(test_window('Window 2'), test_office(), (now() at time zone 'Asia/Manila')::date, false, '[]');
    raise exception 'FAIL: other window quota allowed after rollback';
  exception when raise_exception then if sqlerrm not like 'Select and claim%' then raise; end if; end;
end; $$;
reset role;
update staff_window_assignments set expires_at = clock_timestamp() - interval '1 second'
  where user_id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select test_assert(get_staff_window_state(test_office())->>'currentWindowId' is null, 'polling never resurrects an expired claim');
reset role;
select 'PASS: restored polling renews live claims and retains queue, quota, recall, expiry, and exclusive ownership protections';
