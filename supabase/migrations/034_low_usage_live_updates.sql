-- Safe to rerun after a partial or completed installation. Existing tables and
-- operational data are preserved; definitions, policies, and triggers converge.
-- Run this entire file as one batch, including BEGIN and COMMIT.
begin;

-- Compact public counts avoid polling and broadcasting student records to
-- reservation forms. Rows change only when the active count actually changes.
create table if not exists window_queue_counts (
  window_id uuid primary key references windows(id) on delete cascade,
  office_id uuid not null references offices(id),
  queue_date date not null,
  active_count integer not null check (active_count >= 0)
);
alter table window_queue_counts enable row level security;
drop policy if exists "Anyone reads queue counts" on window_queue_counts;
create policy "Anyone reads queue counts" on window_queue_counts for select using (true);
revoke all on window_queue_counts from anon, authenticated;
grant select on window_queue_counts to anon, authenticated;

create or replace function sync_window_queue_count(p_window_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into window_queue_counts(window_id, office_id, queue_date, active_count)
    select id, office_id, (now() at time zone 'Asia/Manila')::date, window_active_count(id)::integer
    from windows where id = p_window_id
    on conflict(window_id) do update set queue_date = excluded.queue_date, active_count = excluded.active_count
      where (window_queue_counts.queue_date, window_queue_counts.active_count)
        is distinct from (excluded.queue_date, excluded.active_count);
end;
$$;
create or replace function update_window_queue_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (old.window_id, old.queue_date, old.status in ('waiting', 'serving'))
    is not distinct from (new.window_id, new.queue_date, new.status in ('waiting', 'serving')) then return new; end if;
  if tg_op <> 'INSERT' then perform sync_window_queue_count(old.window_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.window_id is distinct from old.window_id) then
    perform sync_window_queue_count(new.window_id);
  end if;
  return null;
end;
$$;
drop trigger if exists update_window_queue_count on reservations;
create trigger update_window_queue_count after insert or update or delete on reservations
  for each row execute function update_window_queue_count();
create or replace function reset_window_queue_counts()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update window_queue_counts set active_count = 0, queue_date = (now() at time zone 'Asia/Manila')::date
    where active_count <> 0 or queue_date <> (now() at time zone 'Asia/Manila')::date;
  return null;
end;
$$;
drop trigger if exists reset_window_queue_counts on reservations;
create trigger reset_window_queue_counts after truncate on reservations
  for each statement execute function reset_window_queue_counts();
select sync_window_queue_count(id) from windows;

create or replace function get_office_quota_snapshot(p_office_slug text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select get_window_quota_availability(o.id) || jsonb_build_object('officeId', o.id, 'serverNow', now())
    from offices o where slug = p_office_slug and is_active;
$$;

-- Read-only assignment reads no longer lock offices, delete rows, or renew
-- leases. Only explicit, tiny heartbeats renew a live claim.
create or replace function get_staff_window_state(p_office_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_office_id is null or auth_office_id() is distinct from p_office_id then raise exception 'Forbidden'; end if;
  select jsonb_build_object('userId', auth.uid(),
    'currentWindowId', (select window_id from staff_window_assignments where user_id = auth.uid()
      and office_id = p_office_id and expires_at > now()),
    'expiresAt', (select expires_at from staff_window_assignments where user_id = auth.uid()
      and office_id = p_office_id and expires_at > now()),
    'windows', coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name,
      'occupied', a.user_id is not null, 'isMine', coalesce(a.user_id = auth.uid(), false))
      order by coalesce(nullif(regexp_replace(w.name, '\D', '', 'g'), '')::numeric, 2147483647), w.name), '[]'::jsonb)
  ) into result from windows w left join staff_window_assignments a on a.window_id = w.id and a.expires_at > now()
    where w.office_id = p_office_id and w.is_active;
  return result;
