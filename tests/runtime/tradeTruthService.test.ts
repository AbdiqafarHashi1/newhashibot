import assert from 'node:assert/strict';
import { InMemoryTradeTruthRepository, TradeTruthService, mapLegacyTradeTruthRow } from '../../src/lib/runtime/tradeTruth/index.js';
import type { TradeTruthCreateInput } from '../../src/lib/runtime/tradeTruth/index.js';

const ctx = { writer: 'trade_truth_service' as const, correlation_id: 'corr-test', timestamp: '2026-07-14T00:00:00.000Z' };

function baseInput(overrides: Partial<TradeTruthCreateInput> = {}): TradeTruthCreateInput {
  return {
    trade_id: 'trade-1',
    signal_id: 'signal-1',
    environment_id: 'testnet',
    provider_id: 'binance_testnet',
    account_id: 'acct-1',
    symbol: 'BTCUSDT',
    signal_direction: 'buy',
    position_side: 'long',
    statuses: { trade_lifecycle_state: 'signal_created' as const },
    ...overrides,
  };
}

async function createService(input = baseInput()) {
  const repo = new InMemoryTradeTruthRepository();
  const service = new TradeTruthService(repo);
  const created = await service.createTradeTruth(input, ctx);
  if (!created.ok) throw new Error((created as { error: { message: string } }).error.message);
  return { repo, service, created: created.value };
}

{
  const { created } = await createService();
  assert.equal(created.trade_lifecycle_state, 'signal_created');
  assert.equal(created.execution_status, 'created');
  assert.equal(created.position_side, 'long');
}

{
  const repo = new InMemoryTradeTruthRepository();
  const service = new TradeTruthService(repo);
  const result = await service.createTradeTruth(baseInput({ statuses: { trade_lifecycle_state: null } }), ctx);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'missing_runtime_status');
    assert.equal(result.error.retryable, false);
  }
}

{
  const repo = new InMemoryTradeTruthRepository();
  const service = new TradeTruthService(repo);
  const result = await service.createTradeTruth(baseInput({ statuses: { execution_status: 'protected_native' as never } }), ctx);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'protection_status_as_execution_status');
}

{
  const { created } = await createService(baseInput({ position_side: undefined, signal_direction: 'sell' }));
  assert.equal(created.position_side, 'short');
  assert.equal(created.signal_direction, 'sell');
}

{
  const repo = new InMemoryTradeTruthRepository();
  const service = new TradeTruthService(repo);
  const result = await service.createTradeTruth(baseInput({ position_side: 'sideways' }), ctx);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'invalid_position_side');
}

{
  const repo = new InMemoryTradeTruthRepository();
  const service = new TradeTruthService(repo);
  const result = await service.createTradeTruth(baseInput({ provider_id: '' }), ctx);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'missing_provider_id');
}

{
  const repo = new InMemoryTradeTruthRepository();
  const service = new TradeTruthService(repo);
  const result = await service.createTradeTruth(baseInput({ account_id: '' }), ctx);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'missing_account_id');
}

{
  const { service } = await createService();
  assert.equal((await service.recordQualified('trade-1', ctx)).ok, true);
  assert.equal((await service.recordPositionSized('trade-1', ctx)).ok, true);
  assert.equal((await service.recordOrderSubmitted('trade-1', ctx)).ok, true);
  assert.equal((await service.recordOrderAccepted('trade-1', ctx)).ok, true);
  assert.equal((await service.recordFill('trade-1', ctx)).ok, true);
  assert.equal((await service.recordProtectionPending('trade-1', ctx)).ok, true);
  assert.equal((await service.recordProtectionVerified('trade-1', ctx)).ok, true);
  assert.equal((await service.recordTp1('trade-1', ctx)).ok, true);
  assert.equal((await service.recordBreakEven('trade-1', ctx)).ok, true);
  assert.equal((await service.recordTp2('trade-1', ctx)).ok, true);
  assert.equal((await service.recordClosed('trade-1', ctx)).ok, true);
  assert.equal((await service.recordArchived('trade-1', ctx)).ok, true);
}

{
  const { service } = await createService(baseInput({ statuses: { trade_lifecycle_state: 'closed' } }));
  const result = await service.recordFill('trade-1', ctx);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'invalid_lifecycle_transition');
}

{
  const { service } = await createService();
  const result = await service.recordProtectionVerified('trade-1', ctx);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'invalid_lifecycle_transition');
}

{
  const { service } = await createService();
  await service.recordQualified('trade-1', ctx);
  await service.recordPositionSized('trade-1', ctx);
  const first = await service.recordOrderSubmitted('trade-1', { ...ctx, idempotency_key: 'submit-1' });
  const second = await service.recordOrderSubmitted('trade-1', { ...ctx, idempotency_key: 'submit-1' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.idempotent, true);
}

{
  const { service } = await createService(baseInput({ statuses: { trade_lifecycle_state: 'closed' } }));
  const result = await service.recordOrderSubmitted('trade-1', ctx);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.retryable, false);
}

{
  const { repo, service } = await createService(baseInput({ statuses: { trade_lifecycle_state: 'closed' } }));
  await service.createTradeTruth(baseInput({ trade_id: 'trade-2', symbol: 'BTCUSDT', statuses: { trade_lifecycle_state: 'signal_created' } }), ctx);
  const active = await repo.getActiveByProviderAccountSymbol('binance_testnet', 'acct-1', 'BTCUSDT');
  assert.deepEqual(active.map((record) => String(record.trade_id)), ['trade-2']);
}

{
  const mapped = mapLegacyTradeTruthRow({ id: 'legacy-1', provider: 'binance_testnet', environment: 'testnet', account_id: 'acct-1', symbol: 'ETHUSDT', direction: 'buy', status: 'protected_native', protection_status: 'protected_native' });
  assert.equal(mapped.ok, true);
  if (mapped.ok) {
    assert.equal(mapped.record.protection_status, 'verified');
    assert.equal(mapped.record.trade_lifecycle_state, 'protection_verified');
  }
}

{
  const mapped = mapLegacyTradeTruthRow({ id: 'legacy-2', provider: 'binance_testnet', environment: 'testnet', account_id: 'acct-1', symbol: 'ETHUSDT', side: 'short', status: 'entry_filled', protection_status: 'protection_failed' });
  assert.equal(mapped.ok, true);
  if (mapped.ok) assert.equal(mapped.record.protection_status, 'failed');
}

{
  const mapped = mapLegacyTradeTruthRow({ id: 'legacy-3', provider: 'binance_testnet', environment: 'testnet', account_id: 'acct-1', symbol: 'ETHUSDT', side: 'long', status: null });
  assert.equal(mapped.ok, false);
  if (!mapped.ok) {
    assert.equal(mapped.error.code, 'missing_runtime_status');
    assert.equal(mapped.drift, 'unrecoverable_malformed_truth');
  }
}

console.log('tradeTruthService tests passed');
