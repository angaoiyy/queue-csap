-- Activity Logs dashboard is still empty because migration 026 never landed on
-- the live database. Probing the REST API shows:
--
--   * activity_logs.actor_user_id / actor_email do not exist (42703), so every
--     logActivity() insert fails and the error is swallowed.
--   * the table still carries its pre-008 shape: legacy "user-id" and "email"
--     columns. If those are NOT NULL, inserts (and 026's backfill) fail, which
--     rolls the whole of 026 back when it is run as one statement batch.
--
-- This migration is self-contained: it neutralises the legacy shape first and
-- then repeats 026's steps. Everything is idempotent, so it is safe to run
-- whether or not 026 was partially applied, and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Neutralise the legacy shape so inserts from the app cannot be rejected.
-- ---------------------------------------------------------------------------
alter table activity_logs add column if not exists office_id uuid references offices(id);
alter table activity_logs add column if not exists entity_type text;
alter table activity_logs add column if not exists entity_id text;
alter table activity_logs add column if not exists metadata jsonb;
alter table activity_logs add column if not exists created_at timestamptz;

update activity_logs set metadata = '{}'::jsonb where metadata is null;
update activity_logs set created_at = now() where created_at is null;
alter table activity_logs alter column metadata set default '{}'::jsonb;
alter table activity_logs alter column created_at set default now();

-- Any other NOT NULL column (e.g. legacy "user-id" / "email") is never written
-- by the app, so it must be nullable.
do $$
declare
  c record;
begin
  for c in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_logs'
      and is_nullable = 'NO'
      and column_name not in ('id', 'action', 'metadata', 'created_at')
  loop
    execute format(
      'alter table activity_logs alter column %I drop not null',
      c.column_name
    );
  end loop;
end $$;

-- Legacy CHECK constraints (e.g. an old allowed-actions list) would reject the
-- current action names.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.activity_logs'::regclass
      and contype = 'c'
  loop
    execute format('alter table activity_logs drop constraint %I', c.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Restore the columns logActivity() writes (matches migration 008's intent).
-- ---------------------------------------------------------------------------
alter table activity_logs add column if not exists actor_user_id uuid;
alter table activity_logs add column if not exists actor_email text;
create index if not exists idx_activity_logs_actor_user_id
  on activity_logs(actor_user_id);

-- ---------------------------------------------------------------------------
-- 2. Rebuild RLS: drop every existing policy, recreate the deterministic set.
-- ---------------------------------------------------------------------------
alter table activity_logs enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'activity_logs'
  loop
    execute format('drop policy if exists %I on activity_logs', r.policyname);
  end loop;
end $$;

-- INSERT: written by trusted server actions, including the anonymous kiosk
-- reservation flow. Mirrors reservations' own "Anyone can insert" policy.
create policy "Anyone can insert activity logs"
  on activity_logs
  for insert
  with check (true);

-- SELECT: any authenticated staff member; the dashboard scopes by office_id.
create policy "Authenticated users can read activity logs"
  on activity_logs
  for select
  using ((select auth.role()) = 'authenticated');

-- No UPDATE/DELETE policy: activity_logs is append-only.

-- ---------------------------------------------------------------------------
-- 3. Backfill office_id from metadata for rows that were logged without one.
-- ---------------------------------------------------------------------------
update activity_logs al
set office_id = (al.metadata ->> 'office_id')::uuid
where al.office_id is null
  and (al.metadata ->> 'office_id') is not null
  and (al.metadata ->> 'office_id') ~ '^[0-9a-fA-F-]{36}$';

-- ---------------------------------------------------------------------------
-- 4. Reconstruct the history lost while inserts were failing. Guarded so a
--    re-run is a no-op.
-- ---------------------------------------------------------------------------
insert into activity_logs (action, office_id, entity_type, entity_id, metadata, created_at)
select
  'reservation_created',
  r.office_id,
  'reservation',
  r.id::text,
  jsonb_build_object(
    'office_id', r.office_id,
    'queue_number', r.queue_number,
    'inquiry_type', r.inquiry_type,
    'priority_type', r.priority_type,
    'window_id', r.window_id,
    'window_name', w.name,
    'student_id', r.student_id,
    'student_name', r.student_name,
    'backfilled', true
  ),
  r.created_at
from reservations r
left join windows w on w.id = r.window_id
where not exists (
  select 1 from activity_logs al
  where al.action = 'reservation_created'
    and al.entity_id = r.id::text
);

insert into activity_logs (action, office_id, entity_type, entity_id, metadata, created_at)
select
  case when r.status = 'skipped' then 'skip_ticket' else 'call_next' end,
  r.office_id,
  'window',
  r.window_id::text,
  jsonb_build_object(
    'office_id', r.office_id,
    'window_id', r.window_id,
    'window_name', w.name,
    'now_serving_queue', r.queue_number,
    'now_serving_inquiry_type', r.inquiry_type,
    'now_serving_reservation_id', r.id,
    'backfilled', true
  ),
  r.called_at
from reservations r
left join windows w on w.id = r.window_id
where r.called_at is not null
  and r.window_id is not null
  and not exists (
    select 1 from activity_logs al
    where al.action in ('call_next', 'skip_ticket')
      and al.entity_id = r.window_id::text
      and al.created_at = r.called_at
  );

-- ---------------------------------------------------------------------------
-- 5. Realtime + office index.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table activity_logs;
exception when others then null;
end $$;

create index if not exists idx_activity_logs_office
  on activity_logs(office_id, created_at desc);

notify pgrst, 'reload schema';
