-- Priority tickets are pre-assigned a window_id at creation (round-robin load balance),
-- but dispatch_window_queue only ever picked next ticket where window_id = p_window_id.
-- Result: a priority ticket assigned to Window 2 never gets called when Window 1 calls
-- next, so it sits "waiting" indefinitely instead of cutting the line. Priority tickets
-- must be callable by whichever window calls next, not locked to their pre-assigned one.
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
    and queue_date = v_today
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
