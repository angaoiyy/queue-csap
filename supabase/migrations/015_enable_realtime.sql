-- Enable Supabase Realtime for live queue updates on the display screen.
-- Without this, postgres_changes subscriptions in app/display/page.tsx receive no events.
do $$
begin
  alter publication supabase_realtime add table reservations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table display_settings;
exception when duplicate_object then null;
end $$;
