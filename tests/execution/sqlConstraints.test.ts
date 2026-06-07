import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260607133000_044_binance_truth_first_end_to_end.sql', 'utf8');
const b51Sql = readFileSync('supabase/migrations/20260607143000_045_b5_1_signal_id_cron_auth_e2e_proof.sql', 'utf8');

for (const value of ['pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed','closed_tp','closed_sl','closed_breakeven','cancelled','failed','skipped','stale_closed','sent_to_bridge','accepted','rejected','filled']) {
  assert.match(sql, new RegExp(`'${value}'`), `execution_orders.status allows ${value}`);
}
for (const value of ['unprotected','protected','protected_managed','pending_protection','pending_managed_protection','unprotected_failed']) {
  assert.match(sql, new RegExp(`'${value}'`), `execution_orders.protection_status allows ${value}`);
}
for (const value of ['exchange_native','managed_exit_fallback','failed']) {
  assert.match(sql, new RegExp(`'${value}'`), `execution_orders.bracket_mode allows ${value}`);
}
assert.match(sql, /bracket_mode IN \('',/, 'execution_orders.bracket_mode allows empty string');
assert.match(sql, /hashibot_binance_testnet_monitor_1m/);
assert.match(sql, /last_managed_exit_action/);
assert.match(sql, /cron_pg_token/);
assert.match(sql, /\*\/1 \* \* \* \*/);
assert.match(b51Sql, /UPDATE public\.execution_event_logs AS eel/, 'B5.1 backfills execution event signal_id and symbol');
assert.match(b51Sql, /cron_pg_token = gen_random_uuid\(\)::text/, 'B5.1 ensures monitor cron token exists');
assert.match(b51Sql, /hashibot_binance_testnet_monitor_1m/, 'B5.1 rebuilds monitor cron');
console.log('SQL constraint tests passed');
