-- A staff account can operate one window at a time, and each window has at
-- most one operator. Short leases recover automatically from disconnected tabs.
create table staff_window_assignments (
  user_id uuid primary key references profiles(id) on delete cascade,
  window_id uuid not null unique references windows(id) on delete cascade,
  office_id uuid not null references offices(id),
  expires_at timestamptz not null
);
alter table staff_window_assignments enable row level security;
create policy "Staff read own office window assignments" on staff_window_assignments
  for select to authenticated using (office_id = (select auth_office_id()));
revoke all on staff_window_assignments from anon, authenticated;
grant select on staff_window_assignments to authenticated;

create function owns_staff_window(p_window_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from staff_window_assignments a join windows w on w.id = a.window_id
    where a.user_id = auth.uid() and a.window_id = p_window_id
      and a.office_id = auth_office_id() and w.office_id = a.office_id
      and w.is_active and a.expires_at > now()
  );
$$;

create function assert_staff_window(p_window_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_office uuid;
begin
  select office_id into v_office from windows where id = p_window_id;
  if v_office is null or auth_office_id() is distinct from v_office then raise exception 'Forbidden'; end if;
  perform 1 from offices where id = v_office for update;
  if not exists (
    select 1 from staff_window_assignments a join windows w on w.id = a.window_id
    where a.user_id = auth.uid() and a.window_id = p_window_id
      and a.office_id = v_office and w.is_active and a.expires_at > clock_timestamp()
  ) then
    raise exception 'Select and claim this window before using its controls. Your assignment may have expired or changed in another tab.';
  end if;
end;
$$;

create function get_staff_window_state(p_office_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if auth_office_id() is distinct from p_office_id then raise exception 'Forbidden'; end if;
  perform 1 from offices where id = p_office_id for update;
  delete from staff_window_assignments where office_id = p_office_id and expires_at <= clock_timestamp();
  update staff_window_assignments set expires_at = clock_timestamp() + interval '2 minutes'
    where user_id = auth.uid() and office_id = p_office_id
      and exists (select 1 from windows where id = window_id and is_active);
  select jsonb_build_object(
    'currentWindowId', (select window_id from staff_window_assignments where user_id = auth.uid() and office_id = p_office_id),
    'expiresAt', (select expires_at from staff_window_assignments where user_id = auth.uid() and office_id = p_office_id),
    'windows', coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name,
      'occupied', a.user_id is not null, 'isMine', coalesce(a.user_id = auth.uid(), false))
      order by coalesce(nullif(regexp_replace(w.name, '\D', '', 'g'), '')::numeric, 2147483647), w.name), '[]'::jsonb)
  ) into result from windows w left join staff_window_assignments a on a.window_id = w.id
    where w.office_id = p_office_id and w.is_active;
  return result;
end;
$$;

