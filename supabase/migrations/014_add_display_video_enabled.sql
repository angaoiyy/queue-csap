alter table display_settings
  add column if not exists is_enabled boolean not null default true;
