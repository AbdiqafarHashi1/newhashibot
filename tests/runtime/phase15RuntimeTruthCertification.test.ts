import assert from 'node:assert/strict';
import { certifyTradeTruth, classifyRuntimeWarning, DASHBOARD_TRUTH_INVENTORY, DEAD_CODE_AUDIT_FINDINGS, EXECUTION_LIFECYCLE_STAGES, operatorNavigationPages, OPERATOR_PAGE_RESPONSIBILITY, PROTECTION_STAGES, RUNTIME_WIDGET_CANONICAL_OWNERS, schedulerModeLabel, TELEGRAM_READINESS_DEPENDENCIES, WARNING_CLASSIFICATION } from '../../src/lib/runtimeTruthCertification.js';

const synced = certifyTradeTruth([
  { id: 'eo-1', execution_provider: 'binance', environment: 'testnet', symbol: 'BTCUSDT', side: 'long', status: 'protected_native' },
], [
  { id: 'tt-1', execution_order_id: 'eo-1', provider: 'binance', environment: 'testnet', symbol: 'BTCUSDT', side: 'long', status: 'protected_native', protection_status: 'verified' },
]);
assert.equal(synced.status, 'LIVE');
assert.equal(synced.orphanExecutionOrderIds.length, 0);
assert.equal(synced.orphanTruthIds.length, 0);
assert.equal(synced.duplicateTruthKeys.length, 0);

const orphanExecution = certifyTradeTruth([{ id: 'eo-2', execution_provider: 'bybit', environment: 'testnet', symbol: 'ETHUSDT', side: 'short', status: 'entry_filled' }], []);
assert.equal(orphanExecution.status, 'FAILED');
assert.deepEqual(orphanExecution.orphanExecutionOrderIds, ['eo-2']);

const duplicateTruth = certifyTradeTruth([{ id: 'eo-3', execution_provider: 'binance', environment: 'testnet', symbol: 'SOLUSDT', side: 'long', status: 'protected_native' }], [
  { id: 'tt-3a', execution_order_id: 'eo-3', provider: 'binance', environment: 'testnet', symbol: 'SOLUSDT', side: 'long' },
  { id: 'tt-3b', execution_order_id: 'eo-3', provider: 'binance', environment: 'testnet', symbol: 'SOLUSDT', side: 'long' },
]);
assert.equal(duplicateTruth.status, 'FAILED');
assert.deepEqual(duplicateTruth.duplicateTruthKeys, ['eo-3']);

assert.equal(schedulerModeLabel(false).label, 'Manual Mode');
assert.equal(schedulerModeLabel(false).status, 'DISABLED');
assert.equal(schedulerModeLabel(false).warning, 'Expected');

for (const required of ['Runtime Proof','Trade Truth','Protection','Scheduler']) assert.ok(DASHBOARD_TRUTH_INVENTORY.some((row) => row.value === required));
assert.equal(new Set(Object.values(RUNTIME_WIDGET_CANONICAL_OWNERS)).has('Runtime & Proofs'), true);
assert.equal(OPERATOR_PAGE_RESPONSIBILITY['Scheduler Guide'].includes('Manual Mode'), true);
assert.deepEqual(EXECUTION_LIFECYCLE_STAGES.includes('Recovered'), true);
assert.deepEqual(PROTECTION_STAGES.includes('Orphan cleanup'), true);
assert.equal(operatorNavigationPages().length, 18);
assert.equal(new Set(operatorNavigationPages()).size, 18);
assert.equal(classifyRuntimeWarning('schedulerCronOff'), 'Expected');
assert.equal(WARNING_CLASSIFICATION.mt5PreAdapter.classification, 'Adapter Pending');
assert.equal(TELEGRAM_READINESS_DEPENDENCIES.every((row) => row.implementation === 'not_started'), true);
assert.equal(DEAD_CODE_AUDIT_FINDINGS.some((row) => row.disposition.includes('retained')), true);

console.log('phase 1.5 runtime truth certification tests passed');
