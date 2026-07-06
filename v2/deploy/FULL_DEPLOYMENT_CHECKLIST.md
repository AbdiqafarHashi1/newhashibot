# HashiBot V2 Full Deployment Checklist — Zero to Live Testnet

This is the single operator playbook for deploying HashiBot V2 from an empty workstation and fresh Supabase project to an operational paper/testnet environment. All commands are run from the repository root unless stated otherwise. The legacy root app is reference only; deploy only from `/v2`.

## 0. Ground Rules

- Never paste real secrets into documentation, Git, tickets, screenshots, or chat.
- Use only placeholder values in files. Put real values in Supabase secrets, Netlify environment variables, local shell exports, or the HashiBridge/MT5 desktop secret store.
- Stop after any failed verification. Fix the failed layer before continuing.
- Production means `HASHIBOT_ENV=production`; destructive reset is forbidden unless explicitly using a non-production development project.

## 1. Complete Variable and Secret Inventory

### 1.1 Master placeholder environment block

```bash
# 1. Git / Repository
REPOSITORY_URL=<your-git-repository-url>
REPOSITORY_BRANCH=<deployment-branch>
LOCAL_REPO_PATH=<absolute-local-path-to-repo>

# 2. Supabase Project
SUPABASE_PROJECT_REF=<your-project-ref>
SUPABASE_PROJECT_ID=<your-project-ref>
SUPABASE_PROJECT_NAME=<your-project-name>
SUPABASE_REGION=<your-supabase-region>
SUPABASE_DB_PASSWORD=<your-database-password>
DATABASE_URL=<postgresql-connection-url>
SUPABASE_FUNCTIONS_URL=<https://your-project-ref.functions.supabase.co>

# 3. Supabase Frontend
SUPABASE_URL=<https://your-project-ref.supabase.co>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
VITE_SUPABASE_URL=<https://your-project-ref.supabase.co>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>

# 4. Supabase Backend
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
JWT_SECRET=<optional-custom-jwt-secret-or-supabase-managed>

# 5. Edge Functions
PLATFORM_API_TOKEN=<generate-random-32-byte-token>
VITE_PLATFORM_API_URL=<https://your-project-ref.functions.supabase.co/platform-api>

# 6. Platform
HASHIBOT_ENV=production
HASHIBOT_ENCRYPTION_KEY=<base64-32-byte-key>
PLATFORM_PUBLIC_URL=<https://your-netlify-site-or-custom-domain>
PLATFORM_RESET_ALLOW_DESTRUCTIVE=false

# 7. Netlify
NETLIFY_SITE_ID=<your-netlify-site-id>
NETLIFY_AUTH_TOKEN=<your-netlify-personal-access-token-for-cli>
NETLIFY_TEAM_SLUG=<your-netlify-team-slug>
VITE_APP_ENV=production

# 8. Telegram
TELEGRAM_BOT_TOKEN=<default-or-router-botfather-token>
TELEGRAM_FREE_BOT_TOKEN=<free-botfather-token>
TELEGRAM_VIP_BOT_TOKEN=<vip-botfather-token>
TELEGRAM_ADMIN_OPS_BOT_TOKEN=<admin-ops-botfather-token>
TELEGRAM_FREE_CHAT_ID=<free-channel-or-group-chat-id>
TELEGRAM_VIP_CHAT_ID=<vip-channel-or-group-chat-id>
TELEGRAM_ADMIN_OPS_CHAT_ID=<admin-ops-channel-or-group-chat-id>

# 9. Binance Testnet
BINANCE_TESTNET_API_KEY=<binance-testnet-api-key>
BINANCE_TESTNET_API_SECRET=<binance-testnet-api-secret>

# 10. Bybit Testnet
BYBIT_TESTNET_API_KEY=<bybit-testnet-api-key>
BYBIT_TESTNET_API_SECRET=<bybit-testnet-api-secret>

# 11. MT5 Demo
MT5_DEMO_ACCOUNT_ID=<mt5-demo-account-id>
MT5_DEMO_SERVER=<broker-demo-server-name>
MT5_DEMO_LOGIN=<mt5-demo-login>
MT5_DEMO_PASSWORD=<mt5-demo-password>

# 12. HashiBridge
HASHIBRIDGE_DEVICE_ID=<unique-bridge-device-id>
HASHIBRIDGE_SHARED_SECRET=<generate-random-32-byte-shared-secret>
HASHIBRIDGE_TIMESTAMP=<unix-timestamp-used-for-signed-test-request>
HASHIBRIDGE_NONCE=<unique-random-nonce-used-for-signed-test-request>
HASHIBRIDGE_SIGNATURE=<hmac-signature-for-signed-test-request>

# 13. Monitoring
MONITORING_ALERT_EMAIL=<operator-alert-email>
MONITORING_RETENTION_DAYS=<retention-days>

# 14. Research
RESEARCH_ARTIFACT_RETENTION_DAYS=<retention-days>
OPENAI_API_KEY=<optional-future-openai-api-key>

# 15. Security
SECRET_ROTATION_OWNER=<security-owner-email-or-team>
TOKEN_ROTATION_DAYS=<rotation-days>

# 16. Admin Bootstrap
BOOTSTRAP_OWNER_EMAIL=<owner-email>
BOOTSTRAP_OWNER_PASSWORD=<temporary-owner-password>
BOOTSTRAP_ADMIN_EMAIL=<admin-email>
BOOTSTRAP_ADMIN_PASSWORD=<temporary-admin-password>

# 17. Storage
STORAGE_RESEARCH_ARTIFACTS_BUCKET=research-artifacts
STORAGE_AUDIT_ARCHIVES_BUCKET=audit-archives
STORAGE_TELEGRAM_MEDIA_CACHE_BUCKET=telegram-media-cache
STORAGE_BRIDGE_LOGS_BUCKET=bridge-logs

# 18. Optional Future
FUNCTIONS_URL=<alias-of-supabase-functions-url-if-a-script-requires-it>
PROJECT_REF=<alias-of-supabase-project-ref-if-a-script-requires-it>
CHAT_ID=<diagnostic-telegram-chat-id>
TOKEN=<diagnostic-short-lived-token>
KEY=<diagnostic-key-placeholder>
SECRET=<diagnostic-secret-placeholder>
BUCKET=<diagnostic-bucket-placeholder>
```

