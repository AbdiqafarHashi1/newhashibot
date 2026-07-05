import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync('package.json') && existsSync('supabase') ? '.' : 'v2';

const requiredFiles = [
  'deploy/README.md','deploy/environment.md','deploy/secrets.md','deploy/storage.md','deploy/sql/SQL_PACKAGE.md','deploy/edge-functions.md','deploy/netlify.md','deploy/bootstrap.md','deploy/telegram.md','deploy/providers.md','deploy/reset-initialization.md','deploy/smoke-test.md','deploy/operations-runbook.md','netlify.toml'
];
const missing = requiredFiles.filter((file) => !existsSync(join(root, file)));
if (missing.length) throw new Error(`Missing deployment files: ${missing.join(', ')}`);
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
const sqlGuide = readFileSync(join(root, 'deploy/sql/SQL_PACKAGE.md'), 'utf8');
for (const migration of migrations) {
  if (!sqlGuide.includes(migration)) throw new Error(`SQL guide omits migration ${migration}`);
}
const functions = readdirSync(join(root, 'supabase/functions'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('_')).map((entry) => entry.name).sort();
const edgeGuide = readFileSync(join(root, 'deploy/edge-functions.md'), 'utf8');
for (const fn of functions) {
  if (!edgeGuide.includes(`\`${fn}\``)) throw new Error(`Edge guide omits function ${fn}`);
}
const envGuide = readFileSync(join(root, 'deploy/environment.md'), 'utf8');
for (const env of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PLATFORM_API_TOKEN','TELEGRAM_FREE_BOT_TOKEN','BINANCE_TESTNET_API_KEY','BYBIT_TESTNET_API_KEY','HASHIBRIDGE_SHARED_SECRET','BOOTSTRAP_OWNER_EMAIL']) {
  if (!envGuide.includes(`\`${env}\``)) throw new Error(`Environment guide omits ${env}`);
}
console.log(`Deployment package validated: ${migrations.length} migrations, ${functions.length} functions, ${requiredFiles.length} required files.`);
