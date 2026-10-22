# Deployment runbook — gated candidate

No production command in this document was executed during this mission. Existing Telegram credentials/configuration must be retained.

## Supabase and database

Owner confirms `uqiwbzfcntlcyyewawfc` is the production HashiBot project and restores it. Take and verify a recoverable backup. Inspect actual migration versions, policies, canonical commerce/entitlement state, existing cron jobs and Vault references read-only. Follow [the reviewed deployment workflow](../operations/SUPABASE_RELEASE_COMMANDS.md); an isolated fresh-chain pass does not authorize replaying already-applied migrations or resetting the database.

Use `scripts/phase-p/inspect-deployment.mjs`, `plan-deployment.mjs` and the read-only reconciliation SQL. Require a `REVIEWABLE_DRY_RUN` plan with no blockers. After explicit production authorization, `deploy-reviewed-release.mjs --plan <reviewed-plan> --apply` verifies project/source/pending-set before applying. Deploy Edge Functions respecting their existing JWT settings. Never globally disable JWT checks to make webhook tests pass.

Install Release 1 schedules paused through Launch Setup. The six relevant R1 jobs are scanner, outcomes, canonical reporting, commerce recovery, Telegram membership and intelligence; preserve but do not activate Release 2 execution jobs. Check actual recent run receipts, not merely cron registration. Enable one tested service at a time only after approval and safety gates.

## Netlify

Use reviewed integration source, Node24 and the repository `netlify.toml`; frontend `build:web` produces `dist`. Check deploy preview desktop/mobile routes, SPA rewrites, HTTPS and headers. Server secrets never use `VITE_` variables. Preserve the current production deploy for rollback. Production deployment requires explicit owner authorization and release gates; preview/build success is insufficient.

## Telegram

Preserve `TELEGRAM_BOT_TOKEN`, webhook secret and existing audience mappings. Inspect authenticated Launch Setup/channel registry without printing secret values. Verify bot identity, canonical webhook secret, channel membership, post/edit/delete/invite/approve/remove rights as applicable. Use a dedicated test destination for approved live delivery. Prove one canonical enqueue, duplicate suppression, retry/restart, Free/VIP separation, bound `/start` recovery, admission and removal. Paid signals remain blocked until a measured strategy is promoted legitimately. Existing configured credentials are not evidence of current permissions.

## M-Pesa Buy Goods

Configure server-side connection settings: `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORT_CODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL`, `DARAJA_ENVIRONMENT`, `DARAJA_TRANSACTION_TYPE`, `DARAJA_PARTY_B`. Documented `MPESA_*` aliases are accepted; conflicting aliases fail closed. Start in sandbox. For `CustomerBuyGoodsOnline`, get Safaricom confirmation of the business shortcode, PartyB recipient, passkey pairing and STK configuration. The displayed till is not automatically the technical shortcode or recipient.

Callback URL must be HTTPS and point to the deployed `mpesa-webhook`; server-generated correlation is appended by checkout. Configure via authenticated payment connection UI/secure secret store, never chat/browser bundle. Test 3500KES/30days, Kenyan phone normalization, provider query evidence, mismatch/pending/failure/duplicate/callback-loss reconciliation. Sandbox evidence cannot grant production paid entitlement. Only after explicit approval perform a controlled live payment and independently verify the provider receipt and resulting entitlement. Never enable by redirect success.

## Whop

Server-side `WHOP_API_KEY`, `WHOP_COMPANY_ID`, `WHOP_WEBHOOK_SECRET`, `WHOP_VIP_PLAN_ID`, `WHOP_ENVIRONMENT`. `WHOP_EXECUTION_PLAN_ID` is R2 and must remain unavailable for R1 checkout. Set the actual plan to USD29 recurring monthly, without unexpected trial/price/currency. Configure signed events to `whop-webhook`; verify exact endpoint/function configuration in the deployed candidate. Run sandbox/source fixtures, then approved live source lookup for purchase, renewal, scheduled cancellation, refund/dispute and delayed event. Client `VITE_WHOP_*` legacy/public display configuration does not authorize checkout or access.

## Recovery and rollback

Pause sales/publication and relevant jobs through authenticated audited controls; preserve retries, event IDs and entitlements. Redeploy the previous known-good frontend/functions. Database changes require a reviewed forward repair or verified restore plan, never blind down-migrations, history repair or destructive reset. Preserve evidence before retries; uncertain external side effects must be reconciled before resubmission. Verify membership revocation is not silently disabled by pausing unrelated publication jobs. Real restored-backup and live recovery rehearsals remain required.
