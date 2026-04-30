create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_id text not null,
  department text not null,
  term_school_year text not null,
  service text not null,
  queue_number text not null,
  position int not null,
  status text not null default 'waiting',
  created_at timestamptz default now()
);

create index if not exists idx_reservations_service_status on reservations(service, status);
create index if not exists idx_reservations_position on reservations(service, position);

alter table reservations enable row level security;

drop policy if exists "Anyone can insert reservations" on reservations;
create policy "Anyone can insert reservations" on reservations for insert with check (true);

drop policy if exists "Anyone can read reservations" on reservations;
create policy "Anyone can read reservations" on reservations for select using (true);

drop policy if exists "Authenticated users can update reservations" on reservations;
create policy "Authenticated users can update reservations" on reservations
  for update using (auth.role() = 'authenticated');

-- Enable Realtime for live queue updates (run in Supabase Dashboard > Database > Replication if needed)
-- alter publication supabase_realtime add table reservations;
