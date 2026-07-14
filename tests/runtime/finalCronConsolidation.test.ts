import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/prepared/20260714003000_final_cron_consolidation.sql', 'utf8');
const doc = readFileSync('docs/implementation/HASHIBOT_FINAL_CRON_CONSOLIDATION.md', 'utf8');

const preparedCronSqlFiles = [
  'supabase/migrations/prepared/20260714003000_final_cron_consolidation.sql',
  'supabase/migrations/prepared/20260714003000_final_cron_consolidation/01_preflight.sql',
  'supabase/migrations/prepared/20260714003000_final_cron_consolidation/02_apply_and_verify.sql',
];

for (const preparedCronSqlFile of preparedCronSqlFiles) {
  const preparedCronSql = readFileSync(preparedCronSqlFile, 'utf8');
  assert.ok(!preparedCronSql.includes('SUPABASE_SERVICE_ROLE_KEY'), `${preparedCronSqlFile} must not reference reserved Vault secret SUPABASE_SERVICE_ROLE_KEY`);
  assert.ok(!preparedCronSql.includes('SUPABASE_URL'), `${preparedCronSqlFile} must not reference reserved Vault secret SUPABASE_URL`);
  assert.ok(preparedCronSql.includes('HASHIBOT_SERVICE_ROLE_KEY'), `${preparedCronSqlFile} must require HASHIBOT_SERVICE_ROLE_KEY`);
  assert.ok(preparedCronSql.includes('HASHIBOT_PROJECT_URL'), `${preparedCronSqlFile} must require HASHIBOT_PROJECT_URL`);
}

const canonicalJobs = [
  'hashibot_prod_scanner_5m',
  'hashibot_prod_outcome_evaluator_5m',
  'hashibot_prod_binance_testnet_monitor_1m',
  'hashibot_prod_bybit_demo_monitor_1m',
  'hashibot_prod_content_morning_brief_0800_eat',
  'hashibot_prod_content_news_digest_1200_eat',
  'hashibot_prod_content_watchlist_1600_eat',
  'hashibot_prod_content_market_wrap_2000_eat',
  'hashibot_prod_runtime_cleanup_daily',
];

const runtimeLeaseKeys = [
  'scanner:global',
  'outcome-evaluator:global',
  'monitor:binance:testnet',
  'monitor:bybit:demo',
  'cleanup:runtime',
];

for (const section of [
  'SECTION 1 — READ-ONLY PREFLIGHT',
  'SECTION 2 — FORWARD CONSOLIDATION',
  'SECTION 3 — POSTFLIGHT',
  'SECTION 4 — ROLLBACK',
]) {
  assert.ok(sql.includes(section), `missing migration section: ${section}`);
}

for (const job of canonicalJobs) {
  const occurrences = (sql.match(new RegExp(job, 'g')) ?? []).length;
  assert.ok(occurrences >= 1, `canonical job missing from SQL: ${job}`);
  assert.ok(doc.includes(job), `canonical job missing from docs: ${job}`);
}

assert.equal(new Set(canonicalJobs).size, canonicalJobs.length, 'canonical job names must be unique');
for (const preparedCronSqlFile of preparedCronSqlFiles) {
  const preparedCronSql = readFileSync(preparedCronSqlFile, 'utf8');
  assert.ok(!/\bUPDATE\s+cron\.job\b/i.test(preparedCronSql), `${preparedCronSqlFile} must not directly mutate cron metadata with UPDATE`);
  assert.ok(!/\bINSERT\s+INTO\s+cron\.job\b/i.test(preparedCronSql), `${preparedCronSqlFile} must not directly mutate cron metadata with INSERT`);
  assert.ok(!/\bDELETE\s+FROM\s+cron\.job\b/i.test(preparedCronSql), `${preparedCronSqlFile} must not directly mutate cron metadata with DELETE`);
}

assert.ok(sql.includes('PERFORM cron.alter_job(v_jobid, active := false);'), 'cron.alter_job must disable scheduled jobs by jobid');
assert.ok(sql.includes('PERFORM cron.unschedule(r.jobid);'), 'cron.unschedule must delete jobs by jobid');
assert.match(sql, /PERFORM cron\.schedule\(r\.job_name[\s\S]*?SELECT jobid[\s\S]*?WHERE jobname = r\.job_name[\s\S]*?PERFORM cron\.alter_job\(v_jobid, active := false\);[\s\S]*?IF v_active IS DISTINCT FROM false/s, 'canonical jobs must be scheduled, disabled through cron.alter_job, and verified active = false');
assert.match(sql, /PERFORM cron\.schedule\(r\.jobname[\s\S]*?SELECT jobid[\s\S]*?WHERE jobname = r\.jobname[\s\S]*?PERFORM cron\.alter_job\(v_jobid, active := false\);[\s\S]*?IF v_active IS DISTINCT FROM false/s, 'rollback must restore old jobs disabled through cron.alter_job and verify active = false');

for (const legacy of [
  'hashibot_trade_supervisor_1m_binance',
  'hashibot_trade_supervisor_1m_bybit',
  'hashibot_test_morning_brief_1m',
  'hashibot_test_news_digest_1m',
  'hashibot_test_watchlist_patterns_1m',
  'hashibot_test_market_wrap_1m',
]) {
  assert.ok(sql.includes(legacy), `legacy delete target not covered: ${legacy}`);
}

assert.ok(sql.includes('HASHIBOT_SERVICE_ROLE_KEY'), 'service role Vault secret must be required');
assert.ok(sql.includes('HASHIBOT_PROJECT_URL'), 'Supabase URL Vault secret must be required');
assert.ok(sql.includes("'Authorization', 'Bearer ' || v_service_key"), 'dispatcher must construct valid Authorization header');
assert.ok(sql.includes("'apikey', v_service_key"), 'dispatcher must send apikey header');
assert.ok(!sql.includes("'Authorization', 'Bearer ' || (SELECT cron_pg_token"), 'cron token must not be used as Bearer authorization');
assert.ok(!sql.includes("'apikey', (SELECT supabase_anon_key"), 'anon key must not be used by final scheduler commands');
assert.ok(!sql.includes("'x-scanner-cron-secret',"), 'legacy scanner secret header must not be used by final scheduler commands');

for (const leaseKey of runtimeLeaseKeys) {
  assert.ok(sql.includes(leaseKey), `runtime lease key missing: ${leaseKey}`);
}

assert.ok(sql.includes('runtime_acquire_worker_lease'), 'scheduler must acquire runtime lease');
assert.ok(sql.includes('runtime_record_event_idempotency'), 'scheduler must record idempotency');
assert.ok(sql.includes('ON CONFLICT (job_name) DO UPDATE'), 'scheduler job install must be idempotent');
assert.ok(sql.includes('ON CONFLICT (migration_id, jobid) DO UPDATE'), 'legacy backup must be idempotent');
assert.ok(sql.includes('run_trade_supervisor_cycle'), 'postflight must reject deprecated supervisor target');

console.log('finalCronConsolidation static checks passed');
