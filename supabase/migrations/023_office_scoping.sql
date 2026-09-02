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