### 1.2 Variable source/configuration table

| Variable | Required | Where to obtain | Where to configure | Used by | Verification |
|---|---:|---|---|---|---|
| `REPOSITORY_URL` | Yes | Git provider repository Clone URL | Local shell only | Operator clone step | `git remote -v` shows the URL |
| `REPOSITORY_BRANCH` | Yes | Release manager | Local shell only | Checkout/deploy branch | `git branch --show-current` |
| `LOCAL_REPO_PATH` | Yes | Workstation path chosen by operator | Local shell only | CLI commands | `pwd` ends in repo path |
| `SUPABASE_PROJECT_REF` | Yes | Supabase Dashboard → Project Settings → General → Reference ID | CLI `supabase link --project-ref`, Supabase commands, local export | Supabase CLI and function URLs | `supabase projects list` contains ref |
| `SUPABASE_PROJECT_ID` | Yes | Same as project ref | Local docs/scripts if needed | Supabase aliases | Equals `SUPABASE_PROJECT_REF` |
| `SUPABASE_PROJECT_NAME` | Yes | Name chosen at project creation | Supabase Dashboard | Operator identification | Dashboard title matches |
| `SUPABASE_REGION` | Yes | Supabase project creation screen | Supabase Dashboard | Latency/compliance record | Dashboard General page matches |
| `SUPABASE_DB_PASSWORD` | Yes | Password entered or reset in Supabase Database settings | Password manager only | Database connection string | Connection succeeds; never print password |
| `DATABASE_URL` | Yes | Supabase Dashboard → Project Settings → Database → Connection string | Local shell/CI secret only | Migrations/manual SQL | `psql "$DATABASE_URL" -c 'select now();'` |
| `SUPABASE_FUNCTIONS_URL` | Yes | `https://<ref>.functions.supabase.co` | Local shell, Netlify if needed | Curl checks, Telegram webhooks | `curl "$SUPABASE_FUNCTIONS_URL/runtime-health"` reaches function |
| `SUPABASE_URL` | Yes | Dashboard → Project Settings → API → Project URL | Supabase secrets, local bootstrap, Netlify via Vite alias | Edge Functions and clients | URL opens Supabase REST endpoint |
| `SUPABASE_ANON_KEY` | Yes | Dashboard → Project Settings → API → anon public key | Supabase secrets, Netlify | Browser Supabase client | Login page can initialize client |
| `VITE_SUPABASE_URL` | Yes | Same as `SUPABASE_URL` | Netlify environment variables | Web runtime/customer/admin builds | Netlify build logs show variable present |
| `VITE_SUPABASE_ANON_KEY` | Yes | Same as `SUPABASE_ANON_KEY` | Netlify environment variables | Browser apps | Browser auth request reaches Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Dashboard → Project Settings → API → service_role key | Supabase secrets and local bootstrap only | Edge Functions/admin scripts | Owner bootstrap can create owner |
| `JWT_SECRET` | No | Supabase Auth JWT settings or generated if custom validation is enabled | Supabase secrets only if used | Optional JWT validation | Token verification succeeds when enabled |
| `PLATFORM_API_TOKEN` | Yes | Generate with `openssl rand -hex 32` | Supabase secrets; local curl only | Platform API and health curl authorization | `platform-api/health` accepts bearer token |
| `VITE_PLATFORM_API_URL` | Yes | `$SUPABASE_FUNCTIONS_URL/platform-api` | Netlify environment variables | Browser Platform API calls | UI health call reaches Edge Function |
| `HASHIBOT_ENV` | Yes | Operator policy | Supabase secrets, Netlify, local reset shell | Guards production/destructive actions | `platform-reset.sh` reports production-safe behavior |
| `HASHIBOT_ENCRYPTION_KEY` | Yes | `openssl rand -base64 32` | Supabase secrets/password manager | Credential encryption/vault references | Secrets check confirms present |
| `PLATFORM_PUBLIC_URL` | Yes | Netlify deploy URL or custom domain | Supabase secrets and Netlify | Webhooks, redirects, user links | Browser opens deployed UI |
| `PLATFORM_RESET_ALLOW_DESTRUCTIVE` | No | Operator sets `false` for production | Supabase/local only | Reset script guard | Destructive reset is blocked in production |
| `NETLIFY_SITE_ID` | Yes | Netlify Site configuration → Site details | Local/CI Netlify CLI | Netlify deploy/env commands | `netlify status` shows site |
| `NETLIFY_AUTH_TOKEN` | Yes for CLI | Netlify User settings → Applications → Personal access tokens | Local shell/CI secret | Netlify CLI | `netlify status` authenticates |
| `NETLIFY_TEAM_SLUG` | No | Netlify Team settings | Local shell/CI | Team-scoped Netlify commands | `netlify sites:list` shows team sites |
| `VITE_APP_ENV` | Yes | Operator policy | Netlify environment variables | Browser app environment label | UI reports production mode |
| `TELEGRAM_BOT_TOKEN` | Yes | BotFather token for default/router bot | Supabase secrets | DB seed references/default Telegram bot | Test sendMessage succeeds |
| `TELEGRAM_FREE_BOT_TOKEN` | Yes | BotFather `/newbot` for FREE bot | Supabase secrets | FREE Telegram delivery | Message posts to FREE channel |
| `TELEGRAM_VIP_BOT_TOKEN` | Yes | BotFather `/newbot` for VIP bot | Supabase secrets | VIP Telegram delivery | Message posts to VIP channel |
| `TELEGRAM_ADMIN_OPS_BOT_TOKEN` | Yes | BotFather `/newbot` for ops bot | Supabase secrets | Admin/ops alerts | Message posts to ops channel |
| `TELEGRAM_FREE_CHAT_ID` | Yes | Telegram `getUpdates` or channel ID bot after adding bot | Supabase secrets/bootstrap tables | FREE route | Test notification appears |
| `TELEGRAM_VIP_CHAT_ID` | Yes | Telegram `getUpdates` or channel ID bot after adding bot | Supabase secrets/bootstrap tables | VIP route | Test notification appears |
| `TELEGRAM_ADMIN_OPS_CHAT_ID` | Yes | Telegram `getUpdates` or channel ID bot after adding bot | Supabase secrets/bootstrap tables | Ops route | Test notification appears |
| `BINANCE_TESTNET_API_KEY` | Yes | Binance Spot/Futures Testnet API management | Supabase secrets/provider account | Binance testnet adapter | Provider health returns Binance healthy |
| `BINANCE_TESTNET_API_SECRET` | Yes | Binance Testnet key creation screen | Supabase secrets only | Binance request signing | Signed account test succeeds |
| `BYBIT_TESTNET_API_KEY` | Yes | Bybit Testnet API management | Supabase secrets/provider account | Bybit testnet adapter | Provider health returns Bybit healthy |
| `BYBIT_TESTNET_API_SECRET` | Yes | Bybit Testnet key creation screen | Supabase secrets only | Bybit request signing | Signed account test succeeds |
| `MT5_DEMO_ACCOUNT_ID` | Yes | Broker demo account details | Supabase secrets and bridge registration payload | MT5 account registry | `mt5-account-register` returns registered |
| `MT5_DEMO_SERVER` | Yes | Broker demo account details | Supabase secrets and desktop agent | MT5 connection | Terminal connects to server |
| `MT5_DEMO_LOGIN` | Yes | Broker demo account details | Desktop agent secret store only | Desktop Agent / EA | Agent login check passes |
| `MT5_DEMO_PASSWORD` | Yes | Broker demo account details | Desktop agent secret store only | Desktop Agent / EA | Agent login check passes; never log |
| `HASHIBRIDGE_DEVICE_ID` | Yes | Operator-generated unique bridge ID | Desktop agent config and signed request headers | HashiBridge Edge Functions | Device appears in bridge tables |
| `HASHIBRIDGE_SHARED_SECRET` | Yes | `openssl rand -hex 32` | Supabase secrets and desktop agent secret store | HMAC verification for bridge functions | Signed heartbeat accepted |
| `HASHIBRIDGE_TIMESTAMP` | Test only | `date +%s` | Local curl only | Signed curl verification | Timestamp inside five-minute window |
| `HASHIBRIDGE_NONCE` | Test only | `openssl rand -hex 12` | Local curl only | Signed curl verification | Replay with same nonce is rejected |
| `HASHIBRIDGE_SIGNATURE` | Test only | HMAC over canonical bridge payload | Local curl header only | Signed bridge verification | Valid signature accepted |
| `MONITORING_ALERT_EMAIL` | No | Ops team | Supabase settings/ops runbook | Monitoring notification policy | Test alert routes to ops |
| `MONITORING_RETENTION_DAYS` | No | Retention policy | Supabase settings | Retention cleanup jobs | Cleanup query reports expected horizon |
| `RESEARCH_ARTIFACT_RETENTION_DAYS` | No | Retention policy | Supabase settings | Research cleanup/archive | Old artifacts expire in test |
| `OPENAI_API_KEY` | No | OpenAI dashboard if future assistants are enabled | Supabase secrets only when enabled | Optional future research assistants | Feature-specific health check |
| `SECRET_ROTATION_OWNER` | Yes | Security team | Ops runbook/password manager | Rotation accountability | Owner listed in rotation calendar |
| `TOKEN_ROTATION_DAYS` | Yes | Security policy | Ops runbook | Rotation schedule | Calendar task exists |
| `BOOTSTRAP_OWNER_EMAIL` | Yes | First owner identity | Local bootstrap export only | Bootstrap owner script | Owner exists in Auth/users |
| `BOOTSTRAP_OWNER_PASSWORD` | Yes | Temporary password generated by owner | Local bootstrap export only | Bootstrap owner script | Owner can log in then rotate password |
| `BOOTSTRAP_ADMIN_EMAIL` | Yes | First admin identity | Local bootstrap export only | Admin bootstrap | Admin exists with admin role |
| `BOOTSTRAP_ADMIN_PASSWORD` | Yes | Temporary password generated by admin | Local bootstrap export only | Admin bootstrap | Admin can log in then rotate password |
| `STORAGE_RESEARCH_ARTIFACTS_BUCKET` | Yes | Fixed V2 bucket name | Supabase Storage bucket | Research Lab | Bucket exists and private upload works |
| `STORAGE_AUDIT_ARCHIVES_BUCKET` | Yes | Fixed V2 bucket name | Supabase Storage bucket | Audit retention/archive | Bucket exists and private upload works |
| `STORAGE_TELEGRAM_MEDIA_CACHE_BUCKET` | Yes | Fixed V2 bucket name | Supabase Storage bucket | Telegram media cache | Bucket exists and private upload works |
| `STORAGE_BRIDGE_LOGS_BUCKET` | Yes | Fixed V2 bucket name | Supabase Storage bucket | HashiBridge diagnostics | Bucket exists and private upload works |
| `FUNCTIONS_URL` | No | Alias for `SUPABASE_FUNCTIONS_URL` | Local shell if a legacy helper requires it | Diagnostic commands | Echo equals functions URL |
| `PROJECT_REF` | No | Alias for `SUPABASE_PROJECT_REF` | Local shell if a helper requires it | Diagnostic commands | Echo equals project ref |
| `CHAT_ID` | No | Diagnostic Telegram chat ID | Local shell only | Manual Telegram curl | Test curl posts to diagnostic chat |
| `TOKEN` | No | Short-lived diagnostic token | Local shell only | Manual diagnostics | Command using token succeeds |
| `KEY` | No | Short-lived diagnostic key | Local shell only | Manual diagnostics | Command using key succeeds |
| `SECRET` | No | Short-lived diagnostic secret | Local shell only | Manual diagnostics | Command using secret succeeds |
| `BUCKET` | No | Diagnostic bucket name | Local shell only | Storage diagnostics | Bucket command targets expected bucket |

