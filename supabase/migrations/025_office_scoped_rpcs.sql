-- Multi-office support (part 4): scope the dispatch + rebalance RPCs to one office.
-- Both are SECURITY DEFINER (they bypass RLS), so callers in the app layer must
-- also verify office ownership before invoking them.

-- rebalance_waiting_tickets gains a p_office_id argument -> the old zero-arg
-- version must be dropped, not replaced (different signature = overload).
drop function if exists rebalance_waiting_tickets();

create or replace function rebalance_waiting_tickets(p_office_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_window_ids uuid[];
  window_count int;
  ticket record;
  idx int := 1;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select array_agg(id order by name), count(*)
  into active_window_ids, window_count
  from windows
  where is_active = true
    and office_id = p_office_id;

  if window_count = 0 or active_window_ids is null then
    return;
  end if;

  for ticket in
    select id
    from reservations
    where status = 'waiting'
      and queue_date = v_today
      and office_id = p_office_id
    order by is_priority desc, created_at asc
    for update
  loop
    update reservations
    set window_id = active_window_ids[idx]
    where id = ticket.id;

    idx := idx + 1;
    if idx > window_count then
      idx := 1;
    end if;
  end loop;
end;
$$;

-- dispatch_window_queue: derive the window's office and scope both the
-- currently-serving lookup and the next-waiting lookup to it. The priority
-- branch (is_priority = true) is the one that spans windows, so without the
-- office filter one office's window could call the other office's priority
-- ticket.
create or replace function dispatch_window_queue(p_window_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_ticket_id uuid;
  next_ticket_id uuid;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_office_id uuid;
begin
  if p_mode not in ('call_next', 'skip_current') then
    raise exception 'Invalid mode: %', p_mode;
  end if;

  select office_id into v_office_id from windows where id = p_window_id;
  if v_office_id is null then
    raise exception 'Unknown window: %', p_window_id;
  end if;

  select id
  into current_ticket_id
  from reservations
  where window_id = p_window_id
    and status = 'serving'
    and queue_date = v_today
    and office_id = v_office_id
  order by called_at asc nulls last, created_at asc
  limit 1
  for update;

  if current_ticket_id is not null then
    update reservations
    set
      status = case when p_mode = 'skip_current' then 'skipped' else 'completed' end,
      called_at = coalesce(called_at, now())
    where id = current_ticket_id;
  elsif p_mode = 'skip_current' then
    raise exception 'No currently serving ticket for this window';
  end if;

  select id
  into next_ticket_id
  from reservations
  where status = 'waiting'
    and queue_date = v_today
    and office_id = v_office_id
    and (is_priority = true or window_id = p_window_id)
  order by is_priority desc, created_at asc
  limit 1
  for update skip locked;

  if next_ticket_id is not null then
    update reservations
    set
      status = 'serving',
      window_id = p_window_id,
      called_at = now()
    where id = next_ticket_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
