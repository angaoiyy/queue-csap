// Runs the actual migration history against a disposable PostgreSQL cluster.
// Requires PostgreSQL binaries on PATH, or PG_BIN pointing to their directory.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(path.join(os.tmpdir(), "screenbased-quota-tests-"));
const dataDir = path.join(temp, "data");
const bin = (name) => process.env.PG_BIN ? path.join(process.env.PG_BIN, name + (process.platform === "win32" ? ".exe" : "")) : name;
const env = { ...process.env, PGPASSWORD: "", PGUSER: "postgres", PGDATABASE: "postgres", PGHOST: "127.0.0.1" };
const server = net.createServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
env.PGPORT = String(port);

function run(name, args, input) {
  // On Windows, the detached PostgreSQL server can inherit pg_ctl's pipe
  // handles. Ignore those streams so spawnSync does not wait for server exit.
  const result = spawnSync(bin(name), args, { input, env, encoding: "utf8", windowsHide: true,
    stdio: name === "pg_ctl" ? "ignore" : "pipe", timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${name} failed (${result.status}): ${result.error?.message ?? ""} ${result.stderr ?? ""} ${result.stdout ?? ""}`);
  return result.stdout ?? "";
}
function sql(input) { return run("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1"], input).trim(); }
function concurrentSql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin("psql"), ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1"], { env, windowsHide: true });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
    child.stdin.end(input);
  });
}

let started = false;
try {
  run("initdb", ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  started = true;
  run("pg_ctl", ["-D", dataDir, "-l", path.join(temp, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  sql(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text; $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('sub', auth.uid(), 'email', 'test@example.test');
    $$;
    grant usage on schema auth to anon, authenticated;
    create publication supabase_realtime;
  `);
  const migrations = readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
  // Verify the quota migration first, then exercise the assignment upgrade.
  // Its deliberately stricter permissions replace office-wide staff access.
  for (const migration of migrations.filter((name) => parseInt(name, 10) <= 32)) {
    sql(readFileSync(path.join(root, "supabase", "migrations", migration), "utf8"));
  }
  sql(`grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;`);
  console.log("PASS: migration history through daily quotas applies to PostgreSQL");
  console.log(sql(readFileSync(path.join(root, "tests", "quota-database.sql"), "utf8"))
    .split(/\r?\n/).filter((line) => line.startsWith("PASS:")).join("\n"));

  // One free slot, two independent database sessions, each holding the office
  // lock until commit. Direct anonymous inserts must not overfill the window.
  sql(`select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
    truncate reservations; update window_daily_quotas set enabled = true,
    periods = '[{"start":"00:00","end":"23:59","capacity":1}]';
    update windows set is_active = false where office_id = test_office() and name <> 'Window 1' and is_active;`);
  const admission = `begin; set role anon; select (test_ticket('accounting')).id; select pg_sleep(0.3); commit;`;
  const attempts = await Promise.all([concurrentSql(admission), concurrentSql(admission)]);
  assert.equal(attempts.filter((result) => result.code === 0).length, 1, JSON.stringify(attempts));
  assert.match(attempts.find((result) => result.code !== 0).output, /QUOTA_UNAVAILABLE/);
  assert.equal(sql("select count(*) from reservations where status in ('waiting', 'serving');"), "1");
  console.log("PASS: simultaneous direct inserts compete safely for the final slot");

  // A stale public form must use newly saved settings, not cached eligibility.
  sql(`update reservations set status = 'completed';
    update window_daily_quotas set periods = '[{"start":"00:00","end":"00:01","capacity":1}]';`);
  const stale = await concurrentSql("set role anon; select (test_ticket('accounting')).id;");
  assert.notEqual(stale.code, 0);
  assert.match(stale.output, /QUOTA_UNAVAILABLE/);
  console.log("PASS: stale availability cannot bypass changed configuration");

  for (const migration of migrations.filter((name) => parseInt(name, 10) > 32 && parseInt(name, 10) <= 34)) {
    const source = readFileSync(path.join(root, "supabase", "migrations", migration), "utf8");
    if (parseInt(migration, 10) === 34) {
      // Reproduce the SQL Editor failure: the first part was committed, while
      // later tables, functions, and grants have never been installed.
      const partialEnd = source.indexOf("-- Publish actual operator changes");
      assert.ok(partialEnd > 0);
      sql(`${source.slice(0, partialEnd)}\ncommit;`);
      assert.equal(sql("select to_regclass('public.window_queue_counts') is not null and to_regclass('public.window_assignment_events') is null;"), "t");
    }
    sql(source);
    if (parseInt(migration, 10) === 34) console.log("PASS: migration 034 recovers an existing table and partially installed functions/triggers");
  }
  console.log("PASS: complete migration history, including exclusive staff windows, applies to PostgreSQL");
  console.log(sql(readFileSync(path.join(root, "tests", "window-assignment.sql"), "utf8"))
    .split(/\r?\n/).filter((line) => line.startsWith("PASS:")).join("\n"));

  // Competing staff both retain their current window unless the atomic switch
  // to the same free target succeeds. A failure must not release the old claim.
  sql(`truncate staff_window_assignments;
    select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
    select switch_staff_window(test_window('Window 2'));
    select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
    select switch_staff_window(test_window('Window 3'));`);
  const claim = (userId) => `begin; set role authenticated;
    select set_config('request.jwt.claim.sub', '${userId}', true);
    select switch_staff_window(test_window()); select pg_sleep(0.3); commit;`;
  const claims = await Promise.all([
    concurrentSql(claim('10000000-0000-0000-0000-000000000001')),
    concurrentSql(claim('10000000-0000-0000-0000-000000000004')),
  ]);
  assert.equal(claims.filter((result) => result.code === 0).length, 1, JSON.stringify(claims));
  assert.match(claims.find((result) => result.code !== 0).output, /WINDOW_OCCUPIED/);
  assert.equal(sql("select count(*) from staff_window_assignments;"), "2");
  assert.equal(sql("select count(*) from staff_window_assignments where window_id = test_window();"), "1");
  console.log("PASS: competing switches admit one operator and preserve the losing staff member's original window");
  console.log(sql(readFileSync(path.join(root, "tests", "low-usage.sql"), "utf8"))
    .split(/\r?\n/).filter((line) => line.startsWith("PASS:")).join("\n"));
  const optimizedAdmissions = await Promise.all([concurrentSql(admission), concurrentSql(admission)]);
  assert.equal(optimizedAdmissions.filter((result) => result.code === 0).length, 1, JSON.stringify(optimizedAdmissions));
  assert.equal(sql("select active_count from window_queue_counts where window_id = test_window();"), "1");
  console.log("PASS: low-usage counter updates preserve atomic capacity enforcement under concurrent admission");

  const operationalState = () => sql(`select jsonb_build_object(
    'reservations', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]'::jsonb) from reservations r),
    'quotas', (select coalesce(jsonb_agg(to_jsonb(q) order by window_id, quota_date), '[]'::jsonb) from window_daily_quotas q),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a) order by user_id), '[]'::jsonb) from staff_window_assignments a),
    'windows', (select coalesce(jsonb_agg(to_jsonb(w) order by id), '[]'::jsonb) from windows w),
    'counts', (select coalesce(jsonb_agg(to_jsonb(c) order by window_id), '[]'::jsonb) from window_queue_counts c));`);
  const beforeRerun = operationalState();
  const repeatableMigration = readFileSync(path.join(root, "supabase", "migrations", "034_low_usage_live_updates.sql"), "utf8");
  sql("grant execute on function sync_window_queue_count(uuid), renew_staff_window(uuid) to anon, authenticated;");
  sql(repeatableMigration);
  sql(repeatableMigration);
  assert.equal(operationalState(), beforeRerun);
  assert.equal(sql(`select count(*) from pg_trigger where not tgisinternal and tgname in
    ('update_window_queue_count', 'reset_window_queue_counts', 'notify_window_assignment_change');`), "3");
  assert.equal(sql("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('window_queue_counts', 'window_assignment_events', 'window_daily_quotas');"), "3");
  assert.equal(sql("select has_function_privilege('anon', 'renew_staff_window(uuid)', 'execute') or has_function_privilege('authenticated', 'sync_window_queue_count(uuid)', 'execute');"), "f");
  assert.equal(sql("select has_function_privilege('authenticated', 'renew_staff_window(uuid)', 'execute') and has_function_privilege('anon', 'get_office_quota_snapshot(text)', 'execute');"), "t");
  console.log("PASS: completed migration reruns preserve tickets, quotas, live claims, counts, and unique trigger/publication definitions");

  const coreState = () => JSON.parse(sql(`select jsonb_build_object(
    'reservations', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]'::jsonb) from reservations r),
    'quotas', (select coalesce(jsonb_agg(to_jsonb(q) order by window_id, quota_date), '[]'::jsonb) from window_daily_quotas q),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a) order by user_id), '[]'::jsonb) from staff_window_assignments a),
    'windows', (select coalesce(jsonb_agg(to_jsonb(w) order by id), '[]'::jsonb) from windows w));`));
  const beforeRollback = coreState();
  const rollback = readFileSync(path.join(root, "supabase", "migrations", "035_restore_api_polling.sql"), "utf8");
  sql(rollback); sql(rollback);
  assert.deepEqual(coreState(), beforeRollback);
  assert.equal(sql("select to_regclass('public.window_queue_counts') is null and to_regclass('public.window_assignment_events') is null and to_regprocedure('public.renew_staff_window(uuid)') is null and to_regprocedure('public.get_office_quota_snapshot(text)') is null;"), "t");
  console.log("PASS: polling rollback preserves all core data, removes optimization objects, and can be repeated");
  console.log(sql(readFileSync(path.join(root, "tests", "polling-rollback.sql"), "utf8"))
    .split(/\r?\n/).filter((line) => line.startsWith("PASS:")).join("\n"));
  const beforePartialRollback = coreState();
  const partialEnd = repeatableMigration.indexOf("-- Publish actual operator changes");
  sql(`${repeatableMigration.slice(0, partialEnd)}\ncommit;`);
  sql(rollback);
  assert.deepEqual(coreState(), beforePartialRollback);
  assert.equal(sql("select to_regclass('public.window_queue_counts') is null and to_regclass('public.window_assignment_events') is null;"), "t");
  console.log("PASS: polling rollback also recovers a partial optimization installation without changing core data");
} finally {
  let stopped = !started;
  if (started) {
    try {
      run("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
      stopped = true;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
  // Delete only this runner's freshly generated directory inside the OS temp root.
  if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith("screenbased-quota-tests-")) {
    throw new Error("Refusing to remove unexpected test directory");
  }
  if (stopped) {
    try { rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
    catch (error) {
      console.error(`Could not remove temporary test directory ${temp}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
