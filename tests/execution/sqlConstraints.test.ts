import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260607123000_039_binance_monitor_cron_and_constraints.sql', 'utf8');

for (const value of ['pending','entry_submitted','entry_filled','protected','pending_protection','partially_closed','closed_tp','closed_sl','cancelled','failed','skipped','stale_closed','sent_to_bridge','accepted','rejected','filled']) {
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
assert.match(sql, /\*\/1 \* \* \* \*/);
console.log('SQL constraint tests passed');
