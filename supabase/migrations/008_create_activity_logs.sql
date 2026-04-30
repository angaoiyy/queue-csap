create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_user_id uuid null,
  actor_email text null,
  entity_type text null,
  entity_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_logs_created_at
  on activity_logs(created_at desc);
create index if not exists idx_activity_logs_action
  on activity_logs(action);
create index if not exists idx_activity_logs_actor_user_id
  on activity_logs(actor_user_id);

alter table activity_logs enable row level security;

drop policy if exists "Authenticated users can read activity logs" on activity_logs;
create policy "Authenticated users can read activity logs"
  on activity_logs
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert activity logs" on activity_logs;
create policy "Authenticated users can insert activity logs"
  on activity_logs
  for insert
  with check (auth.role() = 'authenticated');
