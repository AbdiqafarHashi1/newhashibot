import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const resolver = readFileSync('supabase/functions/_shared/execution-ownership.ts', 'utf8');
const proof = readFileSync('supabase/functions/binance-testnet-execution/index.ts', 'utf8');
const bybitProof = readFileSync('supabase/functions/bybit-demo-execution/index.ts', 'utf8');

const explicit = resolver.indexOf('if (selection?.accountId)');
const operational = resolver.indexOf('attempts.operational_account = true');
const system = resolver.indexOf('attempts.system_secret = true');
assert.ok(explicit > 0 && operational > explicit && system > operational, 'credential priority must be explicit > operational > system secret');
assert.match(resolver, /invalid_explicit_account:\$\{provider\}:\$\{environment\}/, 'invalid explicit selection must block without fallback');
assert.match(resolver, /\.eq\("is_operational", true\)/, 'implicit connected account must be operational');
assert.match(resolver, /no_execution_credentials:\$\{provider\}:\$\{environment\}/, 'missing sources need actionable blocker');
assert.match(resolver, /OperatorCredentialResolutionError/, 'blocker must carry secret-safe attempt metadata separately');
for (const name of ['BINANCE_TESTNET_API_KEY','BINANCE_TESTNET_API_SECRET','BYBIT_DEMO_API_KEY','BYBIT_DEMO_API_SECRET','BYBIT_TESTNET_API_KEY','BYBIT_TESTNET_API_SECRET','BYBIT_API_KEY','BYBIT_API_SECRET']) assert.ok(resolver.includes(`"${name}"`), `${name} convention missing`);
assert.ok(resolver.indexOf('BYBIT_DEMO_API_KEY') < resolver.indexOf('BYBIT_TESTNET_API_KEY'), 'demo-specific names must precede legacy fallback');
const demoCandidates = resolver.match(/environment === "demo"\s*\? \[([^\n]+)\]/)?.[1] ?? '';
assert.ok(demoCandidates.includes('BYBIT_DEMO_API_KEY') && demoCandidates.includes('BYBIT_TESTNET_API_KEY'), 'normal Demo resolver retains Demo and legacy testnet candidates');
assert.ok(!demoCandidates.includes('BYBIT_API_KEY'), 'normal Demo execution must never fall back to live-named Pair B');
assert.ok(system < resolver.indexOf('if (credential) return'), 'system secret must be attempted before terminal blocker');
assert.match(proof, /withEdgeProviderCredential\(credential/);
assert.match(bybitProof, /withEdgeProviderCredential\(resolved\.credential/);
for (const source of [proof, bybitProof]) {
  assert.match(source, /mutations_attempted: 0/);
  assert.ok(!source.slice(source.indexOf('proveProviderReadOnly'), source.indexOf('function truthSideFromRow')).includes('POST'), 'read-only proof must not POST');
}
assert.ok(!bybitProof.includes('binance-testnet-execution'), 'Bybit proof must never invoke or report the Binance target');
const successResponse = bybitProof.match(/return \{ success: true,[^\n]+/)?.[0] ?? '';
assert.ok(successResponse && !successResponse.includes('apiKey') && !successResponse.includes('apiSecret'), 'Bybit success response must not serialize credential values');
console.log('operator credential resolution tests passed');
