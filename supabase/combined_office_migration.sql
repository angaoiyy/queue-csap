-- Combined multi-office migration (022 + 023 + 024 + 025 + 026).
-- Idempotent: safe to re-run the whole script.
-- Run in the Supabase SQL editor as one script.

-- ========================================================================
-- 022_create_offices.sql
-- ========================================================================
-- Multi-office support: introduce a generic `offices` table so the queue system
-- can serve more than one office (Accounting, Registrar, ...) from one deployment.
-- Every office-scoped table gets an `office_id` in 023. Adding a future office
-- should require only one row here (a trigger seeds its display_settings).

create table if not exists offices (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into offices (slug, label, sort_order)
select slug, label, sort_order
from (values
  ('accounting', 'Accounting Office', 0),
  ('registrar', 'Registrar Office', 1)
) as t(slug, label, sort_order)
where not exists (select 1 from offices);

alter table offices enable row level security;

drop policy if exists "Anyone can read offices" on offices;
create policy "Anyone can read offices" on offices for select using (true);

drop policy if exists "Authenticated can insert offices" on offices;
create policy "Authenticated can insert offices" on offices
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated can update offices" on offices;
create policy "Authenticated can update offices" on offices
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Realtime: add offices, and windows (the admin panel already subscribes to
-- windows but it was never added to the publication).
do $$ begin
  alter publication supabase_realtime add table offices;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table windows;
exception when duplicate_object then null;
end $$;


-- ========================================================================
-- 023_office_scoping.sql
-- ========================================================================
-- Multi-office support (part 2): add office_id to every office-scoped table,
-- backfill existing rows to the Accounting office, then lock the columns NOT NULL.
-- Also: per-office window names, reshape display_settings from a singleton row to
-- one row per office, seed the Registrar office, and copy Accounting's settings
-- lists to Registrar as an editable starting point.

-- ---------------------------------------------------------------------------
-- 1. Add office_id (nullable first)
-- ---------------------------------------------------------------------------
alter table reservations               add column if not exists office_id uuid references offices(id);
alter table windows                    add column if not exists office_id uuid references offices(id);
alter table school_years               add column if not exists office_id uuid references offices(id);
alter table departments                add column if not exists office_id uuid references offices(id);
alter table inquiry_types              add column if not exists office_id uuid references offices(id);
alter table admission_inquiry_types    add column if not exists office_id uuid references offices(id);
alter table degree_programs            add column if not exists office_id uuid references offices(id);
alter table purpose_of_request_options add column if not exists office_id uuid references offices(id);
alter table activity_logs              add column if not exists office_id uuid references offices(id);

-- ---------------------------------------------------------------------------
-- 2. Backfill existing data to Accounting
-- ---------------------------------------------------------------------------
do $$
declare
  v_acc uuid;
begin
  select id into v_acc from offices where slug = 'accounting';
  if v_acc is null then
    raise exception 'offices row for slug=accounting not found - run 022 first';
  end if;

  update reservations               set office_id = v_acc where office_id is null;
  update windows                    set office_id = v_acc where office_id is null;
  update school_years               set office_id = v_acc where office_id is null;
  update departments                set office_id = v_acc where office_id is null;
  update inquiry_types              set office_id = v_acc where office_id is null;
  update admission_inquiry_types    set office_id = v_acc where office_id is null;
  update degree_programs            set office_id = v_acc where office_id is null;
  update purpose_of_request_options set office_id = v_acc where office_id is null;
  update activity_logs              set office_id = v_acc where office_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Lock NOT NULL (activity_logs stays nullable - historical rows / system)
-- ---------------------------------------------------------------------------
alter table reservations               alter column office_id set not null;
alter table windows                    alter column office_id set not null;
alter table school_years               alter column office_id set not null;
alter table departments                alter column office_id set not null;
alter table inquiry_types              alter column office_id set not null;
alter table admission_inquiry_types    alter column office_id set not null;
alter table degree_programs            alter column office_id set not null;
alter table purpose_of_request_options alter column office_id set not null;

-- ---------------------------------------------------------------------------
-- 4. Window names are unique per office, not globally
-- ---------------------------------------------------------------------------
-- Drop any global unique on windows(name), whatever its name (schema drift-safe).
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.windows'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(name)%'
      and pg_get_constraintdef(oid) not ilike '%office_id%'
  loop
    execute format('alter table windows drop constraint %I', r.conname);
  end loop;
  for r in
    select indexname
    from pg_indexes
    where schemaname = 'public' and tablename = 'windows'
      and indexdef ilike '%unique%(name)%'
      and indexdef not ilike '%office_id%'
  loop
    execute format('drop index %I', r.indexname);
  end loop;
end $$;
create unique index if not exists windows_office_name_key on windows(office_id, name);

-- ---------------------------------------------------------------------------
-- 5. display_settings: singleton (id=1) -> one row per office (office_id PK)
--
-- display_settings is in the supabase_realtime publication, so it needs a
-- replica identity to be UPDATE-able. Dropping the old PK removes it, so switch
-- to REPLICA IDENTITY FULL for the reshape, then back to DEFAULT once the new
-- PK (office_id) exists.
-- ---------------------------------------------------------------------------
alter table display_settings replica identity full;

do $$
declare
  r record;
begin
  -- drop the id=1 CHECK (whatever its name) and the current primary key
  for r in
    select conname, contype
    from pg_constraint
    where conrelid = 'public.display_settings'::regclass
      and contype in ('c', 'p')
  loop
    execute format('alter table display_settings drop constraint %I', r.conname);
  end loop;
end $$;
alter table display_settings add column if not exists office_id uuid references offices(id);

update display_settings
set office_id = (select id from offices where slug = 'accounting')
where office_id is null;

alter table display_settings drop column if exists id;
alter table display_settings alter column office_id set not null;

do $$ begin
  alter table display_settings add primary key (office_id);
exception when invalid_table_definition then null;
end $$;

alter table display_settings replica identity default;

-- ---------------------------------------------------------------------------
-- 6. New office => auto-seed its display_settings row
-- ---------------------------------------------------------------------------
create or replace function create_office_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into display_settings (office_id, marquee_text)
  values (new.id, 'Please proceed to your assigned counter when your number is called')
  on conflict (office_id) do nothing;
  return new;
end $$;

drop trigger if exists offices_after_insert on offices;
create trigger offices_after_insert
  after insert on offices
  for each row execute function create_office_defaults();

-- Backfill display_settings for any office missing a row (Registrar, and any
-- office created before the trigger existed).
insert into display_settings (office_id)
select o.id
from offices o
where not exists (select 1 from display_settings d where d.office_id = o.id);

-- ---------------------------------------------------------------------------
-- 7. Seed Registrar windows + copy Accounting's settings lists to Registrar
-- ---------------------------------------------------------------------------
do $$
declare
  v_acc uuid;
  v_reg uuid;
begin
  select id into v_acc from offices where slug = 'accounting';
  select id into v_reg from offices where slug = 'registrar';
  if v_reg is null then
    return; -- no registrar office; nothing to seed
  end if;

  -- windows
  insert into windows (name, is_active, office_id)
  select v.name, true, v_reg
  from (values ('Window 1'), ('Window 2'), ('Window 3')) as v(name)
  where not exists (select 1 from windows w where w.office_id = v_reg);

  -- school_years
  insert into school_years (label, sort_order, is_active, office_id)
  select s.label, s.sort_order, s.is_active, v_reg
  from school_years s
  where s.office_id = v_acc
    and not exists (select 1 from school_years x where x.office_id = v_reg and x.label = s.label);

  -- departments
  insert into departments (label, requires_degree_program, sort_order, is_active, office_id)
  select d.label, d.requires_degree_program, d.sort_order, d.is_active, v_reg
  from departments d
  where d.office_id = v_acc
    and not exists (select 1 from departments x where x.office_id = v_reg and x.label = d.label);

  -- inquiry_types
  insert into inquiry_types (label, prefix, requires_purpose, sort_order, is_active, office_id)
  select i.label, i.prefix, i.requires_purpose, i.sort_order, i.is_active, v_reg
  from inquiry_types i
  where i.office_id = v_acc
    and not exists (select 1 from inquiry_types x where x.office_id = v_reg and x.label = i.label);

  -- admission_inquiry_types
  insert into admission_inquiry_types (label, prefix, requires_purpose, sort_order, is_active, office_id)
  select a.label, a.prefix, a.requires_purpose, a.sort_order, a.is_active, v_reg
  from admission_inquiry_types a
  where a.office_id = v_acc
    and not exists (select 1 from admission_inquiry_types x where x.office_id = v_reg and x.label = a.label);

  -- purpose_of_request_options
  insert into purpose_of_request_options (label, sort_order, is_active, office_id)
  select p.label, p.sort_order, p.is_active, v_reg
  from purpose_of_request_options p
  where p.office_id = v_acc
    and not exists (select 1 from purpose_of_request_options x where x.office_id = v_reg and x.label = p.label);

  -- degree_programs (remap department_id to the Registrar department with the same
  -- label; college_id, if present, is a shared reference and copied as-is).
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'degree_programs' and column_name = 'college_id'
  ) then
    insert into degree_programs (label, sort_order, is_active, office_id, department_id, college_id)
    select dp.label, dp.sort_order, dp.is_active, v_reg,
      (select rd.id
       from departments rd
       join departments ad on ad.label = rd.label and ad.office_id = v_acc
       where rd.office_id = v_reg and ad.id = dp.department_id),
      dp.college_id
    from degree_programs dp
    where dp.office_id = v_acc
      and not exists (select 1 from degree_programs x where x.office_id = v_reg and x.label = dp.label);
  else
    insert into degree_programs (label, sort_order, is_active, office_id, department_id)
    select dp.label, dp.sort_order, dp.is_active, v_reg,
      (select rd.id
       from departments rd
       join departments ad on ad.label = rd.label and ad.office_id = v_acc
       where rd.office_id = v_reg and ad.id = dp.department_id)
    from degree_programs dp
    where dp.office_id = v_acc
      and not exists (select 1 from degree_programs x where x.office_id = v_reg and x.label = dp.label);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Indexes: replace non-office composites with office-scoped ones
