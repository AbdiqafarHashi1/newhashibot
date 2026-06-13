import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const functionsRoot = join(root, 'supabase/functions');
const realFunctions = [
  'binance-testnet-execution',
  'binance-testnet-monitor',
  'market-scanner',
  'evaluate-signal-outcomes',
  'telegram-send',
  'telegram-test',
  'telegram-orchestrator',
  'intelligence-engine',
];
const sharedOnly = ['_shared', 'telegram-router', 'intelligence-feed', 'intelligence-engine.ts', 'telegram-router.ts', 'intelligence-feed.ts'];
const requiredShared = ['_shared/intelligence-engine.ts', '_shared/telegram-router.ts'];
let failures = 0;
function pass(message) { console.log(`PASS ${message}`); }
function fail(message) { failures += 1; console.error(`FAIL ${message}`); }
for (const rel of requiredShared) {
  const path = join(functionsRoot, rel);
  existsSync(path) ? pass(`shared module exists: supabase/functions/${rel}`) : fail(`missing shared module: supabase/functions/${rel}`);
}
for (const fn of realFunctions) {
  const dir = join(functionsRoot, fn);
  const index = join(dir, 'index.ts');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`missing function directory: ${fn}`);
  else pass(`function directory exists: ${fn}`);
  if (!existsSync(index)) fail(`missing index.ts for function: ${fn}`);
  else {
    const source = readFileSync(index, 'utf8');
    const badSharedImport = source.match(/from\s+["'](?:\.\/_shared|_shared|\.\.\/_shared\/(?:intelligence-engine|telegram-router))(?!\.ts["'])[^"']*["']/g);
    badSharedImport ? fail(`${fn} has non-deployable shared import(s): ${badSharedImport.join(', ')}`) : pass(`${fn} shared imports include explicit .ts extensions`);
    for (const match of source.matchAll(/from\s+["'](\.\.\/_shared\/[^"']+)["']/g)) {
      const rel = match[1].replace('../', '');
      existsSync(join(functionsRoot, rel)) ? pass(`${fn} resolves ${match[1]}`) : fail(`${fn} cannot resolve ${match[1]}`);
    }
  }
}
for (const name of sharedOnly) {
  const path = join(functionsRoot, name);
  if (existsSync(path) && statSync(path).isDirectory() && existsSync(join(path, 'index.ts'))) fail(`shared-only name is deployable function directory: ${name}`);
  else pass(`shared-only name is not a deployable function: ${name}`);
}
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const deployScript = packageJson.scripts?.['deploy:edge-functions'] ?? '';
for (const fn of realFunctions) {
  deployScript.includes(`supabase functions deploy ${fn}`) ? pass(`deploy script includes ${fn}`) : fail(`deploy script missing ${fn}`);
}
for (const name of sharedOnly) {
  deployScript.includes(`supabase functions deploy ${name}`) ? fail(`deploy script incorrectly deploys ${name}`) : pass(`deploy script does not deploy ${name}`);
}
for (const entry of readdirSync(functionsRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== '_shared' && existsSync(join(functionsRoot, entry.name, 'index.ts')) && !realFunctions.includes(entry.name)) {
    console.log(`INFO extra deployable function not in automatic list: ${entry.name}`);
  }
}
if (failures) process.exit(1);
