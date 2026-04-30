create or replace function dispatch_window_queue(p_window_id uuid, p_mode text)
returns void
language plpgsql
security definer
as $$
declare
  current_ticket_id uuid;
  next_ticket_id uuid;
begin
  if p_mode not in ('call_next', 'skip_current') then
    raise exception 'Invalid mode: %', p_mode;
  end if;

  select id
  into current_ticket_id
  from reservations
  where window_id = p_window_id
    and status = 'serving'
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
