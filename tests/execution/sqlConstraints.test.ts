import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260607133000_044_binance_truth_first_end_to_end.sql', 'utf8');
const b51Sql = readFileSync('supabase/migrations/20260607143000_045_b5_1_signal_id_cron_auth_e2e_proof.sql', 'utf8');
const b6Sql = readFileSync('supabase/migrations/20260608120000_046_b6_real_binance_futures_bot_lifecycle.sql', 'utf8');
const b61Sql = readFileSync('supabase/migrations/20260608143000_047_b6_1_reset_signal_fk_chain.sql', 'utf8');
const b62Sql = readFileSync('supabase/migrations/20260608170000_048_b6_2_separate_history_reset_governor_controls.sql', 'utf8');
const b63Sql = readFileSync('supabase/migrations/20260608193000_049_b6_3_restore_batched_performance_reset.sql', 'utf8');
const b64Sql = readFileSync('supabase/migrations/20260608203000_050_b6_4_binance_algo_tpsl_ids.sql', 'utf8');
const b66Sql = readFileSync('supabase/migrations/20260609120000_052_b6_6_entry_submitted_protection_pending_fix.sql', 'utf8');
const b67Sql = readFileSync('supabase/migrations/20260609130000_053_b6_7_monitor_row_isolation_and_visibility.sql', 'utf8');
const monitorFn = readFileSync('supabase/functions/binance-testnet-monitor/index.ts', 'utf8');

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
for (const value of ['protected_native','protected_managed','closed_timeout','closed_synced']) {
  assert.match(b6Sql, new RegExp(`'${value}'`), `B6 execution_orders.status allows ${value}`);
}
assert.match(b6Sql, /admin_reset_trading_history_batch/, 'B6 adds batch reset function');
assert.match(b6Sql, /to_regclass\('public\.' \|\| t\)/, 'B6 batch reset skips absent optional tables');
assert.match(b6Sql, /time_stop_deadline_at/, 'B6 stores time-stop deadline');

assert.match(b61Sql, /'telegram_deliveries',[\s\S]*'execution_event_logs',[\s\S]*'execution_orders',[\s\S]*'signal_updates',[\s\S]*'signal_outcomes',[\s\S]*'outcomes',[\s\S]*'signals'/, 'B6.1 reset deletes signal dependents before signals');
assert.match(b61Sql, /'signals',[\s\S]*'strategy_candidates',[\s\S]*'scanner_candidates',[\s\S]*'rejected_setups',[\s\S]*'scanner_runs'/, 'B6.1 reset deletes candidate and scanner history after signals');
for (const preserved of ['customers','packages','subscriptions','scanner_config','strategy_configs','execution_settings','telegram config','bot setup records']) {
  assert.match(b61Sql, new RegExp(`'${preserved}'`), `B6.1 reset preserves ${preserved}`);
}
assert.match(b61Sql, /to_regclass\('public\.' \|\| t\)/, 'B6.1 batch reset skips absent optional tables');
assert.match(b61Sql, /LIMIT %s/, 'B6.1 reset remains batch-safe');
assert.match(b62Sql, /reset_scope', 'performance_history_only'/, 'B6.2 performance reset is explicitly history-only');
assert.match(b62Sql, /'execution_orders'[\s\S]*WHERE signal_id IS NOT NULL/, 'B6.2 reset only deletes DB execution orders linked to old signals');
assert.match(b62Sql, /'governor reset'/, 'B6.2 reset documents governor preservation');
assert.match(b62Sql, /failed_execution_streak/, 'B6.2 persists failed execution streak separate from history rows');
assert.match(b62Sql, /closed_sl_streak/, 'B6.2 persists closed SL streak separate from history rows');

assert.match(b63Sql, /greatest\(25, least\(coalesce\(p_batch_size, 50\), 100\)\)/, 'B6.3 clamps reset batches to small timeout-safe sizes');
assert.match(b63Sql, /'telegram_deliveries',[\s\S]*'signal_updates',[\s\S]*'signal_outcomes',[\s\S]*'outcomes',[\s\S]*'execution_event_logs',[\s\S]*'execution_orders',[\s\S]*'paper_execution_intents',[\s\S]*'rejected_setups',[\s\S]*'signals',[\s\S]*'strategy_candidates'/, 'B6.3 reset uses child-first current-schema delete order');
assert.match(b63Sql, /remaining_counts/, 'B6.3 reset returns remaining counts for UI verification');
assert.match(b63Sql, /p_until_empty boolean DEFAULT false/, 'B6.3 reset accepts until-empty acceptance guard flag');
assert.match(b63Sql, /'success', NOT/, 'B6.3 reset success is false while remaining source rows exist');
assert.match(b63Sql, /remaining_signals/, 'B6.3 reset acceptance explicitly checks remaining signals');
assert.match(b63Sql, /'scanner_config',[\s\S]*'strategy_configs',[\s\S]*'execution_settings'/, 'B6.3 reset preserves scanner, strategy, and execution settings');
assert.doesNotMatch(b63Sql, /DELETE FROM public\.scanner_runs/, 'B6.3 preserves scanner_runs like the original performance reset');

for (const field of ['sl_algo_id','tp1_algo_id','tp2_algo_id','sl_client_algo_id','tp1_client_algo_id','tp2_client_algo_id','native_protection_verified','managed_fallback_active']) {
  assert.match(b64Sql, new RegExp(field), `B6.4 adds ${field}`);
}
assert.match(b64Sql, /protected_native/, 'B6.4 allows protected_native protection status');
for (const value of ['entry_timeout_cancelled','entry_missing_no_position','closed_unprotected_safety']) {
  assert.match(b66Sql, new RegExp(`'${value}'`), `B6.6 execution_orders.status allows ${value}`);
}
assert.match(b66Sql, /pending_protection/, 'B6.6 keeps protection pending states valid for monitor recovery');
for (const field of ['latest_monitor_error','latest_sync_error','last_monitor_action']) {
  assert.match(b67Sql, new RegExp(field), `B6.7 adds ${field}`);
}
assert.match(monitorFn, /for \(const row of[\s\S]*try[\s\S]*monitorRow\(supabase, row, stats\)[\s\S]*catch \(rowErr\)/, 'B6.7 isolates per-row monitor failures');
assert.match(monitorFn, /return jsonResponse\(\{ success: true, action: "binance_testnet_monitor"[\s\S]*row_errors/, 'B6.7 returns 200 summaries with row_errors');
assert.match(monitorFn, /orphan_protection_orders_cancelled/, 'B6.7 cancels orphan protection orders after manual close');
assert.match(monitorFn, /closed_unprotected_safety/, 'B6.7 retains safety close path for unprotected positions');

console.log('SQL constraint tests passed');
