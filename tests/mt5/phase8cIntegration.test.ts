import assert from 'node:assert/strict';

// Test Mock Types & Protocol Models for Phase 8C-2
interface BridgeHeartbeat {
  bridge_id: string;
  status: string;
  connection_info?: Record<string, unknown>;
}

interface CommandRecord {
  id: string;
  account_id: string;
  bridge_id: string;
  operation: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: 'pending' | 'claimed' | 'acknowledged' | 'failed' | 'expired';
  attempts: number;
  claimed_at?: string;
  acknowledged_at?: string;
  error_code?: string;
  error_message?: string;
  result?: Record<string, unknown>;
  created_at: string;
  expires_at: string;
}

interface SymbolSpecRecord {
  account_id: string;
  canonical_symbol: string;
  broker_symbol: string;
  digits: number;
  point: number;
  contract_size: number;
  volume_min: number;
  volume_max: number;
  volume_step: number;
  stops_level_points: number;
  fill_policies: string[];
}

class MemoryMT5BridgeStore {
  bridges = new Map<string, BridgeHeartbeat & { last_heartbeat_at: string }>();
  commands = new Map<string, CommandRecord>();
  symbolSpecs = new Map<string, SymbolSpecRecord>();
  accountStates = new Map<string, Record<string, unknown>>();

  async heartbeat(payload: BridgeHeartbeat) {
    if (!payload.bridge_id) throw new Error('Missing bridge_id');
    const rec = {
      ...payload,
      status: payload.status || 'online',
      last_heartbeat_at: new Date().toISOString()
    };
    this.bridges.set(payload.bridge_id, rec);
    return { success: true, registry: rec };
  }

  async pollCommands(bridgeId: string, maxLimit = 10) {
    if (!bridgeId) throw new Error('Missing bridge_id');
    const nowIso = new Date().toISOString();
    const leaseCutoff = Date.now() - 2 * 60 * 1000;

    const claimedList: CommandRecord[] = [];
    for (const cmd of this.commands.values()) {
      if (cmd.bridge_id !== bridgeId) continue;
      const isPending = cmd.status === 'pending';
      const isExpiredClaim = cmd.status === 'claimed' && cmd.claimed_at && new Date(cmd.claimed_at).getTime() < leaseCutoff;

      if (isPending || isExpiredClaim) {
        cmd.status = 'claimed';
        cmd.claimed_at = nowIso;
        cmd.attempts += 1;
        claimedList.push({ ...cmd });
        if (claimedList.length >= maxLimit) break;
      }
    }
    return { success: true, commands: claimedList };
  }

  async ackCommand(bridgeId: string, commandId: string, success: boolean, errorCode?: string, errorMessage?: string, result?: Record<string, unknown>) {
    const cmd = this.commands.get(commandId);
    if (!cmd || cmd.bridge_id !== bridgeId) throw new Error('Command not found or bridge mismatch');

    cmd.status = success ? 'acknowledged' : 'failed';
    cmd.acknowledged_at = new Date().toISOString();
    cmd.error_code = errorCode;
    cmd.error_message = errorMessage;
    cmd.result = result || {};
    return { success: true, command_id: commandId, status: cmd.status };
  }

  async syncState(bridgeId: string, accountId: string, accountNumber: string, snapshot: any) {
    if (!bridgeId) throw new Error('Missing bridge_id');

    // Rule evaluation
    const balance = snapshot.balance || 0;
    const equity = snapshot.equity || 0;
    const startBalance = 10000; // Mock profile start balance
    const maxDrawdownPct = 5.0; // 5% limit = $500
    const currentDrawdown = startBalance - equity;

    let breached = false;
    let breachReason: string | null = null;

    if (currentDrawdown >= startBalance * (maxDrawdownPct / 100)) {
      breached = true;
      breachReason = `Drawdown breach: $${currentDrawdown} >= $${startBalance * (maxDrawdownPct / 100)}`;
    }

    this.accountStates.set(accountId, {
      account_id: accountId,
      account_number: accountNumber,
      snapshot,
      breached,
      breachReason,
      last_sync_at: new Date().toISOString()
    });

    return { success: true, account_id: accountId, breached, breach_reason: breachReason };
  }

