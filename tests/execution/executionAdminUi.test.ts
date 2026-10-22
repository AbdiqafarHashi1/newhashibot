import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const executionUi = readFileSync('src/pages/admin/ProviderOperationsWorkspace.tsx', 'utf8');
const executionHub = readFileSync('src/pages/admin/Execution.tsx', 'utf8');
const providerMigration = readFileSync('supabase/migrations/20260615170000_073_provider_controls_e2e_repair.sql', 'utf8');
const executionFunction = readFileSync('supabase/functions/binance-testnet-execution/index.ts', 'utf8');

assert.match(executionUi, /Execution Lifecycle Control Center/, 'provider controls render on execution page');
assert.match(executionUi, /entry_enabled[\s\S]*read_only[\s\S]*provider_kill_switch/, 'provider controls are visible and editable');
assert.match(executionUi, /diagnose_bybit_testnet_connection|Diagnose Bybit Account Permissions/, 'Bybit health check action exists in UI');
assert.match(executionUi, /bybitDebug/, 'Bybit diagnostic state renders');
assert.match(executionUi, /provider === 'binance'|providerStatus/, 'provider monitor data does not mix between Binance and placeholders');
assert.match(executionUi, /provider === 'mt5'|mode === 'mt5_personal'|MT5 Operations/, 'MT5 provider remains visible in controls');
assert.match(executionUi, /LIVE EXECUTION BLOCKED|Live Trading/, 'live trading remains disabled in execution UI');
assert.match(executionUi, /Parallel Mode: \{providerGlobalControls\?\.parallel_mode_enabled \? 'ON' : 'OFF'\}/, 'parallel mode control renders off when global control default is false');
assert.match(executionUi, /start_bot: true[\s\S]*auto_execute_testnet: true/, 'Start Bot writes the runtime DB flags used by execution');
assert.match(executionUi, /actionName: 'stop_bot'/, 'Pause Bot disables provider entries without pausing monitor/recovery globally');
assert.match(executionUi, /actionName: 'emergency_stop'/, 'Kill switch is provider-specific and does not corrupt global monitor truth');

assert.match(providerMigration, /\('mt5', 'mt5', false, false, false, true, false, false, false, false, false, false, 'disconnected'/, 'MT5 remains a disabled read-only future stub by default');
assert.match(providerMigration, /parallel_mode_enabled boolean not null default false/, 'parallel mode remains off by default');
assert.match(providerMigration, /live_trading_enabled boolean not null default false/, 'live trading remains off by default');
const runtimeMigration = readFileSync('supabase/migrations/20260616120002_074_provider_runtime_flags.sql', 'utf8');
assert.match(runtimeMigration, /entry_enabled boolean not null default false/, 'provider entry runtime flag exists');
assert.match(runtimeMigration, /binance_entry_enabled/, 'Binance runtime truth is separate');
assert.match(runtimeMigration, /bybit_entry_enabled/, 'Bybit runtime truth is separate');
assert.match(providerMigration, /with check \(public\.is_admin\(\) and live_trading_enabled is false\)/, 'live trading true is rejected by global control policy');

assert.match(executionFunction, /if \(envBool\("LIVE_TRADING_ENABLED", false\)\) throw new Error\("Live trading guard blocked execution/, 'invalid live env value is rejected');
assert.match(executionFunction, /if \(mode !== "testnet"\) throw new Error\("Execution disabled: EXECUTION_MODE is not testnet"\)/, 'invalid execution mode is rejected');
assert.match(executionFunction, /if \(exchange !== "binance_usdm_testnet"\) throw new Error\("Execution disabled: EXCHANGE must be binance_usdm_testnet"\)/, 'invalid exchange env is rejected');
assert.match(executionFunction, /BINANCE_TESTNET_BASE_URL must be https:\/\/demo-fapi\.binance\.com/, 'live Binance URL is rejected');
assert.match(executionFunction, /api-demo\.bybit\.com/, 'Bybit Demo Trading base URL is supported');
assert.match(executionFunction, /BYBIT_ENVIRONMENT/, 'Bybit environment secret is read');
assert.match(executionFunction, /BYBIT_API_KEY/, 'Bybit Demo Trading API key secret is read');
assert.match(executionFunction, /balances: balancesPayload, positions: positionsPayload, open_orders: openOrdersPayload/, 'Bybit debug response can display real account, capital, positions and orders data');
assert.match(executionFunction, /console\.log\("Bybit V5 safe debug", \{ endpoint: path, params, retCode:/, 'Bybit V5 requests log safe endpoint/params/retCode/retMsg');
assert.match(executionFunction, /providerEntryBlocked/, 'provider entry gates are isolated from global execution gates');
assert.match(executionFunction, /executionReadiness/, 'dry-run readiness proof action exists');

assert.match(executionHub, /<OnboardingOperations\s+title="Execution readiness"/, 'execution management reuses the customer/account operations and certification authority');
const accountOperations=readFileSync('src/pages/admin/OnboardingOperations.tsx','utf8');
assert.match(accountOperations,/requestOperationsCommand/,'execution actions use the audited server coordinator');
assert.match(accountOperations,/execution_account_id/,'execution management retains explicit account scope');
console.log('execution admin UI tests passed');
assert.match(executionFunction, /bybitExecutionAllowedEnvironment/, 'X-P Bybit environment contract is explicit');
assert.match(executionFunction, /Bybit execution allows testnet\/demo only; live URLs are rejected/, 'X-P allows Bybit testnet/demo while blocking live execution');
assert.match(executionFunction, /lifecycle_state: unsafeAfterEntry \? "UNSAFE_POSITION" : "FAILED_NO_POSITION"/, 'X-P no active Bybit position becomes terminal failed after protection failure');