## 2. Supabase Setup Guide

1. Open Supabase Dashboard → New project.
2. Select the organization, set `SUPABASE_PROJECT_NAME`, choose `SUPABASE_REGION`, enter a strong `SUPABASE_DB_PASSWORD`, and create the project.
3. Wait until Dashboard → Project home reports the project is ready.
4. Copy `SUPABASE_PROJECT_REF` from Project Settings → General → Reference ID.
5. Copy `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API.
6. Copy `DATABASE_URL` from Project Settings → Database → Connection string → URI. Replace the password placeholder with the stored DB password locally only.
7. Install/login/link CLI:
   ```bash
   npm --prefix v2 install
   npx supabase login
   npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
   npx supabase projects list
   ```
8. Run migrations in the exact SQL order below using `npx supabase db push` or Dashboard → SQL Editor with one file at a time.
9. Verify RLS in Dashboard → Authentication → Policies and with the global RLS query in the SQL section.
10. Verify RPCs in Dashboard → Database → Functions and with the RPC verification query.
11. Create Storage buckets in Dashboard → Storage → New bucket using the Storage section.
12. Configure Edge secrets with the Supabase command block in the Secret Provisioning section.
13. Deploy Edge Functions with the command block in the Edge Functions section.
14. Configure cron jobs in Dashboard → Database → Cron/Extensions or SQL Editor if `pg_cron` is available: cleanup, retention, monitoring summary, Telegram retry, and bridge heartbeat stale-device cleanup.
15. Verify monitoring in Dashboard → Table Editor by checking monitoring summary rows and in Edge Functions logs.

## 3. SQL Deployment Guide — True Chronological Order

| SQL | Filename | Purpose | Prerequisite | Expected result | Dashboard verification | SQL verification query | Rollback |
|---:|---|---|---|---|---|---|---|
| 1 | `v2/supabase/migrations/20260705080000_v2_platform_base_fresh_project.sql` | Base schemas, extensions, core V2 platform objects, initial RLS foundation | Fresh Supabase project | Base V2 schema exists | Database → Tables shows initial V2 tables | `select to_regclass('public.v2_customers');` | Fresh project only: drop created V2 objects or recreate project |
| 2 | `v2/supabase/migrations/20260705090000_v2_trade_truth_store.sql` | Trade Truth immutable ledger | SQL 1 | Trade Truth tables/RPCs exist | Database → Functions shows trade truth RPCs | `select to_regprocedure('public.record_trade_truth(jsonb)');` | Archive/export ledger; development only drop trade truth objects |
| 3 | `v2/supabase/migrations/20260705100000_v2_command_queue_idempotency.sql` | Idempotent command queue | SQL 1-2 | Queue tables and idempotency constraints exist | Database → Tables shows command queue | `select to_regclass('public.v2_command_queue');` | Drain queue; reverse constraints in maintenance window |
| 4 | `v2/supabase/migrations/20260705120000_platform_foundation.sql` | Roles, packages, approvals, subscriptions, customer accounts, executor foundation | SQL 1 | Platform foundation seeded | Table Editor shows roles/packages/settings | `select count(*) from public.packages;` | Before customers only: remove seeded rows/tables or recreate project |
| 5 | `v2/supabase/migrations/20260705130000_telegram_platform.sql` | Telegram bots, channels, templates, routes, delivery queue | SQL 4 | Telegram routing tables and defaults exist | Table Editor shows `telegram_templates` and `telegram_routes` | `select count(*) from public.telegram_templates;` | Disable routes, drain queue, drop Telegram objects in reverse |
| 6 | `v2/supabase/migrations/20260705180000_executor_manager_monitoring.sql` | Executor runtime monitoring and action tables | SQL 3-4 | Executor monitoring tables exist | Table Editor shows runtime/monitoring objects | `select to_regclass('public.executor_runtime');` | Stop executors, export diagnostics, reverse during maintenance |
| 7 | `v2/supabase/migrations/20260705200000_mt5_hashibridge.sql` | MT5/HashiBridge devices, accounts, commands, heartbeats | SQL 6 | Bridge registration and heartbeat tables exist | Table Editor shows bridge/MT5 tables | `select to_regclass('public.hashibridge_devices');` | Unregister devices, archive bridge logs, reverse migration |
| 8 | `v2/supabase/migrations/20260705210000_research_lab.sql` | Research Lab jobs/results/artifact references | SQL 4 | Research Lab tables exist | Table Editor shows research tables | `select to_regclass('public.research_jobs');` | Archive research artifacts; drop research objects before reuse |
| 9 | `v2/supabase/migrations/20260705230000_production_hardening_retention.sql` | Retention, cleanup, archive, RLS hardening, monitoring cleanup | SQL 1-8 | Production hardening installed | Authentication → Policies shows RLS policies | `select count(*) from pg_policies where schemaname='public';` | Maintenance approval only; reverse specific policy/job changes |

Global checks:

```sql
select schemaname, tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1,2;
select now() as checked_at;
```

## 4. Secret Provisioning Commands

Generate local secrets:

```bash
export PLATFORM_API_TOKEN="$(openssl rand -hex 32)"
export HASHIBOT_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export HASHIBRIDGE_SHARED_SECRET="$(openssl rand -hex 32)"
export HASHIBOT_ENV=production
export PLATFORM_RESET_ALLOW_DESTRUCTIVE=false
export SUPABASE_FUNCTIONS_URL="https://${SUPABASE_PROJECT_REF}.functions.supabase.co"
export VITE_PLATFORM_API_URL="${SUPABASE_FUNCTIONS_URL}/platform-api"
```

Supabase secrets:

```bash
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  SUPABASE_FUNCTIONS_URL="$SUPABASE_FUNCTIONS_URL" \
  HASHIBOT_ENV="$HASHIBOT_ENV" \
  HASHIBOT_ENCRYPTION_KEY="$HASHIBOT_ENCRYPTION_KEY" \
  PLATFORM_API_TOKEN="$PLATFORM_API_TOKEN" \
  PLATFORM_PUBLIC_URL="$PLATFORM_PUBLIC_URL" \
  PLATFORM_RESET_ALLOW_DESTRUCTIVE=false \
  TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" \
  TELEGRAM_FREE_BOT_TOKEN="$TELEGRAM_FREE_BOT_TOKEN" \
  TELEGRAM_VIP_BOT_TOKEN="$TELEGRAM_VIP_BOT_TOKEN" \
  TELEGRAM_ADMIN_OPS_BOT_TOKEN="$TELEGRAM_ADMIN_OPS_BOT_TOKEN" \
  TELEGRAM_FREE_CHAT_ID="$TELEGRAM_FREE_CHAT_ID" \
  TELEGRAM_VIP_CHAT_ID="$TELEGRAM_VIP_CHAT_ID" \
  TELEGRAM_ADMIN_OPS_CHAT_ID="$TELEGRAM_ADMIN_OPS_CHAT_ID" \
  BINANCE_TESTNET_API_KEY="$BINANCE_TESTNET_API_KEY" \
  BINANCE_TESTNET_API_SECRET="$BINANCE_TESTNET_API_SECRET" \
  BYBIT_TESTNET_API_KEY="$BYBIT_TESTNET_API_KEY" \
  BYBIT_TESTNET_API_SECRET="$BYBIT_TESTNET_API_SECRET" \
  MT5_DEMO_ACCOUNT_ID="$MT5_DEMO_ACCOUNT_ID" \
  MT5_DEMO_SERVER="$MT5_DEMO_SERVER" \
  HASHIBRIDGE_SHARED_SECRET="$HASHIBRIDGE_SHARED_SECRET" \
  MONITORING_ALERT_EMAIL="$MONITORING_ALERT_EMAIL" \
  MONITORING_RETENTION_DAYS="$MONITORING_RETENTION_DAYS" \
  RESEARCH_ARTIFACT_RETENTION_DAYS="$RESEARCH_ARTIFACT_RETENTION_DAYS"