-- ---------------------------------------------------------------------------
drop index if exists idx_reservations_queue_date_status_created_at;
drop index if exists idx_reservations_priority_dispatch;

create index if not exists idx_res_office_dispatch
  on reservations(office_id, queue_date, status, window_id, is_priority desc, created_at asc);
create index if not exists idx_res_office_position
  on reservations(office_id, queue_date, inquiry_type, application_type, status);

create index if not exists idx_windows_office on windows(office_id, is_active);
create index if not exists idx_school_years_office on school_years(office_id, sort_order);
create index if not exists idx_departments_office on departments(office_id, sort_order);
create index if not exists idx_inquiry_types_office on inquiry_types(office_id, sort_order);
create index if not exists idx_admission_inquiry_types_office on admission_inquiry_types(office_id, sort_order);
create index if not exists idx_degree_programs_office on degree_programs(office_id, sort_order);
create index if not exists idx_purpose_options_office on purpose_of_request_options(office_id, sort_order);
create index if not exists idx_activity_logs_office on activity_logs(office_id, created_at desc);


-- ========================================================================
-- 024_staff_profiles_and_office_rls.sql
-- ========================================================================
-- Multi-office support (part 3): bind each staff account to exactly one office.
-- A `profiles` row (written by an auth.users trigger, never by the user) is the
-- authority. Write RLS on every office-scoped table is narrowed to the staffer's
-- own office. Reads stay public (kiosk + public display need anon access), and
-- the anonymous kiosk INSERT on reservations stays public.

