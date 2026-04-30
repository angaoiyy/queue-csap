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
