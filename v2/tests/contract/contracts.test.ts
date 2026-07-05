import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, signalTransitions, commandTransitions } from '../../packages/state-machines/index.js';
import { isBaseEvent } from '../../packages/events/index.js';
import { MockExecutionAdapter } from '../../execution/adapters/mock/index.js';
import type { Command } from '../../execution/command-queue/index.js';
import type { CommandId, Signal, SignalId } from '../../packages/types/index.js';

test('state machines allow valid and reject invalid transitions', () => {
  assert.equal(canTransition(signalTransitions, 'Created', 'Candidate'), true);
  assert.equal(canTransition(signalTransitions, 'Created', 'Executed'), false);
  assert.equal(canTransition(commandTransitions, 'Queued', 'Sent'), true);
  assert.equal(canTransition(commandTransitions, 'Verified', 'Sent'), false);
});

test('events conform to base event shape', () => {
  assert.equal(isBaseEvent({ eventId:'evt_1', eventType:'SignalApproved', occurredAt:new Date(0).toISOString(), correlationId:'corr_1', causationId:'evt_0', source:'contract-test', version:1, payload:{ signalId:'sig_1' as SignalId } }), true);
});

test('mock adapter satisfies execution adapter interface', async () => {
  const adapter = new MockExecutionAdapter();
  await adapter.connect();
  assert.equal((await adapter.health()).status, 'healthy');
  assert.deepEqual(await adapter.getOrders('acct_1'), []);
});

test('command idempotency key shape exists', () => {
  const command = { id:'cmd_1' as CommandId, idempotencyKey:'cust_1:acct_1:sig_1:OpenPosition', customerId:'cust_1', executorId:'exec_1', accountId:'acct_1', signalId:'sig_1' as SignalId, adapterType:'mock', action:'OpenPosition', payload:{}, state:'Queued', retryPolicy:{maxAttempts:3,backoffMs:100,retryableErrors:[]}, verificationPolicy:{required:true,timeoutMs:1000,checks:['position']}, createdAt:new Date(0).toISOString(), updatedAt:new Date(0).toISOString() } satisfies Command;
  assert.match(command.idempotencyKey, /^cust_1:acct_1:sig_1:OpenPosition$/);
});

test('signal object includes required immutable contract fields', () => {
  const signal = { signalId:'sig_1' as SignalId, market:'crypto', symbol:'BTCUSDT', timeframe:'5m', direction:'long', strategyId:'micro-scalper', strategyVersion:'0.0.0', entry:100, stopLoss:95, takeProfits:[110], riskMetadata:{maxRiskPct:1}, confidence:0.7, score:70, expectedDuration:'PT30M', createdAt:new Date(0).toISOString(), expiresAt:new Date(1).toISOString(), lifecycleState:'Approved', immutableVersion:1, reasons:['contract test'], invalidationRules:[] } satisfies Signal;
  assert.equal(signal.immutableVersion, 1);
  assert.equal(signal.lifecycleState, 'Approved');
});