```

Netlify env:

```bash
netlify link --id "$NETLIFY_SITE_ID"
netlify env:set VITE_SUPABASE_URL "$VITE_SUPABASE_URL"
netlify env:set VITE_SUPABASE_ANON_KEY "$VITE_SUPABASE_ANON_KEY"
netlify env:set VITE_PLATFORM_API_URL "$VITE_PLATFORM_API_URL"
netlify env:set VITE_APP_ENV production
netlify env:set HASHIBOT_ENV production
netlify env:set PLATFORM_PUBLIC_URL "$PLATFORM_PUBLIC_URL"
```

Local bootstrap:

```bash
export SUPABASE_URL=<https://your-project-ref.supabase.co>
export SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
export BOOTSTRAP_OWNER_EMAIL=<owner-email>
export BOOTSTRAP_OWNER_PASSWORD=<temporary-owner-password>
export BOOTSTRAP_ADMIN_EMAIL=<admin-email>
export BOOTSTRAP_ADMIN_PASSWORD=<temporary-admin-password>
```

HashiBridge desktop/agent secret store:

```bash
hashibridge config set HASHIBRIDGE_DEVICE_ID "$HASHIBRIDGE_DEVICE_ID"
hashibridge config set HASHIBRIDGE_SHARED_SECRET "$HASHIBRIDGE_SHARED_SECRET"
hashibridge config set SUPABASE_FUNCTIONS_URL "$SUPABASE_FUNCTIONS_URL"
hashibridge secrets set MT5_DEMO_LOGIN "$MT5_DEMO_LOGIN"
hashibridge secrets set MT5_DEMO_PASSWORD "$MT5_DEMO_PASSWORD"
hashibridge config set MT5_DEMO_SERVER "$MT5_DEMO_SERVER"
```

## 5. Storage Setup

Open Supabase Dashboard → Storage → New bucket. Create each as private. If the UI supports file size/MIME limits, set them there; otherwise enforce in application policy and cleanup jobs.

| Bucket | Visibility | Limit | MIME types | Lifecycle / cleanup / archive / compression | Verification |
|---|---|---:|---|---|---|
| `research-artifacts` | Private | 25 MB/object | `application/json`, `text/csv`, `application/pdf` | Keep 90 days; archive monthly; compress JSONL when large; delete expired | Upload/download with service role; anon denied |
| `audit-archives` | Private | 100 MB/object | `application/gzip`, `application/zstd`, `application/json` | Retain 7 years; immutable quarterly review; prefer gzip/zstd | Archive object exists; delete requires admin/service role |
| `telegram-media-cache` | Private | 10 MB/object | `image/png`, `image/jpeg`, `application/pdf` | Daily cleanup after 7 days; no long-term archive | Test media cached and later cleanup query finds it |
| `bridge-logs` | Private | 25 MB/object | `application/gzip`, `text/plain`, `application/json` | Daily cleanup after 14 days; compress diagnostic bundles | Upload diagnostics; verify private access |

## 6. Edge Functions

Deploy all functions:

```bash
for fn in runtime-health queue-health provider-health monitoring-summary platform-api telegram-platform research-lab executor-start executor-stop executor-pause executor-resume executor-restart executor-recovery executor-heartbeat mt5-account-register mt5-recovery bridge-register bridge-heartbeat bridge-sync mt5-terminal-health; do
  npx supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF"
