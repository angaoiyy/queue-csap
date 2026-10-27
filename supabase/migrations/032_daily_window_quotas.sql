-- Daily, opt-in limits on waiting + serving tickets. All admission paths share
-- an office row lock; selection and insertion must never be separate requests.
create or replace function valid_quota_periods(p_periods jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  p jsonb;
  previous_end text := '';
begin
  if jsonb_typeof(p_periods) is distinct from 'array' then return false; end if;
  for p in select value from jsonb_array_elements(p_periods) order by value->>'start' loop
    if jsonb_typeof(p) is distinct from 'object'
      or coalesce(p->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(p->>'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (p->>'start') >= (p->>'end')
      or (p->>'start') < previous_end
      or jsonb_typeof(p->'capacity') is distinct from 'number'
      or coalesce(p->>'capacity', '') !~ '^[1-9][0-9]*$'
      or (p->>'capacity')::numeric > 2147483647
    then return false; end if;
    previous_end := p->>'end';
  end loop;
  return true;
end;
$$;

create table if not exists window_daily_quotas (
  window_id uuid not null references windows(id) on delete cascade,
  office_id uuid not null references offices(id),
  quota_date date not null,
  enabled boolean not null default false,
  periods jsonb not null default '[]'::jsonb,
  primary key (window_id, quota_date),
  check (valid_quota_periods(periods)),
  check (not enabled or jsonb_array_length(periods) > 0)
);
create index if not exists idx_window_daily_quotas_office_date
  on window_daily_quotas(office_id, quota_date);
create index if not exists idx_reservations_window_active_quota
  on reservations(office_id, queue_date, window_id)
  where status in ('waiting', 'serving');

alter table window_daily_quotas enable row level security;
create policy "Anyone can read daily quotas" on window_daily_quotas
  for select using (true);
create policy "Staff insert own daily quotas" on window_daily_quotas
  for insert with check (office_id = (select auth_office_id()));
create policy "Staff update own daily quotas" on window_daily_quotas
  for update using (office_id = (select auth_office_id()))
  with check (office_id = (select auth_office_id()));
grant select on window_daily_quotas to anon, authenticated;
grant insert, update on window_daily_quotas to authenticated;

-- NULL = unlimited, 0 = closed, positive integer = current period's limit.
-- p_at is explicit so boundaries and date expiry can be tested deterministically.
create or replace function window_quota_capacity(p_window_id uuid, p_at timestamptz default now())
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  q window_daily_quotas%rowtype;
  capacity integer;
begin
  select * into q from window_daily_quotas
    where window_id = p_window_id and quota_date = (p_at at time zone 'Asia/Manila')::date;
  if not found or not q.enabled then return null; end if;
  select (p->>'capacity')::integer into capacity
    from jsonb_array_elements(q.periods) p
    where (p_at at time zone 'Asia/Manila')::time >= (p->>'start')::time
      and (p_at at time zone 'Asia/Manila')::time < (p->>'end')::time;
  return coalesce(capacity, 0);
end;
$$;

create or replace function window_active_count(p_window_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from reservations
  where window_id = p_window_id
    and queue_date = (now() at time zone 'Asia/Manila')::date
    and status in ('waiting', 'serving');
$$;

create or replace function window_accepts_ticket(p_window_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from windows w where w.id = p_window_id and w.is_active
      and (window_quota_capacity(w.id) is null
        or window_active_count(w.id) < window_quota_capacity(w.id))
  );
$$;

create or replace function get_window_quota_availability(p_office_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'date', (now() at time zone 'Asia/Manila')::date,
    'windows', coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'name', w.name,
      'enabled', coalesce(q.enabled, false),
      'periods', coalesce(q.periods, '[]'::jsonb),
      'capacity', window_quota_capacity(w.id),
      'activeCount', window_active_count(w.id),
      'nextStart', (select min(p->>'start') from jsonb_array_elements(coalesce(q.periods, '[]'::jsonb)) p
        where q.enabled and (p->>'start')::time > (now() at time zone 'Asia/Manila')::time)
    ) order by coalesce(nullif(regexp_replace(w.name, '\D', '', 'g'), '')::integer, 2147483647), w.name), '[]'::jsonb)
  ) from windows w
  left join window_daily_quotas q on q.window_id = w.id
    and q.quota_date = (now() at time zone 'Asia/Manila')::date
  where w.office_id = p_office_id and w.is_active;
$$;

create or replace function guard_daily_window_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from offices where id = new.office_id for update;
  if new.quota_date <> (now() at time zone 'Asia/Manila')::date then
    raise exception 'The date has changed. Reopen Configure Quotas to edit today.';
  end if;
  if not exists (select 1 from windows where id = new.window_id and office_id = new.office_id) then
    raise exception 'Window does not belong to this office';
  end if;
  if tg_op = 'UPDATE' and (new.window_id, new.office_id, new.quota_date)
    is distinct from (old.window_id, old.office_id, old.quota_date) then
    raise exception 'Quota identity cannot be changed';
  end if;
  return new;
end;
$$;
create trigger guard_daily_window_quota before insert or update on window_daily_quotas
  for each row execute function guard_daily_window_quota();

create or replace function log_daily_window_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activity_logs(action, office_id, actor_user_id, actor_email, entity_type, entity_id, metadata)
  values ('window_quota_changed', new.office_id, auth.uid(), auth.jwt()->>'email', 'window', new.window_id::text,
    jsonb_build_object('office_id', new.office_id, 'window_id', new.window_id,
      'window_name', (select name from windows where id = new.window_id),
      'quota_date', new.quota_date, 'enabled', new.enabled, 'periods', new.periods,
      'previous', case when tg_op = 'UPDATE' then to_jsonb(old) else null end));
  return new;
end;
$$;
create trigger log_daily_window_quota after insert or update on window_daily_quotas
  for each row execute function log_daily_window_quota();

create or replace function guard_reservation_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prefix text;
  ticket_sequence bigint;
begin
  perform 1 from offices where id = new.office_id for update;
  if tg_op = 'INSERT' then
    if new.queue_date <> (now() at time zone 'Asia/Manila')::date or new.status <> 'waiting' then
      raise exception 'New reservations must join today''s waiting queue';
    end if;
    -- Assignment and the capacity check run under the same office lock.
    select w.id into new.window_id from windows w
    where w.office_id = new.office_id and window_accepts_ticket(w.id)
    order by window_active_count(w.id),
      coalesce(nullif(regexp_replace(w.name, '\D', '', 'g'), '')::integer, 2147483647), w.name
    limit 1;
    if new.window_id is null then
      raise exception using errcode = 'P0001', message = 'QUOTA_UNAVAILABLE';
    end if;
    if new.application_type = 'old' then
      select i.prefix into prefix from inquiry_types i
      where i.office_id = new.office_id and i.label = new.inquiry_type and i.is_active;
    elsif new.application_type = 'new' then
      select i.prefix into prefix from admission_inquiry_types i
      where i.office_id = new.office_id and i.label = new.inquiry_type and i.is_active;
    end if;
    if prefix is null then raise exception 'Invalid inquiry type'; end if;
    select count(*) + 1 into ticket_sequence from reservations
      where office_id = new.office_id and queue_date = new.queue_date
        and inquiry_type = new.inquiry_type and application_type = new.application_type;
    select count(*) + 1 into new.position from reservations
      where office_id = new.office_id and queue_date = new.queue_date
        and inquiry_type = new.inquiry_type and application_type = new.application_type
        and status in ('waiting', 'serving');
    new.queue_number := prefix || lpad(ticket_sequence::text, greatest(3, length(ticket_sequence::text)), '0');
    new.created_at := now();
  else
    if (new.office_id, new.queue_date) is distinct from (old.office_id, old.queue_date) then
      raise exception 'Reservation office and queue date cannot be changed';
    end if;
    if new.status in ('waiting', 'serving') and
      (old.status not in ('waiting', 'serving') or new.window_id is distinct from old.window_id) then
      if new.queue_date <> (now() at time zone 'Asia/Manila')::date
        or not exists (select 1 from windows where id = new.window_id and office_id = new.office_id)
        or not window_accepts_ticket(new.window_id) then
        raise exception using errcode = 'P0001', message = 'QUOTA_UNAVAILABLE';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_reservation_quota before insert or update on reservations
  for each row execute function guard_reservation_quota();

-- Reassign displaced tickets first. Existing assignments remain valid after a
-- quota reduction or closing time; optional balancing never overfills a window.
create or replace function rebalance_waiting_tickets(p_office_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ticket record;
  target uuid;
begin
  if auth_office_id() is distinct from p_office_id then raise exception 'Forbidden'; end if;
  perform 1 from offices where id = p_office_id for update;
  for ticket in
    select r.id, r.window_id, coalesce(w.is_active, false) as source_active
    from reservations r left join windows w on w.id = r.window_id
    where r.office_id = p_office_id and r.queue_date = (now() at time zone 'Asia/Manila')::date
      and r.status = 'waiting'
    order by coalesce(w.is_active, false), r.is_priority desc, r.created_at, r.id
    for update of r
  loop
    target := null;
    select w.id into target from windows w
    where w.office_id = p_office_id and w.id is distinct from ticket.window_id
      and window_accepts_ticket(w.id)
      and (not ticket.source_active or window_active_count(w.id) + 1 < window_active_count(ticket.window_id))
    order by window_active_count(w.id),
      coalesce(nullif(regexp_replace(w.name, '\D', '', 'g'), '')::integer, 2147483647), w.name limit 1;
    if target is not null then
      update reservations set window_id = target where id = ticket.id;
    elsif not ticket.source_active then
      raise exception 'Cannot close window: remaining windows have insufficient capacity. Adjust quotas or finish its queue first.';
    end if;
  end loop;
end;
$$;

create or replace function guard_window_quota_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from offices where id = new.office_id for update;
  if tg_op = 'UPDATE' then
    if new.office_id is distinct from old.office_id then raise exception 'Window office cannot be changed'; end if;
    if old.is_active and not new.is_active and exists (
      select 1 from reservations where window_id = new.id and status = 'serving'
        and queue_date = (now() at time zone 'Asia/Manila')::date
    ) then
      raise exception 'Finish the ticket currently being served before closing this window';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_window_quota_change before insert or update on windows
  for each row execute function guard_window_quota_change();

create or replace function rebalance_closed_window()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_active and not new.is_active then perform rebalance_waiting_tickets(new.office_id); end if;
  return new;
end;
$$;
create trigger rebalance_closed_window after update on windows
  for each row execute function rebalance_closed_window();

create or replace function set_office_window_count(p_office_id uuid, p_count integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  previous_count integer;
  total integer;
  next_number integer := 1;
  active_ids uuid[];
begin
  if auth_office_id() is distinct from p_office_id then raise exception 'Forbidden'; end if;
  if p_count is null or p_count < 1 or p_count > 20 then raise exception 'Window count must be between 1 and 20'; end if;
  perform 1 from offices where id = p_office_id for update;
  select count(*) into previous_count from windows where office_id = p_office_id and is_active;
  select count(*) into total from windows where office_id = p_office_id;
  while total < p_count loop
    if not exists (select 1 from windows where office_id = p_office_id and name = 'Window ' || next_number) then
      insert into windows(office_id, name, is_active) values(p_office_id, 'Window ' || next_number, true);
      total := total + 1;
    end if;
    next_number := next_number + 1;
  end loop;
  select array_agg(id) into active_ids from (
    select id from windows where office_id = p_office_id
    order by coalesce(nullif(regexp_replace(name, '\D', '', 'g'), '')::integer, 2147483647), name limit p_count
  ) chosen;
  update windows set is_active = true where office_id = p_office_id and id = any(active_ids) and not is_active;
  update windows set is_active = false where office_id = p_office_id and not (id = any(active_ids)) and is_active;
  perform rebalance_waiting_tickets(p_office_id);
  return jsonb_build_object('previous_count', previous_count, 'active_window_ids', active_ids);
end;
$$;

create or replace function dispatch_window_queue(p_window_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_ticket_id uuid;
  next_ticket_id uuid;
  v_office_id uuid;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select office_id into v_office_id from windows where id = p_window_id and is_active;
  if v_office_id is null then raise exception 'Unknown or inactive window'; end if;
  if auth_office_id() is distinct from v_office_id then raise exception 'Forbidden'; end if;
  if p_mode is null or p_mode not in ('call_next', 'skip_current') then raise exception 'Invalid mode'; end if;
  perform 1 from offices where id = v_office_id for update;
  -- Recheck after obtaining the lock in case the window was just deactivated.
  if not exists (select 1 from windows where id = p_window_id and is_active) then raise exception 'Inactive window'; end if;
  select id into current_ticket_id from reservations
    where window_id = p_window_id and office_id = v_office_id and status = 'serving' and queue_date = v_today
    order by called_at asc nulls last, created_at, id limit 1 for update;
  if current_ticket_id is not null then
    update reservations set status = case when p_mode = 'skip_current' then 'skipped' else 'completed' end,
      called_at = coalesce(called_at, now()) where id = current_ticket_id;
  elsif p_mode = 'skip_current' then raise exception 'No currently serving ticket for this window'; end if;
  select id into next_ticket_id from reservations
    where office_id = v_office_id and queue_date = v_today and status = 'waiting'
      and (window_id = p_window_id or (is_priority and window_accepts_ticket(p_window_id)))
    order by is_priority desc, created_at, id limit 1 for update;
  if next_ticket_id is not null then
    update reservations set status = 'serving', window_id = p_window_id, called_at = now() where id = next_ticket_id;
  end if;
end;
$$;

-- Internal helpers are usable by their owning functions/triggers only.
revoke all on function window_quota_capacity(uuid, timestamptz) from public;
revoke all on function window_active_count(uuid) from public;
revoke all on function window_accepts_ticket(uuid) from public;
revoke all on function guard_daily_window_quota() from public;
revoke all on function log_daily_window_quota() from public;
revoke all on function guard_reservation_quota() from public;
revoke all on function guard_window_quota_change() from public;
revoke all on function rebalance_closed_window() from public;
revoke all on function get_window_quota_availability(uuid) from public;
revoke all on function set_office_window_count(uuid, integer) from public;
revoke all on function rebalance_waiting_tickets(uuid) from public;
revoke all on function dispatch_window_queue(uuid, text) from public;
grant execute on function get_window_quota_availability(uuid) to anon, authenticated;
grant execute on function set_office_window_count(uuid, integer) to authenticated;
grant execute on function rebalance_waiting_tickets(uuid) to authenticated;
grant execute on function dispatch_window_queue(uuid, text) to authenticated;

notify pgrst, 'reload schema';