create function switch_staff_window(p_window_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_office uuid;
begin
  select office_id into v_office from windows where id = p_window_id;
  if v_office is null or auth_office_id() is distinct from v_office then raise exception 'Forbidden'; end if;
  perform 1 from offices where id = v_office for update;
  if not exists (select 1 from windows where id = p_window_id and is_active) then raise exception 'This window is inactive'; end if;
  delete from staff_window_assignments where office_id = v_office and expires_at <= clock_timestamp();
  if exists (select 1 from staff_window_assignments where window_id = p_window_id and user_id <> auth.uid()) then
    raise exception 'WINDOW_OCCUPIED: Another staff member is assigned to this window. Choose an available window.';
  end if;
  insert into staff_window_assignments(user_id, window_id, office_id, expires_at)
    values(auth.uid(), p_window_id, v_office, clock_timestamp() + interval '2 minutes')
    on conflict(user_id) do update set window_id = excluded.window_id,
      office_id = excluded.office_id, expires_at = excluded.expires_at;
  return get_staff_window_state(v_office);
end;
$$;

create function release_staff_window()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_office uuid := auth_office_id();
begin
  if v_office is null then raise exception 'Forbidden'; end if;
  perform 1 from offices where id = v_office for update;
  delete from staff_window_assignments where user_id = auth.uid() and office_id = v_office;
end;
$$;

-- RLS protects direct writes; the trigger also checks ownership after obtaining
-- the same office lock as switching, avoiding a stale-authorization race.
drop policy "Staff insert own daily quotas" on window_daily_quotas;
drop policy "Staff update own daily quotas" on window_daily_quotas;
create policy "Staff insert assigned window quotas" on window_daily_quotas
  for insert to authenticated with check (office_id = auth_office_id() and owns_staff_window(window_id));
create policy "Staff update assigned window quotas" on window_daily_quotas
  for update to authenticated using (office_id = auth_office_id() and owns_staff_window(window_id))
  with check (office_id = auth_office_id() and owns_staff_window(window_id));
create function guard_quota_window_assignment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_staff_window(new.window_id);
  return new;
end;
$$;
create trigger check_quota_window_assignment before insert or update on window_daily_quotas
  for each row execute function guard_quota_window_assignment();

drop policy "Staff update own office reservations" on reservations;
create policy "Staff update assigned window reservations" on reservations
  for update to authenticated using (office_id = auth_office_id() and owns_staff_window(window_id))
  with check (office_id = auth_office_id() and owns_staff_window(window_id));
create function guard_direct_staff_queue_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- Queue RPCs execute as their owner and validate the receiving window before
  -- dispatching. Direct API updates execute as the staff role instead.
  if current_user in ('anon', 'authenticated') then
    perform assert_staff_window(old.window_id);
    if new.window_id is distinct from old.window_id then
      raise exception 'Use the queue controls for your assigned window';
    end if;
  end if;
  return new;
end;
$$;
create trigger check_direct_staff_queue_update before update on reservations
  for each row execute function guard_direct_staff_queue_update();

create or replace function dispatch_window_queue(p_window_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare current_ticket uuid; next_ticket uuid;
begin
  perform assert_staff_window(p_window_id);
  if p_mode is null or p_mode not in ('call_next', 'skip_current') then raise exception 'Invalid mode'; end if;
  select id into current_ticket from reservations
    where window_id = p_window_id and status = 'serving'
      and queue_date = (now() at time zone 'Asia/Manila')::date
    order by called_at asc nulls last, created_at, id limit 1 for update;
  if current_ticket is not null then
    update reservations set status = case when p_mode = 'skip_current' then 'skipped' else 'completed' end,
      called_at = coalesce(called_at, now()) where id = current_ticket;
  elsif p_mode = 'skip_current' then raise exception 'No currently serving ticket for this window'; end if;
  -- Priority is respected within this window. An operator must not take a
  -- ticket from another window's queue, including through automatic dispatch.
  select id into next_ticket from reservations
    where window_id = p_window_id and status = 'waiting'
      and queue_date = (now() at time zone 'Asia/Manila')::date
    order by is_priority desc, created_at, id limit 1 for update;
  if next_ticket is not null then
    update reservations set status = 'serving', called_at = now() where id = next_ticket;
  end if;
end;
$$;

-- Recall is a database event, rather than a client-supplied public broadcast.
-- Only the assigned operator can publish it; public displays can read it.
create table window_recalls (
  window_id uuid primary key references windows(id) on delete cascade,
  office_id uuid not null references offices(id),
  nonce uuid not null default gen_random_uuid(),
  payload jsonb not null
);
alter table window_recalls enable row level security;
create policy "Anyone can read window recalls" on window_recalls for select using (true);
revoke all on window_recalls from anon, authenticated;
grant select on window_recalls to anon, authenticated;
create function recall_window_ticket(p_window_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ticket reservations%rowtype; v_office uuid; v_name text;
begin
  perform assert_staff_window(p_window_id);
  select office_id, name into v_office, v_name from windows where id = p_window_id;
  select * into ticket from reservations where window_id = p_window_id and status = 'serving'
    and queue_date = (now() at time zone 'Asia/Manila')::date order by called_at desc nulls last limit 1;
  if not found then raise exception 'No ticket is currently being served at this window'; end if;
  insert into window_recalls(window_id, office_id, payload)
    values(p_window_id, v_office, jsonb_build_object('windowId', p_window_id,
      'queueNumber', ticket.queue_number, 'windowName', v_name, 'studentName', ticket.student_name))
    on conflict(window_id) do update set nonce = gen_random_uuid(), payload = excluded.payload;
end;
$$;
alter publication supabase_realtime add table window_recalls;

create function guard_occupied_window_close()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from offices where id = new.office_id for update;
  if old.is_active and not new.is_active and exists (
    select 1 from staff_window_assignments where window_id = old.id and expires_at > clock_timestamp()
  ) then raise exception 'A staff member is assigned to this window. Ask them to release it before closing it.'; end if;
  return new;
end;
$$;
create trigger check_occupied_window_close before update on windows
  for each row execute function guard_occupied_window_close();

-- Office-wide rebalancing must not be callable by an individual window operator.
revoke all on function rebalance_waiting_tickets(uuid) from authenticated;

-- Shared office controls are administrative; individual operators must not
-- reconfigure other windows or the display used by the entire office.
drop policy "Staff insert own office windows" on windows;
drop policy "Staff update own office windows" on windows;
create policy "Super admin inserts office windows" on windows for insert to authenticated
  with check (is_super_admin() and office_id = auth_office_id());
create policy "Super admin updates office windows" on windows for update to authenticated
  using (is_super_admin() and office_id = auth_office_id())
  with check (is_super_admin() and office_id = auth_office_id());
drop policy "Staff update own office display_settings" on display_settings;
create policy "Super admin updates office display" on display_settings for update to authenticated
  using (is_super_admin() and office_id = auth_office_id())
  with check (is_super_admin() and office_id = auth_office_id());
alter function set_office_window_count(uuid, integer) rename to set_office_window_count_internal;
revoke all on function set_office_window_count_internal(uuid, integer) from public, anon, authenticated;
create function set_office_window_count(p_office_id uuid, p_count integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_super_admin() or auth_office_id() is distinct from p_office_id then raise exception 'Only the super admin can configure office windows'; end if;
  return set_office_window_count_internal(p_office_id, p_count);
end;
$$;
revoke all on function set_office_window_count(uuid, integer) from public;
grant execute on function set_office_window_count(uuid, integer) to authenticated;

revoke all on function owns_staff_window(uuid) from public;
revoke all on function assert_staff_window(uuid) from public;
revoke all on function get_staff_window_state(uuid) from public;
revoke all on function switch_staff_window(uuid) from public;
revoke all on function release_staff_window() from public;
revoke all on function guard_quota_window_assignment() from public;
revoke all on function guard_direct_staff_queue_update() from public;
revoke all on function dispatch_window_queue(uuid, text) from public;
revoke all on function recall_window_ticket(uuid) from public;
revoke all on function guard_occupied_window_close() from public;
grant execute on function owns_staff_window(uuid), assert_staff_window(uuid),
  get_staff_window_state(uuid), switch_staff_window(uuid), release_staff_window(),
  dispatch_window_queue(uuid, text), recall_window_ticket(uuid) to authenticated;
notify pgrst, 'reload schema';
