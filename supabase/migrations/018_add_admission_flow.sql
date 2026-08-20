alter table reservations
  alter column student_id drop not null,
  add column application_type text not null default 'old' check (application_type in ('old', 'new'));

create index if not exists idx_reservations_application_type on reservations(application_type, inquiry_type, queue_date);

create table if not exists admission_inquiry_types (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  prefix text not null,
  requires_purpose boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into admission_inquiry_types (label, prefix, requires_purpose, sort_order)
select label, prefix, requires_purpose, sort_order
from (values
  ('Enrollment Fee', 'ENR', false, 0)
) as t(label, prefix, requires_purpose, sort_order)
where not exists (select 1 from admission_inquiry_types);

alter table admission_inquiry_types enable row level security;

drop policy if exists "Anyone can read admission_inquiry_types" on admission_inquiry_types;
create policy "Anyone can read admission_inquiry_types" on admission_inquiry_types for select using (true);

drop policy if exists "Authenticated users can insert admission_inquiry_types" on admission_inquiry_types;
create policy "Authenticated users can insert admission_inquiry_types" on admission_inquiry_types for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update admission_inquiry_types" on admission_inquiry_types;
create policy "Authenticated users can update admission_inquiry_types" on admission_inquiry_types for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
