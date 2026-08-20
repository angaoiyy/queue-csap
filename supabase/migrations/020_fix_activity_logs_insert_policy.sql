-- Activity logs are written by trusted server actions (kiosk reservation
-- creation included), not directly by end users, so gating insert on an
-- authenticated session breaks logging for the public /reserve flow.
-- Match the "reservations" table's own insert policy.
drop policy if exists "Authenticated users can insert activity logs" on activity_logs;
create policy "Anyone can insert activity logs"
  on activity_logs
  for insert
  with check (true);
