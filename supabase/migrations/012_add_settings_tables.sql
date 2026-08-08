create table if not exists school_years (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  requires_degree_program boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists inquiry_types (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  prefix text not null,
  requires_purpose boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists degree_programs (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists purpose_of_request_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into school_years (label, sort_order)
select label, ordinality - 1
from unnest(array[
  '1st Sem AY 2024-2025',
  '2nd Sem AY 2024-2025',
  'Summer AY 2024-2025',
  '1st Sem AY 2025-2026',
  '2nd Sem AY 2025-2026'
]) with ordinality as t(label, ordinality)
where not exists (select 1 from school_years);

insert into departments (label, requires_degree_program, sort_order)
select label, requires_degree_program, sort_order
from (values
  ('Baccalaureate-College', true, 0),
  ('Senior HighSchool', false, 1)
) as t(label, requires_degree_program, sort_order)
where not exists (select 1 from departments);

insert into inquiry_types (label, prefix, requires_purpose, sort_order)
select label, prefix, requires_purpose, sort_order
from (values
  ('Certificate of Enrollment', 'COE', true, 0),
  ('Certificate of Registration', 'COR', false, 1),
  ('Certificate of Good Moral Character', 'COGMC', false, 2),
  ('Certificate of GWA', 'GWA', false, 3),
  ('Certificate of Graduation', 'COG', false, 4),
  ('Certified/Authenticated Copy', 'CAC', false, 5),
  ('TOR', 'TOR', false, 6),
  ('Study Load', 'SL', false, 7),
  ('Tuition Fee', 'TF', false, 8),
  ('Other Inquiry', 'OI', false, 9)
) as t(label, prefix, requires_purpose, sort_order)
where not exists (select 1 from inquiry_types);

insert into degree_programs (label, sort_order)
select label, ordinality - 1
from unnest(array[
  'Bachelor of Science in Psychology',
  'Bachelor of Science in Accounting Information System (BSAIS)',
  'Bachelor of Science in Information System (BSIS)',
  'Bachelor of Science in Office Administration (BSOAd)',
  'Bachelor of Science in Tourism Management (BSTM)',
  'Bachelor of Science in Criminology (BSCrim)',
  'Bachelor of Science in Civil Engineering (BSCE)',
  'Bachelor of Science in Computer Engineering (BSCpE)',
  'Bachelor of Science in Electrical Engineering (BSEE)',
  'Bachelor of Science in Mechanical Engineering (BSME)',
  'Bachelor of Science in Nursing (BSN)',
  'Bachelor of Elementary Education (BEEd)',
  'Bachelor of Physical Education (BPEd)',
  'Bachelor of Secondary Education (BSEd)',
  'Bachelor of Special Needs Education',
  'Diploma in Professional Education'
]) with ordinality as t(label, ordinality)
where not exists (select 1 from degree_programs);

insert into purpose_of_request_options (label, sort_order)
select label, ordinality - 1
from unnest(array[
  'Educational Assistance',
  'Scholarship',
  'Financial Assistance',
  'Others'
]) with ordinality as t(label, ordinality)
where not exists (select 1 from purpose_of_request_options);

alter table school_years enable row level security;
alter table departments enable row level security;
alter table inquiry_types enable row level security;
alter table degree_programs enable row level security;
alter table purpose_of_request_options enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['school_years', 'departments', 'inquiry_types', 'degree_programs', 'purpose_of_request_options']
  loop
    execute format('drop policy if exists "Anyone can read %1$s" on %1$s', t);
    execute format('create policy "Anyone can read %1$s" on %1$s for select using (true)', t);

    execute format('drop policy if exists "Authenticated users can insert %1$s" on %1$s', t);
    execute format('create policy "Authenticated users can insert %1$s" on %1$s for insert with check (auth.role() = ''authenticated'')', t);

    execute format('drop policy if exists "Authenticated users can update %1$s" on %1$s', t);
    execute format('create policy "Authenticated users can update %1$s" on %1$s for update using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t);
  end loop;
end;
$$;
