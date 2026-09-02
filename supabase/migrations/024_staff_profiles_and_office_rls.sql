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
