-- Multi-office support (part 5): the real reason the Activity Logs dashboard is
-- empty. Two independent defects on this database, both proven by probing the
-- live REST API:
--
--   1. activity_logs is MISSING the actor_user_id / actor_email columns.
--      Migration 008 defines them, but 008 uses `create table if not exists`
--      and the table already existed from an earlier shape, so 008's column
--      list was silently skipped. Every logActivity() insert then fails with
--      PostgREST PGRST204 ("Could not find the 'actor_email' column of
--      'activity_logs' in the schema cache") and logActivity swallows the error.
--
--   2. The INSERT policy is still auth-gated. Migration 020 made it permissive
--      for exactly the public /reserve kiosk (which writes as the anon role),
--      but that fix never landed on this DB. Anon inserts get
--      "42501: new row violates row-level security policy for table
--      activity_logs".
--
-- Fixing only one leaves the logs empty. This migration fixes both, is
-- drift-safe, and is safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Restore the missing columns (matches migration 008's intent).
-- ---------------------------------------------------------------------------
alter table activity_logs add column if not exists actor_user_id uuid;
alter table activity_logs add column if not exists actor_email text;
create index if not exists idx_activity_logs_actor_user_id
  on activity_logs(actor_user_id);

-- ---------------------------------------------------------------------------
-- 2. Rebuild RLS: drop EVERY existing policy (names/shapes have drifted), then
--    recreate the deterministic set - same approach 024 used elsewhere.
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

-- SELECT: any authenticated staff member. The dashboard already scopes every
-- query with `.eq("office_id", ...)`, so a broad authenticated read is safe and
-- keeps the Accounting <-> Registrar views working without depending on a
-- profiles row existing for every user.
create policy "Authenticated users can read activity logs"
  on activity_logs
  for select
  using ((select auth.role()) = 'authenticated');

-- No UPDATE/DELETE policy: activity_logs is append-only.

-- ---------------------------------------------------------------------------
-- 3. Backfill office_id from metadata for any rows that slipped through without
--    one, so they are not invisible to the office-scoped dashboard queries.
-- ---------------------------------------------------------------------------
update activity_logs al
set office_id = (al.metadata ->> 'office_id')::uuid
where al.office_id is null
  and (al.metadata ->> 'office_id') is not null
  and (al.metadata ->> 'office_id') ~ '^[0-9a-fA-F-]{36}$';

-- ---------------------------------------------------------------------------
-- 3b. Reconstruct the history that was lost while inserts were failing. Every
--     reservation row is a "reservation_created" event; every reservation that
--     was ever called (called_at set) is a call_next / skip_ticket event.
--     Both inserts are guarded so re-running this migration is a no-op.
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
-- 4. Realtime: the Activity Logs table subscribes to postgres_changes on
--    activity_logs, but the table was never in the publication so new rows
--    never streamed in live. Own DO block with a broad catch so a publication
--    hiccup cannot roll back the fixes above.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table activity_logs;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Office index (from 023; repeated for DBs that missed it).
-- ---------------------------------------------------------------------------
create index if not exists idx_activity_logs_office
  on activity_logs(office_id, created_at desc);

notify pgrst, 'reload schema';
