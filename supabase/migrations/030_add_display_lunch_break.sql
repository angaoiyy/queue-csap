alter table display_settings
  add column if not exists lunch_break_enabled boolean not null default true,
  add column if not exists lunch_break_start time not null default '12:00',
  add column if not exists lunch_break_end time not null default '13:00';
