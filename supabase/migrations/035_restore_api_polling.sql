-- Revert migration 034's live-update optimization while preserving reservations,
-- quota configuration, windows, staff assignments, and the ownership protections.
-- Safe after a partial/full 034 installation and safe to run more than once.
begin;

drop trigger if exists update_window_queue_count on reservations;
drop trigger if exists reset_window_queue_counts on reservations;
drop trigger if exists notify_window_assignment_change on staff_window_assignments;

drop function if exists update_window_queue_count();
drop function if exists reset_window_queue_counts();
drop function if exists sync_window_queue_count(uuid);
drop function if exists notify_window_assignment_change();
drop function if exists get_office_quota_snapshot(text);
drop function if exists get_office_display_snapshot(uuid);
drop function if exists renew_staff_window(uuid);

-- These two tables contain only derived optimization metadata, not tickets,
-- quotas, staff accounts, window assignments, or recall events.
drop table if exists window_queue_counts;
drop table if exists window_assignment_events;

do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'window_daily_quotas') then
    alter publication supabase_realtime drop table window_daily_quotas;
  end if;
end; $$;

-- Restore migration 033's combined assignment read/renew RPC. Polling this
-- endpoint renews the caller's live claim without using a Realtime connection.
create or replace function get_staff_window_state(p_office_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_office_id is null or auth_office_id() is distinct from p_office_id then raise exception 'Forbidden'; end if;
  perform 1 from offices where id = p_office_id for update;
  delete from staff_window_assignments where office_id = p_office_id and expires_at <= clock_timestamp();
  update staff_window_assignments a set expires_at = clock_timestamp() + interval '2 minutes'
    where a.user_id = auth.uid() and a.office_id = p_office_id
      and exists (select 1 from windows w where w.id = a.window_id and w.is_active);
  select jsonb_build_object(
    'currentWindowId', (select window_id from staff_window_assignments where user_id = auth.uid() and office_id = p_office_id),
    'expiresAt', (select expires_at from staff_window_assignments where user_id = auth.uid() and office_id = p_office_id),
    'windows', coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name,
      'occupied', a.user_id is not null, 'isMine', coalesce(a.user_id = auth.uid(), false))
      order by coalesce(nullif(regexp_replace(w.name, '\D', '', 'g'), '')::numeric, 2147483647), w.name), '[]'::jsonb)
  ) into result from windows w left join staff_window_assignments a on a.window_id = w.id
    where w.office_id = p_office_id and w.is_active;
  return result;
end;
$$;
revoke all on function get_staff_window_state(uuid) from public, anon, authenticated;
grant execute on function get_staff_window_state(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
