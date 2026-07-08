import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scanner = readFileSync('supabase/functions/market-scanner/index.ts', 'utf8');
const recoverySql = readFileSync('supabase/migrations/20260707100000_090_v1_final_recovery_backend.sql', 'utf8');
const retentionSql = readFileSync('supabase/migrations/20260707090000_089_v1_platform_retention_backend.sql', 'utf8');
const backend = readFileSync('src/lib/hashibotBackend.ts', 'utf8');
const performance = readFileSync('src/pages/admin/Performance.tsx', 'utf8');
const liveState = readFileSync('src/hooks/useAdminLiveState.ts', 'utf8');
const retentionPage = readFileSync('src/pages/admin/Retention.tsx', 'utf8');

for (const file of [performance, liveState]) {
  assert.doesNotMatch(file, /select\(['"]\*['"]\)/, 'high-risk admin surfaces must not use dashboard select(*)');
  assert.doesNotMatch(file, /limit\(5000\)|limit\(1000\)/, 'high-risk admin surfaces must not use 1000/5000 row reads');
}

assert.match(backend, /getPerformanceSummary/, 'backend facade exposes compact performance summary');
assert.match(backend, /getProviderOperationsSummary/, 'backend facade exposes provider operations summary');
assert.match(backend, /getTradingBrainSummary/, 'backend facade exposes trading brain summary');
assert.match(backend, /getSignalsManagerSummary/, 'backend facade exposes signals manager summary');
assert.match(backend, /getScannerCandidates/, 'backend facade exposes scanner candidates pagination');
assert.match(backend, /getRejectedSetups/, 'backend facade exposes rejected setup pagination');
assert.match(backend, /getProviderHealthSummary/, 'backend facade exposes provider health summary');
assert.match(backend, /getProviderComparisonSummary/, 'backend facade exposes provider comparison summary');
assert.match(backend, /getOutcomeTrackingSummary/, 'backend facade exposes outcome tracking summary');
assert.match(backend, /getTelegramStatus/, 'backend facade exposes Telegram status');
assert.match(backend, /getExecutionSummary/, 'backend facade exposes execution summary');

assert.match(scanner, /HASHIBOT_DISABLE_CANDLE_PERSISTENCE[\s\S]*\?\? "true"/, 'candle persistence is disabled by default');
assert.match(scanner, /if \(!SCANNER_DISABLE_CANDLE_PERSISTENCE\)[\s\S]*from\("candles"\)\.upsert/, 'candle persistence is gated by feature flag');
assert.match(scanner, /HASHIBOT_DISABLE_INDICATOR_SNAPSHOTS[\s\S]*\?\? "true"/, 'indicator snapshots disabled by default');
assert.match(scanner, /if \(!SCANNER_DISABLE_INDICATOR_SNAPSHOTS\)[\s\S]*from\("indicator_snapshots"\)\.upsert/, 'indicator persistence is gated by feature flag');
assert.match(scanner, /HASHIBOT_COMPACT_SCANNER_LOGS[\s\S]*\?\? "true"/, 'compact scanner logs enabled by default');

for (const protectedTable of ['profiles', 'packages', 'customer_subscriptions', 'telegram_links', 'strategy_configs', 'audit_logs']) {
  assert.doesNotMatch(retentionSql, new RegExp(`\\('${protectedTable}'`), `retention cleanup must not target protected table ${protectedTable}`);
  assert.doesNotMatch(recoverySql, new RegExp(`\\('${protectedTable}'`), `final cleanup must not target protected table ${protectedTable}`);
}

assert.match(recoverySql, /'crypto_core',true,true,true/, 'crypto core defaults enabled');
assert.match(recoverySql, /'crypto_extended',false,false,false/, 'crypto extended defaults disabled');
assert.match(recoverySql, /'forex_core',false,false,false/, 'forex core defaults disabled');
assert.match(recoverySql, /'forex_extended',false,false,false/, 'forex extended defaults disabled');

assert.match(recoverySql, /ForexMicroScalper[\s\S]*validation_status = 'shadow'/, 'ForexMicroScalper remains shadow validation');
assert.match(recoverySql, /ForexSwingContinuation[\s\S]*validation_status = 'shadow'/, 'ForexSwingContinuation remains shadow validation');
assert.match(recoverySql, /execution_enabled = false/, 'forex/MT5 execution is disabled by default');
assert.match(recoverySql, /signal_mode_allowed = false/, 'forex signal mode is not allowed by default');

for (const state of ['SIGNAL_CREATED','QUALIFIED','POSITION_SIZED','ORDER_SUBMITTED','FILLED','PROTECTED','TP1','BREAKEVEN','TP2','CLOSED','ARCHIVED','FAILED','RECOVERY_REQUIRED']) {
  assert.match(recoverySql, new RegExp(`'${state}'`), `shared execution lifecycle includes ${state}`);
}
assert.match(recoverySql, /idx_hashibot_one_active_trade_per_provider_symbol/, 'one active trade per provider/symbol guard exists');
assert.match(recoverySql, /hashibot_protection_events/, 'protection engine event table exists');
assert.match(recoverySql, /missing_sl/, 'protection events detect missing SL');
assert.match(recoverySql, /missing_tp/, 'protection events detect missing TP');

assert.match(recoverySql, /idx_telegram_delivery_dedupe_signal_type/, 'Telegram delivery dedupe index exists');
assert.match(recoverySql, /jsonb_build_array\('admin_ops','free','vip'\)/, 'Telegram channels are configurable/status-visible');
assert.match(recoverySql, /hashibridge_instances ADD COLUMN IF NOT EXISTS shared_secret_ref/, 'HashiBridge shared secret reference exists');
assert.match(recoverySql, /hashibridge_instances ADD COLUMN IF NOT EXISTS execution_enabled boolean NOT NULL DEFAULT false/, 'MT5 remains disabled unless enabled');
assert.match(retentionPage, /No retention targets returned|—/, 'admin pages provide empty states instead of fake success');

// Env-based scanner limit guards
assert.match(scanner, /SCANNER_MAX_CRYPTO_SYMBOLS/, 'market-scanner checks SCANNER_MAX_CRYPTO_SYMBOLS');
assert.match(scanner, /SCANNER_MAX_FOREX_SYMBOLS/, 'market-scanner checks SCANNER_MAX_FOREX_SYMBOLS');
assert.match(scanner, /SCANNER_MAX_SYMBOLS_PER_SCAN/, 'market-scanner checks SCANNER_MAX_SYMBOLS_PER_SCAN');

console.log('Recovery guard tests passed');
