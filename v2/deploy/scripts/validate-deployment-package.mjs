import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = existsSync('package.json') && existsSync('supabase') ? '.' : 'v2';
const checklistPath = join(root, 'deploy/FULL_DEPLOYMENT_CHECKLIST.md');

const requiredFiles = [
  'deploy/README.md','deploy/environment.md','deploy/secrets.md','deploy/storage.md','deploy/sql/SQL_PACKAGE.md','deploy/edge-functions.md','deploy/netlify.md','deploy/bootstrap.md','deploy/telegram.md','deploy/providers.md','deploy/reset-initialization.md','deploy/smoke-test.md','deploy/operations-runbook.md','deploy/FULL_DEPLOYMENT_CHECKLIST.md','netlify.toml'
];
const missing = requiredFiles.filter((file) => !existsSync(join(root, file)));
if (missing.length) throw new Error(`Missing deployment files: ${missing.join(', ')}`);

const checklist = readFileSync(checklistPath, 'utf8');
const envGuide = readFileSync(join(root, 'deploy/environment.md'), 'utf8');
const sqlGuide = readFileSync(join(root, 'deploy/sql/SQL_PACKAGE.md'), 'utf8');
const edgeGuide = readFileSync(join(root, 'deploy/edge-functions.md'), 'utf8');
const storageGuide = readFileSync(join(root, 'deploy/storage.md'), 'utf8');