done
```

| Edge Function | Purpose | Required secrets | Verification |
|---|---|---|---|
| `runtime-health` | Runtime health | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLATFORM_API_TOKEN` | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" "$SUPABASE_FUNCTIONS_URL/runtime-health"` |
| `queue-health` | Command queue health | Supabase service secrets | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" "$SUPABASE_FUNCTIONS_URL/queue-health"` |
| `provider-health` | Provider status | Binance/Bybit keys | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" "$SUPABASE_FUNCTIONS_URL/provider-health"` |
| `monitoring-summary` | Monitoring rollup | Supabase service secrets | Curl returns summary JSON |
| `platform-api` | Platform API | `PLATFORM_API_TOKEN`, Supabase service secrets | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" "$SUPABASE_FUNCTIONS_URL/platform-api/health"` |
| `telegram-platform` | Telegram webhook/delivery | Telegram bot tokens/chat IDs | Telegram test event delivered |
| `research-lab` | Research jobs/results | Supabase service secrets, optional research settings | POST test job metadata accepted |
| `executor-start` | Queue start action | Supabase service secrets | POST executor key returns queued action |
| `executor-stop` | Queue stop action | Supabase service secrets | POST executor key returns queued action |
| `executor-pause` | Queue pause action | Supabase service secrets | POST executor key returns queued action |
| `executor-resume` | Queue resume action | Supabase service secrets | POST executor key returns queued action |
| `executor-restart` | Queue restart action | Supabase service secrets | POST executor key returns queued action |
| `executor-recovery` | Queue recovery action | Supabase service secrets | POST executor key returns queued action |
| `executor-heartbeat` | Executor heartbeat/action | Supabase service secrets | Heartbeat appears in DB |
| `mt5-account-register` | Register demo MT5 account | Supabase service secrets, MT5 metadata | Account row created |
| `mt5-recovery` | MT5 recovery action | Supabase service secrets | Recovery action queued |
| `bridge-register` | Register HashiBridge device | `HASHIBRIDGE_SHARED_SECRET` | Signed request creates device |
| `bridge-heartbeat` | Bridge heartbeat | `HASHIBRIDGE_SHARED_SECRET` | Signed heartbeat updates timestamp |
| `bridge-sync` | Bridge command sync | `HASHIBRIDGE_SHARED_SECRET` | Signed sync returns command batch/empty list |
| `mt5-terminal-health` | MT5 terminal health | `HASHIBRIDGE_SHARED_SECRET` | Signed health report stored |