  async syncSymbols(bridgeId: string, accountId: string, specs: SymbolSpecRecord[]) {
    if (!bridgeId || !accountId || !Array.isArray(specs)) throw new Error('Invalid arguments');

    for (const s of specs) {
      const key = `${accountId}:${s.canonical_symbol}`;
      this.symbolSpecs.set(key, { ...s, account_id: accountId });
    }
    return { success: true, synced_count: specs.length };
  }
}

async function runTests() {
  console.log('Starting Phase 8C-2 MT5 Cloud Integration Verification Tests...');

  const store = new MemoryMT5BridgeStore();

  // Test 1: Heartbeat Action
  const hbRes = await store.heartbeat({ bridge_id: 'bridge-1', status: 'online', connection_info: { version: '1.0.0' } });
  assert.equal(hbRes.success, true);
  assert.equal(store.bridges.get('bridge-1')?.status, 'online');

  // Test 2: Enqueue & Poll Commands Action
  const now = new Date().toISOString();
  store.commands.set('cmd-101', {
    id: 'cmd-101',
    account_id: 'acc-01',
    bridge_id: 'bridge-1',
    operation: 'place_order',
    payload: { symbol: 'EURUSD', side: 'BUY', volume: 0.1 },
    idempotency_key: 'sig-101:acc-01',
    status: 'pending',
    attempts: 0,
    created_at: now,
    expires_at: new Date(Date.now() + 120000).toISOString()
  });

  const poll1 = await store.pollCommands('bridge-1');
  assert.equal(poll1.commands.length, 1);
  assert.equal(poll1.commands[0].id, 'cmd-101');
  assert.equal(poll1.commands[0].status, 'claimed');
  assert.equal(poll1.commands[0].attempts, 1);

  // Poll again immediately should return empty array (already claimed)
  const poll2 = await store.pollCommands('bridge-1');
  assert.equal(poll2.commands.length, 0);

  // Test 3: Command Ack Action
  const ackRes = await store.ackCommand('bridge-1', 'cmd-101', true, undefined, undefined, { ticket: '987654', deal_ticket: '123456' });
  assert.equal(ackRes.success, true);
  assert.equal(ackRes.status, 'acknowledged');
  assert.equal(store.commands.get('cmd-101')?.status, 'acknowledged');

  // Test 4: Lease Expiration Recovery
  store.commands.set('cmd-102', {
    id: 'cmd-102',
    account_id: 'acc-01',
    bridge_id: 'bridge-1',
    operation: 'close_position',
    payload: { ticket: '987654' },
    idempotency_key: 'sig-102:acc-01',
    status: 'claimed',
    attempts: 1,
    claimed_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 minutes ago
    created_at: now,
    expires_at: new Date(Date.now() + 120000).toISOString()
  });

  const poll3 = await store.pollCommands('bridge-1');
  assert.equal(poll3.commands.length, 1);
  assert.equal(poll3.commands[0].id, 'cmd-102');
  assert.equal(poll3.commands[0].attempts, 2);

  // Test 5: State Synchronization & Prop Drawdown Breach
  const syncSafe = await store.syncState('bridge-1', 'acc-01', '123456', { balance: 10000, equity: 9800, margin: 200, free_margin: 9600, floating_pnl: -200 });
  assert.equal(syncSafe.success, true);
  assert.equal(syncSafe.breached, false);

  const syncBreached = await store.syncState('bridge-1', 'acc-01', '123456', { balance: 10000, equity: 9400, margin: 200, free_margin: 9200, floating_pnl: -600 });
  assert.equal(syncBreached.success, true);
  assert.equal(syncBreached.breached, true);
  assert.match(String(syncBreached.breach_reason), /Drawdown breach/);

  // Test 6: Symbol Specs Sync
  const symRes = await store.syncSymbols('bridge-1', 'acc-01', [{
    account_id: 'acc-01',
    canonical_symbol: 'EURUSD',
    broker_symbol: 'EURUSD.a',
    digits: 5,
    point: 0.00001,
    contract_size: 100000,
    volume_min: 0.01,
    volume_max: 100.0,
    volume_step: 0.01,
    stops_level_points: 10,
    fill_policies: ['ioc', 'return']
  }]);
  assert.equal(symRes.success, true);
  assert.equal(symRes.synced_count, 1);
  assert.equal(store.symbolSpecs.get('acc-01:EURUSD')?.broker_symbol, 'EURUSD.a');

  console.log('All Phase 8C-2 MT5 integration tests passed successfully!');
}

void runTests();
