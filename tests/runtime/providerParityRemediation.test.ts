import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const execution = readFileSync('supabase/functions/binance-testnet-execution/index.ts', 'utf8');
const bybitMonitor = readFileSync('supabase/functions/bybit-testnet-monitor/index.ts', 'utf8');
const operator = readFileSync('supabase/functions/admin-operator-action/index.ts', 'utf8');

const bybitStart = execution.indexOf('async function executeBybitSignal');
const bybitEnd = execution.indexOf('async function routeSignalToEnabledProviders');
const bybit = execution.slice(bybitStart, bybitEnd);
const entrySubmit = bybit.indexOf('entry LIMIT order submitted');
const positionFetch = bybit.indexOf('/v5/position/list');
const positionConfirmed = bybit.indexOf('position_confirmed: true');
const slSubmit = bybit.indexOf("createBybitOrderLinkId(sig.id, 'sl')");
assert.ok(entrySubmit > 0 && positionFetch > entrySubmit && positionConfirmed > positionFetch && slSubmit > positionConfirmed, 'Bybit must confirm a real position before protection');
assert.match(bybit, /submitted_order: entryAccepted/);
assert.match(bybit, /protection_status: unsafeAfterEntry \? "protection_failed"/);
assert.ok(!bybit.includes('p_environment: "demo"'), 'execution truth must use resolved Bybit environment');
assert.match(bybit, /p_environment: bybitExecutionEnvironment\(\)/);
assert.ok(!execution.includes('providerName === "binance" ? "testnet" : "demo"'), 'shared truth/heartbeat environment must remain canonical');
assert.match(execution, /resolveOperatorProviderCredential\(supabase, providerName, environment, selection\)/);
assert.match(execution, /withEdgeProviderCredential\(resolved\.credential/);
assert.match(operator, /action: "sync_all_positions_now"[^\n]+customer_id: account\?\.customerId, account_id: account\?\.accountId/);
assert.match(operator, /action: "repair_all_protection_now"[^\n]+customer_id: account\?\.customerId, account_id: account\?\.accountId/);
for (const marker of ['untrackedPositions', 'orphanOrders', 'unsafe_untracked_position', 'orphan_provider_order_cleanup_retry', 'reconciliation_sync']) assert.ok(bybitMonitor.includes(marker), `Bybit reconciliation missing ${marker}`);
console.log('provider parity remediation tests passed');
