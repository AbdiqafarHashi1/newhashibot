import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync(join(process.cwd(), 'package.json')) && readFileSync(join(process.cwd(), 'package.json'), 'utf8').includes('hashibot-v2') ? process.cwd() : join(process.cwd(), 'v2');
const functions = ['bridge-register','bridge-heartbeat','bridge-sync','mt5-account-register','mt5-terminal-health','mt5-recovery'];
const shared = readFileSync(join(root, 'supabase/functions/_shared/hashibridge-edge.ts'), 'utf8');
const source = (name: string) => readFileSync(join(root, `supabase/functions/${name}/index.ts`), 'utf8');

test('HashiBridge and MT5 Edge Functions are deployable Deno HTTP functions using shared hardening utilities', () => {
  for (const name of functions) {
    const text = source(name);
    assert.match(text, /Deno\.serve/);
    assert.match(text, /_shared\/hashibridge-edge\.ts/);
    assert.doesNotMatch(text, /export function handler\(/);
    assert.doesNotMatch(text, /from ['"].*(strategies|hashicore|binance|bybit)/i);
    assert.doesNotMatch(text, /place(Order|Entry)|calculateRisk|indicator|strategy/i);
  }
});

test('shared HashiBridge Edge utility implements signature verification, replay protection, sanitizer, compact guard, and structured responses', () => {
  for (const token of ['HASHIBRIDGE_SHARED_SECRET','x-hashibridge-device-id','x-hashibridge-timestamp','x-hashibridge-nonce','x-hashibridge-signature','stale_timestamp','invalid_signature','sanitizePayload','compact','jsonResponse','errorResponse','serviceClient']) assert.ok(shared.includes(token), token);
  assert.match(shared, /HMAC/);
  assert.match(shared, /SHA-256/);
  assert.match(shared, /5 \* 60 \* 1000/);
});

test('bridge functions cover registration heartbeat sync persistence and ownership boundaries', () => {
  const register = source('bridge-register');
  assert.match(register, /v2_mt5_bridges/); assert.match(register, /v2_mt5_agents/); assert.match(register, /assertScope/); assert.match(register, /bridge\.registered/);
  const heartbeat = source('bridge-heartbeat');
  assert.match(heartbeat, /getBridgeOrThrow/); assert.match(heartbeat, /v2_mt5_health/); assert.match(heartbeat, /offline_duration_seconds/); assert.match(heartbeat, /bridge\.heartbeat/);
  const sync = source('bridge-sync');
  assert.match(sync, /v2_execution_commands/); assert.match(sync, /acknowledgements/); assert.match(sync, /results/); assert.match(sync, /max_batch_size/); assert.match(sync, /v2_mt5_sync/);
});

test('MT5 functions cover account registration terminal health and recovery action creation without secrets', () => {
  const account = source('mt5-account-register');
  assert.match(account, /v2_mt5_accounts/); assert.match(account, /credential_ref/); assert.match(account, /secret_rejected/); assert.doesNotMatch(account, /password.*upsert/i);
  const terminal = source('mt5-terminal-health');
  assert.match(terminal, /parseSignedBridgeRequest/); assert.match(terminal, /v2_mt5_terminals/); assert.match(terminal, /v2_mt5_runtime/); assert.match(terminal, /open_positions_count/);
  const recovery = source('mt5-recovery');
  for (const action of ['reconnect_bridge','reconnect_terminal','replay_queue','reconcile_positions','repair_protection','resync_account','stop_mt5_executor','restart_mt5_executor']) assert.ok(recovery.includes(action), action);
  assert.match(recovery, /v2_mt5_recovery/); assert.match(recovery, /runtime_actions/); assert.doesNotMatch(recovery, /Binance|Bybit|OrderSend|WebRequest\(/);
});

test('deployment docs and migrations match HashiBridge and MT5 function/table requirements', () => {
  const edge = readFileSync(join(root, 'deploy/edge-functions.md'), 'utf8');
  const env = readFileSync(join(root, 'deploy/environment.md'), 'utf8');
  const secrets = readFileSync(join(root, 'deploy/secrets.md'), 'utf8');
  const migration = readFileSync(join(root, 'supabase/migrations/20260705200000_mt5_hashibridge.sql'), 'utf8');
  for (const name of functions) assert.ok(edge.includes(`\`${name}\``), name);
  for (const header of ['x-hashibridge-device-id','x-hashibridge-timestamp','x-hashibridge-nonce','x-hashibridge-signature']) assert.ok(edge.includes(header), header);
  for (const envName of ['HASHIBRIDGE_SHARED_SECRET','HASHIBRIDGE_DEVICE_ID','MT5_DEMO_ACCOUNT_ID','MT5_DEMO_SERVER']) assert.ok(env.includes(`\`${envName}\``), envName);
  assert.ok(secrets.includes('HASHIBRIDGE_SHARED_SECRET'));
  for (const table of ['v2_mt5_bridges','v2_mt5_agents','v2_mt5_terminals','v2_mt5_accounts','v2_mt5_sync','v2_mt5_health','v2_mt5_recovery','v2_bridge_events','v2_bridge_logs']) assert.ok(migration.includes(table), table);
});
