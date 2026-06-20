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
const executionFn = readFileSync('supabase/functions/binance-testnet-execution/index.ts', 'utf8');
const xb1Sql = readFileSync('supabase/migrations/20260614190000_070_xb1_capital_profit_lock_real_integration.sql', 'utf8');
const cryptoFix1Sql = readFileSync('supabase/migrations/20260611120000_059_crypto_fix_1_testnet_risk_leverage_truth.sql', 'utf8');
const liveCronHeaderSql = readFileSync('supabase/migrations/20260613170000_067_live_cron_header_rebuild.sql', 'utf8');
const tradeSupervisorSql = readFileSync('supabase/migrations/20260618100000_080_trade_supervisor_always_on.sql', 'utf8');

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
assert.match(monitorFn, /unsafe_untracked_position/, 'Crypto Fix 1 monitor marks unsafe untracked Binance positions');
assert.match(monitorFn, /cancelRemainingProtection\(row, stats\)/, 'Crypto Fix 1 monitor cleans remaining conditionals on terminal exits');
assert.match(cryptoFix1Sql, /testnet_risk_a = 2\.0/, 'Crypto Fix 1 sets testnet A risk to 2%');
assert.match(cryptoFix1Sql, /testnet_leverage_a = 10/, 'Crypto Fix 1 sets testnet leverage to 10x');
assert.match(cryptoFix1Sql, /execution_mode = 'testnet'/, 'Crypto Fix 1 settings are testnet scoped');