-- ---------------------------------------------------------------------------
-- 1. profiles: user -> office
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  office_id uuid not null references offices(id),
  email text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "Users read own profile" on profiles;
drop policy if exists "Users update own profile" on profiles;
drop policy if exists "Users insert own profile" on profiles;
create policy "Users read own profile" on profiles for select using (id = auth.uid());
-- No user-facing insert/update policy: only the SECURITY DEFINER trigger writes.

-- ---------------------------------------------------------------------------
-- 2. Signup trigger: office comes from raw_user_meta_data.office_slug
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_office uuid;
begin
  select id into v_office from offices
  where slug = nullif(new.raw_user_meta_data ->> 'office_slug', '');

  if v_office is null then
    -- fallback: first office by sort_order (Accounting)
    select id into v_office from offices order by sort_order limit 1;
  end if;

  insert into profiles (id, office_id, email)
  values (new.id, v_office, new.email)
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Backfill existing staff (all Accounting today).
--    MUST run before the policies below or existing staff lose write access.
-- ---------------------------------------------------------------------------
insert into profiles (id, office_id, email)
select u.id, (select id from offices where slug = 'accounting'), u.email
from auth.users u
on conflict (id) do nothing;

-- Stamp existing sessions' user_metadata so the middleware coarse check has a
-- value to read (authoritative check still uses profiles).
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('office_slug', 'accounting')
where nullif(raw_user_meta_data ->> 'office_slug', '') is null;

-- ---------------------------------------------------------------------------
-- 4. RLS helper: current user's office (SECURITY DEFINER avoids recursive RLS)
-- ---------------------------------------------------------------------------
create or replace function auth_office_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select office_id from profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 5. Office-scoped write policies
--
-- Drift-safe: drop EVERY existing policy on the 9 office-scoped tables (names
-- and shapes may have drifted from the migration history), then recreate the
-- complete, deterministic set: public SELECT for kiosk + display, public
-- INSERT on reservations for the anonymous kiosk, and office-scoped writes for
-- staff. activity_logs policies are intentionally left untouched.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'reservations', 'windows', 'display_settings', 'school_years',
        'departments', 'inquiry_types', 'admission_inquiry_types',
        'degree_programs', 'purpose_of_request_options'
      )
  loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- Public SELECT on every office-scoped table (kiosk form + public display).
