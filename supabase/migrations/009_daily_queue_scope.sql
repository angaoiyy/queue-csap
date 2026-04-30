alter table reservations
add column if not exists queue_date date;

update reservations
set queue_date = (created_at at time zone 'Asia/Manila')::date
where queue_date is null;

alter table reservations
alter column queue_date set default (now() at time zone 'Asia/Manila')::date;

alter table reservations
alter column queue_date set not null;

create index if not exists idx_reservations_queue_date_status_created_at
  on reservations(queue_date, status, created_at);

create or replace function dispatch_window_queue(p_window_id uuid, p_mode text)
returns void
language plpgsql
security definer
as $$
declare
  current_ticket_id uuid;
  next_ticket_id uuid;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if p_mode not in ('call_next', 'skip_current') then
    raise exception 'Invalid mode: %', p_mode;
  end if;

  select id
  into current_ticket_id
  from reservations
  where window_id = p_window_id
    and status = 'serving'
    and queue_date = v_today
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
    and window_id = p_window_id
    and queue_date = v_today
  order by created_at asc
  limit 1
  for update skip locked;

  if next_ticket_id is not null then
    update reservations
    set
      status = 'serving',
      called_at = now()
    where id = next_ticket_id;
  end if;
end;
$$;

create or replace function rebalance_waiting_tickets()
returns void
language plpgsql
security definer
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
  where is_active = true;

  if window_count = 0 or active_window_ids is null then
    return;
  end if;

  for ticket in
    select id
    from reservations
    where status = 'waiting'
      and queue_date = v_today
    order by created_at asc
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
