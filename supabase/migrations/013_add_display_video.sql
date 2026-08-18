create table if not exists display_settings (
  id smallint primary key default 1 check (id = 1),
  video_url text,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into display_settings (id)
values (1)
on conflict (id) do nothing;

alter table display_settings enable row level security;

drop policy if exists "Anyone can read display_settings" on display_settings;
create policy "Anyone can read display_settings" on display_settings for select using (true);

drop policy if exists "Authenticated users can update display_settings" on display_settings;
create policy "Authenticated users can update display_settings" on display_settings for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
