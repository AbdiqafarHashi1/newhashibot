import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const functionsRoot = join(root, 'supabase/functions');
const skipDirectories = new Set(['_shared']);
const noVerifyJwtFunctions = new Set(
  (process.env.SUPABASE_NO_VERIFY_JWT_FUNCTIONS ?? 'telegram-orchestrator,intelligence-engine')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);

function discoverFunctions() {
  if (!existsSync(functionsRoot) || !statSync(functionsRoot).isDirectory()) {
    throw new Error(`Supabase functions directory not found: ${functionsRoot}`);
  }

  return readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !skipDirectories.has(name))
    .filter((name) => existsSync(join(functionsRoot, name, 'index.ts')))
    .sort((a, b) => a.localeCompare(b));
}

const passThroughArgs = process.argv.slice(2);
const functions = discoverFunctions();

if (functions.length === 0) {
  console.error('FAILED No deployable Supabase Edge Functions found under supabase/functions/*/index.ts');
  process.exit(1);
}

console.log('FOUND Supabase Edge Functions:');
for (const name of functions) console.log(`FOUND ${name}`);

const failures = [];
for (const name of functions) {
  const args = ['functions', 'deploy', name, ...passThroughArgs];
  if (noVerifyJwtFunctions.has(name)) args.push('--no-verify-jwt');

  console.log(`DEPLOYING ${name}`);
  const result = spawnSync('supabase', args, { stdio: 'inherit', env: process.env });
  if (result.status === 0) {
    console.log(`DEPLOYED ${name}`);
  } else {
    const status = result.status ?? 'unknown';
    const signal = result.signal ? ` signal=${result.signal}` : '';
    console.error(`FAILED ${name} status=${status}${signal}`);
    failures.push(name);
  }
}

if (failures.length) {
  console.error('FAILED Supabase Edge Function deploy failures:');
  for (const name of failures) console.error(`FAILED ${name}`);
  process.exit(1);
}

console.log('DEPLOYED Supabase Edge Functions:');
for (const name of functions) console.log(`DEPLOYED ${name}`);
