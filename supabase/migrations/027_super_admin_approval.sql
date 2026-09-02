-- Multi-office support (part 6): a single super-admin role that must approve
-- every new staff account before it can use the dashboard.
--
--   * profiles.role   - 'staff' (default) | 'super_admin'. A partial unique
--     index caps super_admin at exactly one row.
--   * profiles.status - 'pending' (default) | 'approved' | 'rejected'. New
--     sign-ups land 'pending'. On the FIRST run of this migration every
--     account that already exists is grandfathered to 'approved' so current
--     staff are not interrupted; re-runs never touch existing status values.
--   * is_super_admin() gates the new profiles policies.
--   * auth_office_id() (from 024) is redefined to return NULL for any account
--     that is not an approved staffer / the super admin. Every office-scoped
--     write policy already compares office_id against that value, so a NULL
--     silently blocks all writes for pending or rejected accounts.
--
-- Idempotent and safe to re-run. Does NOT abort if the super-admin account is
-- missing - it just logs a warning with the one-liner to run later.

-- ---------------------------------------------------------------------------
-- 1. Columns + first-run grandfather
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'status'
  ) then
    execute 'alter table profiles add column status text not null default ''pending''';
    -- First application only: approve everyone who already had an account.
    execute 'update profiles set status = ''approved''';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'role'
  ) then
    execute 'alter table profiles add column role text not null default ''staff''';
  end if;
end $$;

do $$ begin
  alter table profiles add constraint profiles_role_check
    check (role in ('staff', 'super_admin'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table profiles add constraint profiles_status_check
    check (status in ('pending', 'approved', 'rejected'));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Exactly one super admin, enforced by the database
-- ---------------------------------------------------------------------------
create unique index if not exists profiles_one_super_admin
  on profiles (role) where role = 'super_admin';

-- ---------------------------------------------------------------------------
-- 3. Promote the designated super admin (soft: warns instead of aborting)
--
-- To move the super admin to a different account later:
--   update profiles set role = 'staff' where role = 'super_admin';
--   update profiles p set role = 'super_admin', status = 'approved'
--   from auth.users u
--   where u.id = p.id and lower(u.email) = lower('NEW_EMAIL_HERE');
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower('albertregla24@gmail.com');

  if v_id is null then
    raise warning 'super_admin NOT set: no auth.users row for albertregla24@gmail.com. Once that account signs up and confirms its email, run:  update profiles p set role=''super_admin'', status=''approved'' from auth.users u where u.id = p.id and lower(u.email) = lower(''albertregla24@gmail.com'');';
  else
    update profiles set role = 'super_admin', status = 'approved' where id = v_id;
    if not found then
      raise warning 'super_admin NOT set: auth.users has albertregla24@gmail.com but profiles has no matching row (signup trigger did not run).';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Helpers (SECURITY DEFINER: owned by postgres, so they bypass RLS on
--    profiles and cannot recurse into the policies below - same pattern as
--    auth_office_id() in migration 024).
-- ---------------------------------------------------------------------------
create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  )
$$;

create or replace function auth_office_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select office_id from profiles
  where id = auth.uid()
    and (role = 'super_admin' or status = 'approved')
$$;

-- ---------------------------------------------------------------------------
-- 5. profiles RLS: the super admin reads and updates every profile row.
--    "Users read own profile" (from 024) stays - permissive policies OR.
-- ---------------------------------------------------------------------------
drop policy if exists "Super admin reads all profiles" on profiles;
create policy "Super admin reads all profiles" on profiles
  for select using ((select is_super_admin()));

drop policy if exists "Super admin updates profiles" on profiles;
create policy "Super admin updates profiles" on profiles
  for update
  using ((select is_super_admin()))
  with check ((select is_super_admin()));

-- ---------------------------------------------------------------------------
-- 6. offices: was writable by any authenticated JWT (022). Narrow it to
--    approved staff / the super admin, consistent with every other table.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated can insert offices" on offices;
drop policy if exists "Authenticated can update offices" on offices;
drop policy if exists "Approved staff can insert offices" on offices;
drop policy if exists "Approved staff can update offices" on offices;

create policy "Approved staff can insert offices" on offices
  for insert with check ((select auth_office_id()) is not null);

create policy "Approved staff can update offices" on offices
  for update
  using ((select auth_office_id()) is not null)
  with check ((select auth_office_id()) is not null);

notify pgrst, 'reload schema';