Bridge signed requests must include `x-hashibridge-device-id`, `x-hashibridge-timestamp`, `x-hashibridge-nonce`, and `x-hashibridge-signature`.

## 7. Telegram Setup

1. In Telegram, open BotFather.
2. Run `/newbot` three times: FREE, VIP, and ADMIN_OPS. Store `TELEGRAM_FREE_BOT_TOKEN`, `TELEGRAM_VIP_BOT_TOKEN`, `TELEGRAM_ADMIN_OPS_BOT_TOKEN`. If the default DB seed expects `TELEGRAM_BOT_TOKEN`, set it to the router/default token or the FREE token until routing is customized.
3. Create channels/groups: Free Signals, VIP Signals, Admin Ops.
4. Add the matching bot as administrator to each channel. Grant post message permission; ops bot also needs read/admin diagnostics if used.
5. Get chat IDs by sending a test message and calling `https://api.telegram.org/bot<TOKEN>/getUpdates`, or by forwarding a channel post to a trusted ID bot. Channel IDs usually start with `-100`.
6. Configure Supabase secrets with all bot tokens and chat IDs.
7. Configure webhook URLs if using webhooks: `$SUPABASE_FUNCTIONS_URL/telegram-platform/webhook/free`, `/vip`, and `/admin_ops`.
8. Verify `sendMessage` for each bot/channel.
9. Retry testing: temporarily revoke bot post permission, enqueue a test, confirm failure/retry in `telegram_delivery_queue`, restore permission, and confirm delivery.

