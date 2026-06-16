import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const executionUi = readFileSync('src/pages/admin/Execution.tsx', 'utf8');
const providerMigration = readFileSync('supabase/migrations/20260615170000_073_provider_controls_e2e_repair.sql', 'utf8');
const executionFunction = readFileSync('supabase/functions/binance-testnet-execution/index.ts', 'utf8');

assert.match(executionUi, /<h2 className="font-semibold text-sm">Provider Controls<\/h2>/, 'provider controls render on execution page');
assert.match(executionUi, /\['enabled', 'ON\/OFF'\][\s\S]*\['read_only', 'Read-only'\][\s\S]*\['monitor_enabled', 'Monitor'\]/, 'provider controls are visible and editable');
assert.match(executionUi, /Bybit Health Check/, 'Bybit health check action exists in UI');
assert.match(executionUi, /Bybit Account\/Capital Debug/, 'Bybit account/capital debug action exists in UI');
assert.match(executionUi, /Bybit Positions\/Orders Debug/, 'Bybit positions/orders debug action exists in UI');
assert.match(executionUi, /Bybit Testnet Monitor/, 'Bybit monitor panel exists');
assert.match(executionUi, /No Bybit health check run/, 'Bybit empty state renders before diagnostics run');
assert.match(executionUi, /balances: bybitDebug\?\.balances \?\? \[\]/, 'Bybit balances render separately from other providers');
assert.match(executionUi, /positions: bybitDebug\?\.positions \?\? \[\]/, 'Bybit positions render separately from other providers');
assert.match(executionUi, /open_orders: bybitDebug\?\.open_orders \?\? \[\]/, 'Bybit orders render separately from other providers');
assert.match(executionUi, /card\.provider === 'binance' \? monitorTruthStatus : \(providerStatus\.get\(card\.provider\)\?\.monitor_enabled \? 'Enabled' : 'Off'\)/, 'provider monitor data does not mix between Binance and placeholders');
assert.match(executionUi, /<option value="mt5">MT5<\/option>/, 'MT5 provider remains visible in controls');
assert.match(executionUi, /Live Trading: OFF/, 'live trading remains disabled in execution UI');
assert.match(executionUi, /Parallel Mode: \{providerGlobalControls\?\.parallel_mode_enabled \? 'ON' : 'OFF'\}/, 'parallel mode control renders off when global control default is false');
assert.match(executionUi, /start_bot: true[\s\S]*auto_execute_testnet: true[\s\S]*testnet_enabled: true[\s\S]*live_trading_enabled: false/, 'Start Bot writes the runtime DB flags used by execution and never enables live trading');
assert.match(executionUi, /pause_entries: true[\s\S]*bot_paused: false/, 'Pause Bot disables provider entries without pausing monitor/recovery globally');
assert.match(executionUi, /provider_kill_switch: true[\s\S]*kill_switch_enabled: false/, 'Kill switch is provider-specific and does not corrupt global monitor truth');

assert.match(providerMigration, /\('mt5', 'mt5', false, false, false, true, false, false, false, false, false, false, 'disconnected'/, 'MT5 remains a disabled read-only future stub by default');
assert.match(providerMigration, /parallel_mode_enabled boolean not null default false/, 'parallel mode remains off by default');
assert.match(providerMigration, /live_trading_enabled boolean not null default false/, 'live trading remains off by default');
const runtimeMigration = readFileSync('supabase/migrations/20260616120000_074_provider_runtime_flags.sql', 'utf8');
assert.match(runtimeMigration, /entry_enabled boolean not null default false/, 'provider entry runtime flag exists');
assert.match(runtimeMigration, /binance_entry_enabled/, 'Binance runtime truth is separate');
assert.match(runtimeMigration, /bybit_entry_enabled/, 'Bybit runtime truth is separate');
assert.match(providerMigration, /with check \(public\.is_admin\(\) and live_trading_enabled is false\)/, 'live trading true is rejected by global control policy');

assert.match(executionFunction, /if \(envBool\("LIVE_TRADING_ENABLED", false\)\) throw new Error\("Live trading guard blocked execution/, 'invalid live env value is rejected');
assert.match(executionFunction, /if \(mode !== "testnet"\) throw new Error\("Execution disabled: EXECUTION_MODE is not testnet"\)/, 'invalid execution mode is rejected');
assert.match(executionFunction, /if \(exchange !== "binance_usdm_testnet"\) throw new Error\("Execution disabled: EXCHANGE must be binance_usdm_testnet"\)/, 'invalid exchange env is rejected');
assert.match(executionFunction, /BINANCE_TESTNET_BASE_URL must be https:\/\/demo-fapi\.binance\.com/, 'live Binance URL is rejected');
assert.match(executionFunction, /Bybit health check is testnet-only: base URL must include testnet/, 'live Bybit URL is rejected');
assert.match(executionFunction, /balances: balancesPayload, positions: positionsPayload, open_orders: openOrdersPayload/, 'Bybit debug response can display real account, capital, positions and orders data');
assert.match(executionFunction, /console\.log\("Bybit V5 safe debug", \{ endpoint: path, params, retCode:/, 'Bybit V5 requests log safe endpoint/params/retCode/retMsg');
assert.match(executionFunction, /providerEntryBlocked/, 'provider entry gates are isolated from global execution gates');
assert.match(executionFunction, /executionReadiness/, 'dry-run readiness proof action exists');

console.log('execution admin UI tests passed');
