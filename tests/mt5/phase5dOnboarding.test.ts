import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frontend = readFileSync('src/lib/mt5Accounts.ts', 'utf8');
const edge = readFileSync('supabase/functions/mt5-accounts/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260728060000_phase5d_multi_account_mt5_bridge.sql', 'utf8');
const accountSchema = readFileSync('supabase/migrations/20260722020000_phase8a_mt5_execution_platform.sql', 'utf8');

assert.match(frontend, /supabase\.auth\.getSession\(\)/, 'the current session is resolved at invocation time');
assert.match(frontend, /Authorization:`Bearer \$\{session\.access_token\}`/, 'the JWT is explicitly propagated to FunctionsClient');
assert.match(frontend, /if\(!session\?\.access_token\)/, 'anonymous onboarding fails closed');

assert.match(edge, /if\(req\.method==='OPTIONS'\)/, 'CORS preflight is handled');
assert.match(edge, /'Access-Control-Allow-Methods':'POST, OPTIONS'/, 'CORS permits the onboarding method');
assert.match(edge, /'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'/, 'Supabase browser headers are allowed');
assert.match(edge, /auth\.auth\.getUser\(match\[1\]\)/, 'the bearer JWT is validated by Supabase Auth');
assert.match(edge, /execution_enabled:false/, 'new accounts remain execution disabled');
assert.match(edge, /ownerId:user\.id/, 'the canonical owner UUID is returned to bridge onboarding');

assert.match(migration, /credential_ref uuid NOT NULL DEFAULT gen_random_uuid\(\)/, 'credential references are canonical UUIDs');
assert.match(accountSchema, /execution_enabled boolean NOT NULL DEFAULT false/, 'the canonical schema defaults execution to disabled');

console.log('Phase 5D authenticated MT5 onboarding contract tests passed');