const migrations = readdirSync(join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
for (const migration of migrations) {
  if (!sqlGuide.includes(migration)) throw new Error(`SQL guide omits migration ${migration}`);
  if (!checklist.includes(migration)) throw new Error(`Full checklist omits migration ${migration}`);
}

const functions = readdirSync(join(root, 'supabase/functions'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('_')).map((entry) => entry.name).sort();
for (const fn of functions) {
  if (!edgeGuide.includes(`\`${fn}\``)) throw new Error(`Edge guide omits function ${fn}`);
  if (!checklist.includes(`\`${fn}\``)) throw new Error(`Full checklist omits function ${fn}`);
}

const variables = [
  'REPOSITORY_URL','REPOSITORY_BRANCH','LOCAL_REPO_PATH','SUPABASE_PROJECT_REF','SUPABASE_PROJECT_ID','SUPABASE_PROJECT_NAME','SUPABASE_REGION','SUPABASE_DB_PASSWORD','DATABASE_URL','SUPABASE_FUNCTIONS_URL','SUPABASE_URL','SUPABASE_ANON_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','JWT_SECRET','PLATFORM_API_TOKEN','VITE_PLATFORM_API_URL','HASHIBOT_ENV','HASHIBOT_ENCRYPTION_KEY','PLATFORM_PUBLIC_URL','PLATFORM_RESET_ALLOW_DESTRUCTIVE','NETLIFY_SITE_ID','NETLIFY_AUTH_TOKEN','NETLIFY_TEAM_SLUG','VITE_APP_ENV','TELEGRAM_BOT_TOKEN','TELEGRAM_FREE_BOT_TOKEN','TELEGRAM_VIP_BOT_TOKEN','TELEGRAM_ADMIN_OPS_BOT_TOKEN','TELEGRAM_FREE_CHAT_ID','TELEGRAM_VIP_CHAT_ID','TELEGRAM_ADMIN_OPS_CHAT_ID','BINANCE_TESTNET_API_KEY','BINANCE_TESTNET_API_SECRET','BYBIT_TESTNET_API_KEY','BYBIT_TESTNET_API_SECRET','MT5_DEMO_ACCOUNT_ID','MT5_DEMO_SERVER','MT5_DEMO_LOGIN','MT5_DEMO_PASSWORD','HASHIBRIDGE_DEVICE_ID','HASHIBRIDGE_SHARED_SECRET','HASHIBRIDGE_TIMESTAMP','HASHIBRIDGE_NONCE','HASHIBRIDGE_SIGNATURE','MONITORING_ALERT_EMAIL','MONITORING_RETENTION_DAYS','RESEARCH_ARTIFACT_RETENTION_DAYS','OPENAI_API_KEY','SECRET_ROTATION_OWNER','TOKEN_ROTATION_DAYS','BOOTSTRAP_OWNER_EMAIL','BOOTSTRAP_OWNER_PASSWORD','BOOTSTRAP_ADMIN_EMAIL','BOOTSTRAP_ADMIN_PASSWORD','STORAGE_RESEARCH_ARTIFACTS_BUCKET','STORAGE_AUDIT_ARCHIVES_BUCKET','STORAGE_TELEGRAM_MEDIA_CACHE_BUCKET','STORAGE_BRIDGE_LOGS_BUCKET','FUNCTIONS_URL','PROJECT_REF','CHAT_ID','TOKEN','KEY','SECRET','BUCKET'
];
for (const env of variables) {
  if (!checklist.includes(env)) throw new Error(`Full checklist omits variable ${env}`);
  if (!new RegExp(`${env}=<|${env}=production|${env}=false|${env}=research-artifacts|${env}=audit-archives|${env}=telegram-media-cache|${env}=bridge-logs`).test(checklist)) throw new Error(`Full checklist lacks placeholder for ${env}`);
  const row = new RegExp('\\| `'+env+'` \\|[^\\n]+\\|[^\\n]+\\|[^\\n]+\\|[^\\n]+\\|[^\\n]+\\|');
  if (!row.test(checklist)) throw new Error(`Full checklist lacks source/configuration table row for ${env}`);
}

const buckets = ['research-artifacts','audit-archives','telegram-media-cache','bridge-logs'];
for (const bucket of buckets) {
  if (!storageGuide.includes(`\`${bucket}\``)) throw new Error(`Storage guide omits bucket ${bucket}`);
  if (!checklist.includes(`\`${bucket}\``)) throw new Error(`Full checklist omits bucket ${bucket}`);
}

const cronJobs = ['cleanup','retention','monitoring','Telegram retry','bridge stale-heartbeat'];
for (const job of cronJobs) {
  if (!checklist.toLowerCase().includes(job.toLowerCase())) throw new Error(`Full checklist omits cron job ${job}`);
}

const smokeSteps = ['repository status','dependency install','Supabase link','SQL verification','storage private access','secrets present','function health','Platform API health','Telegram send/retry','provider health','bridge signed heartbeat','owner/admin login','UI load','scanner observation','paper/testnet command queue','monitoring summary','audit log review'];
for (const step of smokeSteps) {
  if (!checklist.toLowerCase().includes(step.toLowerCase())) throw new Error(`Full checklist omits smoke-test step ${step}`);
}

const commands = ['npm --prefix v2 run typecheck','npm --prefix v2 run test','npm --prefix v2 run test:deployment','supabase secrets set','netlify env:set','supabase functions deploy','bootstrap-owner.sh','platform-reset.sh','smoke-test.sh'];
for (const command of commands) {
  if (!checklist.includes(command)) throw new Error(`Full checklist omits deployment command ${command}`);
}

const suspiciousSecrets = [/(sk-[A-Za-z0-9]{20,})/, /(xox[baprs]-[A-Za-z0-9-]{20,})/, /(-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----)/, /[A-Za-z0-9_]*SECRET[A-Za-z0-9_]*=([A-Za-z0-9/+]{24,}={0,2})/];
for (const pattern of suspiciousSecrets) {
  const match = checklist.match(pattern);
  if (match && !match[0].includes('<') && !match[0].includes('$')) throw new Error(`Potential real secret found in checklist: ${match[0].slice(0, 24)}...`);
}

const gitTop = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const status = execSync('git status --porcelain', { encoding: 'utf8', cwd: gitTop }).trim().split('\n').filter(Boolean);
const changedPaths = status.map((line) => { const idx = line.indexOf('v2/'); return idx >= 0 ? line.slice(idx) : line.replace(/^..\s+/, '').replace(/^\"|\"$/g, ''); }).map((path) => path.includes(' -> ') ? path.split(' -> ').at(-1) : path);
const outsideV2 = changedPaths.filter((path) => !path.startsWith('v2/'));
if (outsideV2.length) throw new Error(`Files outside /v2 changed: ${outsideV2.join(', ')}`);

console.log(`Deployment package validated: ${migrations.length} migrations, ${functions.length} functions, ${variables.length} variables, ${buckets.length} buckets.`);