end;
$$;
create or replace function renew_staff_window(p_window_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_office uuid := auth_office_id(); v_expiry timestamptz;
begin
  if v_office is null then raise exception 'Forbidden'; end if;
  perform 1 from offices where id = v_office for update;
  update staff_window_assignments a set expires_at = clock_timestamp() + interval '2 minutes'
    where a.user_id = auth.uid() and a.window_id = p_window_id and a.office_id = v_office
      and a.expires_at > clock_timestamp() and exists(select 1 from windows where id = a.window_id and is_active)
    returning expires_at into v_expiry;
  if not found then return null; end if;
  return jsonb_build_object('currentWindowId', p_window_id, 'expiresAt', v_expiry);
end;
$$;

-- Publish actual operator changes, not periodic lease renewals. Otherwise every
-- heartbeat would fan out to every connected staff dashboard.
create table if not exists window_assignment_events (
  office_id uuid primary key references offices(id),
  revision uuid not null default gen_random_uuid()
);
alter table window_assignment_events enable row level security;
drop policy if exists "Staff read own assignment events" on window_assignment_events;
create policy "Staff read own assignment events" on window_assignment_events
  for select to authenticated using (office_id = auth_office_id());
revoke all on window_assignment_events from anon, authenticated;
grant select on window_assignment_events to authenticated;
create or replace function notify_window_assignment_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_office uuid;
begin
  if tg_op = 'UPDATE' and (old.window_id, old.user_id, old.office_id)
    is not distinct from (new.window_id, new.user_id, new.office_id) then return null; end if;
  v_office := case when tg_op = 'DELETE' then old.office_id else new.office_id end;
  insert into window_assignment_events(office_id) values(v_office)
    on conflict(office_id) do update set revision = gen_random_uuid();
  if tg_op = 'UPDATE' and old.office_id <> new.office_id then
    insert into window_assignment_events(office_id) values(old.office_id)
      on conflict(office_id) do update set revision = gen_random_uuid();
  end if;
  return null;
end;
$$;
drop trigger if exists notify_window_assignment_change on staff_window_assignments;
create trigger notify_window_assignment_change after insert or update or delete on staff_window_assignments
  for each row execute function notify_window_assignment_change();

-- The public display needs only the 15 waiting tickets it renders per window,
-- not full reservation records or the entire waiting queue on every event.
create or replace function get_office_display_snapshot(p_office_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with active_windows as (select * from windows where office_id = p_office_id and is_active),
  queue as (select r.id, r.window_id, r.status, r.queue_number, r.inquiry_type, r.student_name,
      r.is_priority, r.created_at, r.called_at, w.name as window_name,
      row_number() over (partition by r.window_id, r.status order by r.is_priority desc, r.created_at, r.id) as rn
    from reservations r left join active_windows w on w.id = r.window_id
    where r.office_id = p_office_id and r.queue_date = (now() at time zone 'Asia/Manila')::date
      and r.status in ('waiting', 'serving')),
  settings as (select * from display_settings where office_id = p_office_id)
  select jsonb_build_object(
    'nowServingByWindow', coalesce((select jsonb_agg(jsonb_build_object('windowId', w.id, 'windowName', w.name,
      'queueNumber', q.queue_number, 'inquiryType', q.inquiry_type, 'studentName', q.student_name) order by w.name)
      from active_windows w left join queue q on q.window_id = w.id and q.status = 'serving' and q.rn = 1), '[]'::jsonb),
    'videoUrl', (select video_url from settings), 'videoEnabled', coalesce((select is_enabled from settings), true),
    'audioEnabled', coalesce((select audio_enabled from settings), true),
    'marqueeText', coalesce((select marquee_text from settings), 'Please proceed to your assigned counter when your number is called'),
    'lunchBreakEnabled', coalesce((select lunch_break_enabled from settings), true),
    'lunchBreakStart', left(coalesce((select lunch_break_start from settings), '12:00'::time)::text, 5),
    'lunchBreakEnd', left(coalesce((select lunch_break_end from settings), '13:00'::time)::text, 5),
    'priorityNext', coalesce((select jsonb_agg(jsonb_build_object('queueNumber', q.queue_number,
      'studentName', q.student_name, 'inquiryType', q.inquiry_type, 'windowName', coalesce(q.window_name, 'Unassigned')))
      from (select * from queue where status = 'waiting' and is_priority order by created_at, id limit 5) q), '[]'::jsonb),
    'assignedTickets', coalesce((select jsonb_agg(jsonb_build_object('queueNumber', q.queue_number,
      'windowName', coalesce(q.window_name, 'Unknown Window'), 'inquiryType', q.inquiry_type, 'status', q.status)
      order by q.is_priority desc, q.created_at, q.id) from queue q where q.rn <= 15), '[]'::jsonb),
    'skippedTickets', coalesce((select jsonb_agg(jsonb_build_object('queueNumber', r.queue_number,
      'windowName', coalesce(w.name, 'Unknown Window'), 'inquiryType', r.inquiry_type))
      from (select * from reservations where office_id = p_office_id
        and queue_date = (now() at time zone 'Asia/Manila')::date and status = 'skipped'
        order by called_at desc nulls last, id limit 10) r left join active_windows w on w.id = r.window_id), '[]'::jsonb)
  );
$$;

revoke all on function sync_window_queue_count(uuid), update_window_queue_count(), reset_window_queue_counts(),
  notify_window_assignment_change(), get_office_quota_snapshot(text), renew_staff_window(uuid),
  get_office_display_snapshot(uuid) from public, anon, authenticated;
grant execute on function get_office_quota_snapshot(text), get_office_display_snapshot(uuid) to anon, authenticated;
grant execute on function renew_staff_window(uuid) to authenticated;
do $$ declare t text; begin
  foreach t in array array['window_queue_counts', 'window_assignment_events', 'window_daily_quotas'] loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end; $$;
notify pgrst, 'reload schema';
commit;