for (const jobName of [
  'hashibot_binance_testnet_monitor_1m',
  'hashibot_morning_brief_0800',
  'hashibot_news_digest_1200',
  'hashibot_watchlist_patterns_1600',
  'hashibot_market_wrap_2000',
  'hashibot_test_morning_brief_1m',
  'hashibot_test_news_digest_1m',
  'hashibot_test_watchlist_patterns_1m',
  'hashibot_test_market_wrap_1m',
]) {
  assert.match(liveCronHeaderSql, new RegExp(jobName), `live cron header rebuild includes ${jobName}`);
}
assert.match(liveCronHeaderSql, /ADD COLUMN IF NOT EXISTS supabase_anon_key text/, 'live cron header rebuild adds scanner_config.supabase_anon_key');
assert.match(liveCronHeaderSql, /'apikey',[\s\S]*supabase_anon_key/, 'live cron header rebuild sends anon key apikey header');
assert.match(liveCronHeaderSql, /'Authorization',[\s\S]*'Bearer ' \|\|[\s\S]*supabase_anon_key/, 'live cron header rebuild sends anon key bearer Authorization');
assert.match(liveCronHeaderSql, /'x-hashibot-cron-token',[\s\S]*cron_pg_token/, 'live cron header rebuild sends cron token only as custom header');
assert.doesNotMatch(liveCronHeaderSql, /'Authorization',\s*'Bearer ' \|\| \(SELECT cron_pg_token/, 'live cron header rebuild never sends cron_pg_token directly in Authorization');


assert.match(tradeSupervisorSql, /hashibot_trade_supervisor_1m_binance/, 'X-G.7 schedules Binance trade supervisor cron');
assert.match(tradeSupervisorSql, /hashibot_trade_supervisor_1m_bybit/, 'X-G.7 schedules Bybit trade supervisor cron');
assert.match(tradeSupervisorSql, /run_trade_supervisor_cycle/, 'X-G.7 cron invokes supervisor action');
assert.match(tradeSupervisorSql, /trade_supervisor_interval_minutes/, 'X-G.7 exposes supervisor interval in DB config');
assert.match(tradeSupervisorSql, /trade_supervisor_last_run_at/, 'X-G.7 exposes supervisor last run in DB config');
assert.match(tradeSupervisorSql, /profit_lock_eligible/, 'X-G.7 adds profit lock hook fields');
assert.match(executionFn, /runTradeSupervisorCycle/, 'X-G.7 execution function has shared supervisor cycle');
assert.match(executionFn, /run_binance_monitor_now[\s\S]*runTradeSupervisorCycle\(supabase, "binance"/, 'Binance monitor action routes to supervisor');
assert.match(executionFn, /run_bybit_monitor_now[\s\S]*runTradeSupervisorCycle\(supabase, "bybit"/, 'Bybit monitor action routes to supervisor');

console.log('SQL constraint tests passed');

assert.match(executionFn, /applyMarginFallbackToPlan/, 'real execution path calls margin fallback integration');
assert.match(executionFn, /margin_asset_selected/, 'execution logs/payloads include selected margin asset');
assert.match(executionFn, /diagnose_margin_fallback/, 'safe diagnostic trigger exists for insufficient USDT fallback proof');
assert.match(monitorFn, /profitLockStudyUpdate/, 'real monitor loop records profit-lock study metrics');
assert.match(monitorFn, /mode !== "testnet_action"/, 'profit-lock actions are config gated in monitor');
assert.match(monitorFn, /replacement_sl_not_verified[\s\S]*oldSlAlgoId/, 'old SL cancellation only occurs after replacement verification');
assert.match(xb1Sql, /ADD COLUMN IF NOT EXISTS selected_margin_asset/, 'XB1 migration adds real margin proof columns');
assert.match(xb1Sql, /ADD COLUMN IF NOT EXISTS highest_positive_r_observed/, 'XB1 migration adds profit-lock study columns');

const xpSql = readFileSync('supabase/migrations/20260620120000_085_xp_execution_safety_runtime_truth.sql', 'utf8');
assert.match(xpSql, /CREATE TABLE IF NOT EXISTS public\.problem_symbol_quarantine/, 'X-P creates problem symbol quarantine table');
for (const field of ['provider','symbol','reason','first_seen','last_seen','failure_count','cooldown_until','disabled_for_execution','disabled_for_repair','recommended_action','metadata']) {
  assert.match(xpSql, new RegExp(field), `X-P quarantine includes ${field}`);
}
for (const reason of ['EXCHANGE_MAX_QTY_EXCEEDED','MIN_NOTIONAL_NOT_MET','INVALID_TRIGGER_DIRECTION','UNSUPPORTED_CONDITIONAL_ORDER','PROTECTION_VERIFICATION_FAILED','PRECISION_RULE_VIOLATION','STALE_ORDER_LOOP','REPEATED_REPAIR_FAILURE','EXCHANGE_REJECT','UNKNOWN_PROVIDER_FAILURE']) {
  assert.match(xpSql, new RegExp(reason), `X-P supports failure reason ${reason}`);
}
assert.match(xpSql, /CREATE OR REPLACE FUNCTION public\.record_symbol_failure/, 'X-P records symbol failures through DB function');
assert.match(xpSql, /disabled_for_execution = true[\s\S]*disabled_for_repair = true/, 'X-P threshold disables execution and repair');
assert.match(xpSql, /CREATE TABLE IF NOT EXISTS public\.telegram_alert_dedupe/, 'X-P creates Telegram dedupe table');
assert.match(xpSql, /CREATE TABLE IF NOT EXISTS public\.telegram_alert_cooldowns/, 'X-P creates Telegram cooldown table');
assert.match(xpSql, /CREATE TABLE IF NOT EXISTS public\.telegram_alert_digest/, 'X-P creates Telegram digest table');
assert.match(xpSql, /CREATE OR REPLACE VIEW public\.runtime_proof_view/, 'X-P creates runtime proof view');
assert.match(xpSql, /CREATE OR REPLACE VIEW public\.scheduler_truth_view/, 'X-P creates scheduler truth view');
assert.match(xpSql, /CREATE OR REPLACE VIEW public\.clean_trade_audit_view/, 'X-P creates clean trade audit view');
assert.match(xpSql, /CREATE OR REPLACE VIEW public\.provider_100_trade_readiness_view/, 'X-P creates provider 100-trade readiness view');
assert.match(xpSql, /execution_settings_live_trading_false_xp_check/, 'X-P reasserts live trading disabled');
assert.match(executionFn, /activeQuarantine\(supabase, "binance"[\s\S]*"execution"/, 'X-P Binance execution checks quarantine before submit');
assert.match(executionFn, /activeQuarantine\(supabase, "bybit"[\s\S]*"execution"/, 'X-P Bybit execution checks quarantine before submit');
assert.match(executionFn, /activeQuarantine\(supabase, providerName[\s\S]*"repair"/, 'X-P supervisor checks quarantine before repair');
assert.match(executionFn, /recordSymbolFailure\(supabase, "binance"/, 'X-P Binance failures are recorded for quarantine');
assert.match(executionFn, /recordSymbolFailure\(supabase, "bybit"/, 'X-P Bybit failures are recorded for quarantine');
assert.match(executionFn, /verifyBybitProtectionSet/, 'X-P Bybit protection uses strict verification helper');
assert.doesNotMatch(executionFn, /linkText\.includes\("sl"\)/, 'X-P Bybit protection no longer verifies by link-text string matching');