## 8. Provider Setup

### Binance Testnet
1. Create/login to Binance Testnet.
2. Create API key with testnet trading permissions only.
3. Store `BINANCE_TESTNET_API_KEY` and `BINANCE_TESTNET_API_SECRET` in Supabase secrets.
4. Run `provider-health`; verify Binance testnet status is healthy.

### Bybit Testnet
1. Create/login to Bybit Testnet.
2. Create API key for testnet with minimum required trade/account permissions.
3. Store `BYBIT_TESTNET_API_KEY` and `BYBIT_TESTNET_API_SECRET` in Supabase secrets.
4. Run `provider-health`; verify Bybit testnet status is healthy.

### MT5 Demo / HashiBridge / Desktop Agent / EA
1. Open a broker demo account and record `MT5_DEMO_ACCOUNT_ID`, `MT5_DEMO_SERVER`, `MT5_DEMO_LOGIN`, and `MT5_DEMO_PASSWORD`.
2. Install MT5 and confirm the demo account logs in manually.
3. Install HashiBridge desktop agent and set device ID, functions URL, shared secret, MT5 server/login/password.
4. Install `v2/hashibridge/agent-ea/HashiAgentEA.mq5` into MT5, attach to the intended chart, enable Algo Trading, and confirm heartbeat logs.
5. Call `bridge-register`, `bridge-heartbeat`, `bridge-sync`, and `mt5-terminal-health` with signed requests.
6. Verify bridge/terminal rows in Supabase and that no function places orders directly; all execution must flow through command queue/execution worker.

## 9. Netlify Setup

