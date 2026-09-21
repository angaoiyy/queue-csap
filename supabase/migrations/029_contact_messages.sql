-- Landing-page "Contact us" form (part 8): visitors leave a message, only the
-- super admin can read it. No email/SMTP integration - messages are stored here
-- and viewed in the dashboard at /dashboard/messages.
--
--   * contact_messages - one row per submitted message. email and phone are
--     both nullable but at least one must be present.
--   * RLS: anyone (anon or authenticated) may INSERT an unread message; only
--     is_super_admin() (from 027) may SELECT / UPDATE / DELETE. There is
--     deliberately no anon SELECT policy, so the insert call must not ask for
--     the row back (no `.select()` after `.insert()`).
--   * CHECK constraints cap field sizes because anon can hit PostgREST
--     directly and skip the server action's own validation.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table contact_messages add constraint contact_messages_first_name_check
    check (char_length(btrim(first_name)) between 1 and 80);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table contact_messages add constraint contact_messages_last_name_check
    check (char_length(btrim(last_name)) between 1 and 80);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table contact_messages add constraint contact_messages_email_check
    check (email is null or char_length(email) <= 254);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table contact_messages add constraint contact_messages_phone_check
    check (phone is null or char_length(phone) <= 30);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table contact_messages add constraint contact_messages_message_check
    check (char_length(btrim(message)) between 1 and 2000);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table contact_messages add constraint contact_messages_contact_check
    check (email is not null or phone is not null);
exception when duplicate_object then null;
end $$;

create index if not exists idx_contact_messages_created_at
  on contact_messages (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS: drop EVERY existing policy (drift-safe, same approach as 024/026),
--    then recreate the deterministic set.
-- ---------------------------------------------------------------------------
alter table contact_messages enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'contact_messages'
  loop
    execute format('drop policy if exists %I on contact_messages', r.policyname);
  end loop;
end $$;

-- Public form: anyone may submit, but only as an unread message.
create policy "Anyone can send contact messages" on contact_messages
  for insert
  with check (is_read = false);

-- Everything else: super admin only (is_super_admin() is SECURITY DEFINER, 027).
create policy "Super admin reads contact messages" on contact_messages
  for select
  using ((select is_super_admin()));

create policy "Super admin updates contact messages" on contact_messages
  for update
  using ((select is_super_admin()))
  with check ((select is_super_admin()));

create policy "Super admin deletes contact messages" on contact_messages
  for delete
  using ((select is_super_admin()));

notify pgrst, 'reload schema';
