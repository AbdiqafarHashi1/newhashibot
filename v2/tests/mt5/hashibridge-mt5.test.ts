import assert from 'node:assert/strict';
import test from 'node:test';
import { createBridgeRuntime, enqueueBridgeCommand, acknowledgeBridgeCommand, recordBridgeHeartbeat, replayUnacknowledged, validateEnvelope } from '../../hashibridge/core/index.js';
import { HashiBridgeDesktopAgent } from '../../hashibridge/desktop-agent/index.js';
import { MT5ProviderAdapter } from '../../hashibridge/provider/mt5-provider.js';
import { MT5PlatformService } from '../../services/mt5-platform/index.js';
import { ExchangeProviderExecutionAdapter } from '../../execution/adapters/provider-adapter.js';

test('bridge registration heartbeat reconnect recovery offline queue and duplicates', () => {
  const runtime = createBridgeRuntime({ bridgeId:'br1', customerId:'cust1', executorId:'exec1', machineId:'mach1', agentId:'agent1', version:'1.0.0', capabilities:['mt5'] });
  assert.equal(runtime.status, 'registered');
  const first = enqueueBridgeCommand(runtime, { commandId:'cmd1', type:'market_order', symbol:'EURUSD', payload:{ symbol:'EURUSD' }, idempotencyKey:'idem1' });
  const dup = enqueueBridgeCommand(runtime, { commandId:'cmd1b', type:'market_order', symbol:'EURUSD', payload:{ symbol:'EURUSD' }, idempotencyKey:'idem1' });
  assert.equal(first?.commandId, 'cmd1');
  assert.equal(dup?.commandId, 'cmd1');
  recordBridgeHeartbeat(runtime, { bridgeId:'br1', agentId:'agent1', status:'offline', latencyMs:10, reconnectCount:1, offlineDurationMs:5000, version:'1.0.0' });
  assert.equal(runtime.status, 'offline');
  runtime.queue[0].status = 'sent';
  assert.equal(replayUnacknowledged(runtime).length, 1);
  const ack = acknowledgeBridgeCommand(runtime, { commandId:'cmd1', bridgeId:'br1', ok:true, ticket:'123' });
  assert.equal(ack.ok, true);
});

test('desktop agent reports terminal state and queues while offline', () => {
  const agent = new HashiBridgeDesktopAgent({ bridgeId:'br2', customerId:'cust1', executorId:'exec1', machineId:'mach1', agentId:'agent2', version:'1.0.0', capabilities:['mt5'] });
  agent.receive({ commandId:'cmd2', type:'close_position', symbol:'XAUUSD', payload:{ symbol:'XAUUSD' }, idempotencyKey:'idem2' });
  assert.equal(agent.offlineQueue.length, 1);
  agent.connectTerminal({ terminalId:'term1', connected:true, accountLogin:'123', server:'Demo', balance:1000, equity:1000, margin:0, positions:[], orders:[], version:'mt5' });
  assert.equal(agent.accountState().terminalConnected, true);
  assert.equal(agent.ack('cmd2', true, 'ticket2').ok, true);
});

test('mt5 provider integrates through exchange provider contract and execution adapter', async () => {
  const runtime = createBridgeRuntime({ bridgeId:'br3', customerId:'cust1', executorId:'exec1', machineId:'mach1', agentId:'agent3', version:'1.0.0', capabilities:['mt5'] });
  const provider = new MT5ProviderAdapter({ bridge: runtime, accountId:'acct1', environment:'demo' });
  const adapter = new ExchangeProviderExecutionAdapter(provider);
  await adapter.connect();
  const result = await provider.placeEntryOrder({ signalId:'sig1', symbol:'EURUSD', side:'long', quantity:1, stopLoss:1.0, tp1:1.2, tp2:1.3 });
  assert.equal(result.ok, true);
  assert.equal(runtime.queue.length, 1);
  const health = await adapter.health();
  assert.equal(health.status, 'healthy');
});

test('mt5 platform enforces customer isolation and credential references', () => {
  const service = new MT5PlatformService();
  service.registerAccount({ accountId:'acct1', customerId:'cust1', executorId:'exec1', bridgeId:'br1', login:'123', server:'Demo', environment:'demo', credentialRef:'vault://mt5/acct1/trade', capabilities:['market','pending'], metadata:{} });
  assert.equal(service.listCustomerAccounts('cust1')[0].credentialRef, 'redacted');
  assert.equal(service.assertExecutorOwnership('cust1','exec1'), true);
  assert.throws(() => service.requestRecovery('cust2','acct1','test'), /customer isolation/);
  assert.throws(() => service.registerAccount({ accountId:'acct2', customerId:'cust1', executorId:'exec1', bridgeId:'br1', login:'456', server:'Demo', environment:'demo', credentialRef:'vault://x', capabilities:[], metadata:{ password:'bad' } }), /passwords/);
});

test('bridge envelope validation protects replay and customer scope', () => {
  const base = { envelopeId:'env1', customerId:'cust1', executorId:'exec1', bridgeId:'br1', nonce:'nonce1', issuedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+10000).toISOString(), schemaVersion:'hashibridge.v1' as const, compressed:false, encryption:'ready' as const, payload:{} };
  assert.equal(validateEnvelope(base, 'cust1'), true);
  assert.throws(() => validateEnvelope({ ...base, customerId:'cust2' }, 'cust1'), /customer isolation/);
});
