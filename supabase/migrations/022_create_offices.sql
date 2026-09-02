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
