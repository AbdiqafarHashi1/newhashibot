import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frontend = readFileSync('src/lib/mt5Accounts.ts', 'utf8');
const edge = readFileSync('supabase/functions/mt5-accounts/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260728060000_phase5d_multi_account_mt5_bridge.sql', 'utf8');
const accountSchema = readFileSync('supabase/migrations/20260722020000_phase8a_mt5_execution_platform.sql', 'utf8');
const bridge = readFileSync('supabase/functions/mt5-bridge/index.ts', 'utf8');
const finalization = readFileSync('supabase/migrations/20260729010000_phase5d_bridge_finalization.sql', 'utf8');
const ui = readFileSync('src/lib/mt5Operations.ts', 'utf8');
const agent = readFileSync('mt5-agent/main.py', 'utf8');
const client = readFileSync('mt5-agent/cloud_client.py', 'utf8');
const hotfix = readFileSync('supabase/migrations/20260729020000_phase5d_bridge_registration_hotfix.sql', 'utf8');
const bridgeUi = readFileSync('src/components/operations/mt5/MT5BridgesTab.tsx', 'utf8');

assert.match(frontend, /supabase\.auth\.getSession\(\)/, 'the current session is resolved at invocation time');
assert.match(frontend, /Authorization:`Bearer \$\{session\.access_token\}`/, 'the JWT is explicitly propagated to FunctionsClient');
assert.match(frontend, /if\(!session\?\.access_token\)/, 'anonymous onboarding fails closed');

assert.match(edge, /if \(req\.method === 'OPTIONS'\)/, 'CORS preflight is handled');
assert.match(edge, /'Access-Control-Allow-Methods': 'POST, OPTIONS'/, 'CORS permits the onboarding method');
assert.match(edge, /'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info'/, 'Supabase browser headers are allowed');
assert.match(edge, /auth\.auth\.getUser\(match\[1\]\)/, 'the bearer JWT is validated by Supabase Auth');
assert.match(edge, /execution_enabled: false/, 'new accounts remain execution disabled');
assert.match(edge, /ownerId: requestedOwner/, 'the canonical owner UUID is returned to bridge onboarding');
assert.match(edge, /MT5_ENCRYPTION_KEY_MISSING/, 'a missing credential key has a stable error code');
assert.match(edge, /MT5_ENCRYPTION_KEY_MALFORMED/, 'a malformed credential key has a stable error code');
assert.match(edge, /console\.error\(JSON\.stringify/, 'failures have structured logging');
assert.doesNotMatch(edge, /console\.error\([^\n]*(password|token|ciphertext|service)/i, 'structured logs do not contain secrets');
assert.match(edge, /insertError\?\.code === '23505'/, 'duplicate onboarding is handled idempotently');
assert.match(frontend, /await context\.clone\(\)\.json\(\)/, 'backend JSON errors are exposed to the UI');

assert.match(migration, /credential_ref uuid NOT NULL DEFAULT gen_random_uuid\(\)/, 'credential references are canonical UUIDs');
assert.match(accountSchema, /execution_enabled boolean NOT NULL DEFAULT false/, 'the canonical schema defaults execution to disabled');
assert.match(bridge, /X-MT5-Bridge-Token/, 'restricted bridge authentication is supported');
assert.match(bridge, /decryptCredential/, 'credential decryption stays in the trusted backend');
assert.match(bridge, /BRIDGE_ACCOUNT_SCOPE_MISMATCH/, 'all worker writes fail closed on scope mismatch');
assert.doesNotMatch(bridge, /mt5_commands_queue/, 'the worker cannot fall back to a duplicate legacy queue');
assert.match(finalization, /FOR UPDATE SKIP LOCKED/, 'command claim is atomic');
assert.match(finalization, /UNIQUE|idempotency_key/, 'idempotency remains represented in the durable contract');
assert.match(ui, /age > 120_000/);
assert.match(ui, /age > 30_000/);
assert.match(ui, /Investor Only/);
assert.match(bridge, /action === "register_bridge"/, 'first startup has an authenticated registration action');
assert.match(bridge, /BRIDGE_TOKEN_INVALID/, 'invalid custom tokens use the stable contract');
assert.match(hotfix, /BRIDGE_ALREADY_ACTIVE/, 'healthy duplicate leases are rejected');
assert.match(hotfix, /lease_expires_at > now_at/, 'stale reclaim is timestamp governed');
assert.match(hotfix, /CREDENTIAL_REF_MISMATCH/, 'explicit assignment validates its credential reference');
assert.ok(agent.indexOf('register_bridge()') < agent.indexOf('assign_explicit_account()') && agent.indexOf('assign_explicit_account()') < agent.indexOf('discover_accounts()'), 'startup registers, assigns, then discovers');
assert.match(agent, /ProcessLookupError/, 'dead local process locks are reclaimed');
assert.match(agent, /except BaseException:[\s\S]*_release_single_instance_lock/, 'fatal startup releases its lock');
assert.doesNotMatch(ui, /bridge-mt5-001|WIN-HASHIBOT-AGENT|Windows Server 2022/, 'operations truth has no fictitious bridge fallback');
assert.match(bridgeUi, /browser never launches a process/, 'UI truthfully describes control requests');
assert.doesNotMatch(client, /password.*logger|logger.*password/i, 'the agent never logs credentials');

console.log('Phase 5D authenticated MT5 onboarding contract tests passed');