1. Netlify Dashboard → Add new site → Import an existing project.
2. Connect the Git provider and select the V2 repository.
3. Set base directory to `v2`.
4. Set build command to `npm run typecheck` unless a web build command is introduced.
5. Set publish directory to `v2` or the actual generated web output if later added.
6. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PLATFORM_API_URL`, `VITE_APP_ENV`, `HASHIBOT_ENV`, `PLATFORM_PUBLIC_URL`.
7. Confirm `v2/netlify.toml` redirects/headers/cache policy are detected.
8. Deploy. Copy production deploy URL to `PLATFORM_PUBLIC_URL`, update Supabase secrets and Netlify env if changed, and redeploy.
9. Verify the UI loads, auth initializes, Platform API health succeeds, and browser console has no missing env errors.

## 10. Owner / Admin Bootstrap

1. Export local bootstrap variables from the placeholder block.
2. Run `bash v2/deploy/scripts/bootstrap-owner.sh`.
3. Verify owner in Supabase Dashboard → Authentication → Users.
4. Verify owner profile/role rows in Table Editor.
5. Create first admin using the same bootstrap pattern or Dashboard Auth invite plus role assignment.
6. Verify admin permissions by logging in as admin and checking packages, customers, approvals, subscriptions, providers, executors, and platform settings.
7. Rotate temporary passwords immediately.

## 11. Platform Initialization

1. Soft reset before onboarding: `bash v2/deploy/scripts/platform-reset.sh soft`.
2. Development factory reset only on a throwaway project: `HASHIBOT_ENV=development PLATFORM_RESET_ALLOW_DESTRUCTIVE=true bash v2/deploy/scripts/platform-reset.sh factory`.
3. Warm caches by calling `runtime-health`, `queue-health`, `provider-health`, and `monitoring-summary`.
4. Warm registry by loading packages/providers/executors in admin UI.
5. Warm scanner by running the first scan in paper/testnet mode.
6. Verify monitoring summary, Telegram ops alert, provider protection status, UI runtime/customer/admin shells, and audit logs.

## 12. End-to-End Deployment Order

1. Clone repository.
2. `cd` to repository and checkout `REPOSITORY_BRANCH`.
3. Run `npm --prefix v2 install`.
4. Create Supabase project.
5. Copy Supabase values.
6. Create local deployment environment exports.
7. Generate secrets.
8. Link Supabase CLI.
9. Run SQL 1.
10. Verify SQL 1.
11. Run SQL 2.
12. Verify SQL 2.
13. Run SQL 3.
14. Verify SQL 3.
15. Run SQL 4.
16. Verify SQL 4.
17. Run SQL 5.
18. Verify SQL 5.
19. Run SQL 6.
20. Verify SQL 6.
21. Run SQL 7.
22. Verify SQL 7.
23. Run SQL 8.
24. Verify SQL 8.
25. Run SQL 9.
26. Verify SQL 9, RLS, RPCs, seeds, and health SQL.
27. Create storage buckets.
28. Configure Supabase secrets.
29. Deploy Edge Functions.
30. Verify Edge Functions.
31. Configure cron jobs for cleanup, retention, monitoring, Telegram retry, and bridge stale-heartbeat cleanup.
32. Verify cron jobs by checking scheduled jobs and dry-run result queries.
33. Create Telegram bots/channels/chat IDs.
34. Configure Telegram secrets/webhooks.
35. Verify Telegram delivery and retry.
36. Configure Netlify site/env/build.
37. Deploy and verify Netlify.
38. Configure Binance Testnet.
39. Configure Bybit Testnet.
40. Configure MT5 Demo.
41. Configure HashiBridge desktop agent and EA.
42. Register HashiBridge/MT5 account and verify heartbeat.
43. Bootstrap owner.
44. Bootstrap admin.
45. Initialize platform with soft reset and cache warmups.
46. Run smoke test: `bash v2/deploy/scripts/smoke-test.sh`.
47. Observe scanner output in paper/testnet mode for at least one scan cycle.
48. Enable testnet execution only after provider health, risk protection, and command queue are green.
49. Run certification: typecheck, unit tests, deployment validation, provider/Telegram/bridge health checks.
50. Begin beta with monitoring and rollback owner on call.

## 13. Smoke Test and Certification

Required smoke-test steps: repository status, dependency install, Supabase link, SQL verification, storage private access, secrets present, function health, Platform API health, Telegram send/retry, provider health, bridge signed heartbeat, owner/admin login, UI load, scanner observation, paper/testnet command queue, monitoring summary, and audit log review.

Required commands:

```bash
npm --prefix v2 run typecheck
npm --prefix v2 run test
npm --prefix v2 run test:deployment
node v2/deploy/scripts/validate-deployment-package.mjs
bash v2/deploy/scripts/smoke-test.sh
```

## 14. Cross-Check Against Supporting Docs

This checklist consolidates and supersedes the deployment details in `/v2/deploy/README.md`, `/v2/deploy/environment.md`, `/v2/deploy/secrets.md`, `/v2/deploy/storage.md`, `/v2/deploy/telegram.md`, `/v2/deploy/providers.md`, `/v2/deploy/netlify.md`, `/v2/deploy/bootstrap.md`, `/v2/deploy/reset-initialization.md`, `/v2/deploy/edge-functions.md`, `/v2/deploy/smoke-test.md`, `/v2/deploy/operations-runbook.md`, `/v2/deploy/sql/SQL_PACKAGE.md`, `/v2/supabase/migrations`, `/v2/supabase/functions`, `/v2/hashibridge`, and `/v2/netlify.toml`.

## 15. Remaining Live-Operator Inputs

The operator must still supply real project values, bot tokens, provider testnet keys, MT5 demo credentials, Netlify account values, and owner/admin identities. Those values are intentionally not present in this repository.