do $$
declare
  t text;
begin
  foreach t in array array[
    'reservations', 'windows', 'display_settings', 'school_years',
    'departments', 'inquiry_types', 'admission_inquiry_types',
    'degree_programs', 'purpose_of_request_options'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "Anyone can read %1$s" on %1$s for select using (true)', t);
  end loop;
end $$;

-- reservations: public INSERT (anonymous kiosk) + office-scoped UPDATE
create policy "Anyone can insert reservations" on reservations
  for insert with check (true);
create policy "Staff update own office reservations" on reservations
  for update
  using (auth.role() = 'authenticated' and office_id = (select auth_office_id()))
  with check (office_id = (select auth_office_id()));

-- display_settings: office-scoped UPDATE
create policy "Staff update own office display_settings" on display_settings
  for update
  using (auth.role() = 'authenticated' and office_id = (select auth_office_id()))
  with check (office_id = (select auth_office_id()));

-- windows + the 6 settings tables: office-scoped INSERT and UPDATE
do $$
declare
  t text;
begin
  foreach t in array array[
    'windows', 'school_years', 'departments', 'inquiry_types',
    'admission_inquiry_types', 'degree_programs', 'purpose_of_request_options'
  ]
  loop
    execute format($f$
      create policy "Staff insert own office %1$s" on %1$s
        for insert
        with check (auth.role() = 'authenticated' and office_id = (select auth_office_id()))
    $f$, t);

    execute format($f$
      create policy "Staff update own office %1$s" on %1$s
        for update
        using (auth.role() = 'authenticated' and office_id = (select auth_office_id()))
        with check (office_id = (select auth_office_id()))
    $f$, t);
  end loop;
end $$;


-- ========================================================================
-- 025_office_scoped_rpcs.sql
-- ========================================================================
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


-- ========================================================================
-- 026_activity_logs_office_rls.sql
-- ========================================================================
-- The real reason the Activity Logs dashboard is empty. Two independent
-- defects, both proven against the live REST API:
--   1. activity_logs is MISSING actor_user_id / actor_email. Migration 008
--      defines them but uses `create table if not exists` over a table that
--      already existed, so its column list was skipped. Every logActivity()
--      insert fails with PGRST204 ("Could not find the 'actor_email' column").
--   2. The INSERT policy is still auth-gated (migration 020's permissive fix
--      never landed here). The anon /reserve kiosk hits "42501: new row
--      violates row-level security policy".
-- Drift-safe and re-runnable.

alter table activity_logs add column if not exists actor_user_id uuid;
alter table activity_logs add column if not exists actor_email text;
create index if not exists idx_activity_logs_actor_user_id
  on activity_logs(actor_user_id);

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

create policy "Anyone can insert activity logs"
  on activity_logs
  for insert
  with check (true);

create policy "Authenticated users can read activity logs"
  on activity_logs
  for select
  using ((select auth.role()) = 'authenticated');

update activity_logs al
set office_id = (al.metadata ->> 'office_id')::uuid
where al.office_id is null
  and (al.metadata ->> 'office_id') is not null
  and (al.metadata ->> 'office_id') ~ '^[0-9a-fA-F-]{36}$';

-- Reconstruct history lost while inserts were failing (guarded, re-runnable).
insert into activity_logs (action, office_id, entity_type, entity_id, metadata, created_at)
select
  'reservation_created', r.office_id, 'reservation', r.id::text,
  jsonb_build_object(
    'office_id', r.office_id, 'queue_number', r.queue_number,
    'inquiry_type', r.inquiry_type, 'priority_type', r.priority_type,
    'window_id', r.window_id, 'window_name', w.name,
    'student_id', r.student_id, 'student_name', r.student_name,
    'backfilled', true
  ),
  r.created_at
from reservations r
left join windows w on w.id = r.window_id
where not exists (
  select 1 from activity_logs al
  where al.action = 'reservation_created' and al.entity_id = r.id::text
);

insert into activity_logs (action, office_id, entity_type, entity_id, metadata, created_at)
select
  case when r.status = 'skipped' then 'skip_ticket' else 'call_next' end,
  r.office_id, 'window', r.window_id::text,
  jsonb_build_object(
    'office_id', r.office_id, 'window_id', r.window_id, 'window_name', w.name,
    'now_serving_queue', r.queue_number,
    'now_serving_inquiry_type', r.inquiry_type,
    'now_serving_reservation_id', r.id, 'backfilled', true
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

do $$
begin
  alter publication supabase_realtime add table activity_logs;
exception when others then null;
end $$;

create index if not exists idx_activity_logs_office
  on activity_logs(office_id, created_at desc);

notify pgrst, 'reload schema';


