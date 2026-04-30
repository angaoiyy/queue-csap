create table if not exists windows (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into windows (name, is_active)
values
  ('Window 1', true),
  ('Window 2', true),
  ('Window 3', true)
on conflict (name) do nothing;

alter table reservations
add column if not exists window_id uuid references windows(id),
add column if not exists called_at timestamptz;

create index if not exists idx_reservations_status_created_at
  on reservations(status, created_at);
create index if not exists idx_reservations_window_status
  on reservations(window_id, status);

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
  order by created_at asc
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
