alter table windows enable row level security;

drop policy if exists "Anyone can read windows" on windows;
create policy "Anyone can read windows"
  on windows
  for select
  using (true);

drop policy if exists "Authenticated users can insert windows" on windows;
create policy "Authenticated users can insert windows"
  on windows
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update windows" on windows;
create policy "Authenticated users can update windows"
  on windows
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
