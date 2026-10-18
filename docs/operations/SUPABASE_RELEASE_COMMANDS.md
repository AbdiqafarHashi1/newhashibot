# Restore and deploy the original HashiBot project

Target: `uqiwbzfcntlcyyewawfc`. Existing data and migration history are retained. The owner's recollection of migration 098 plus a few later files is a starting point, not an applied-version list: several filenames have repeated human sequence numbers. Supabase uses the 14-digit timestamp, not `098`.

Before the first deployment, restore the project, stop new entries/scanner and pause existing HashiBot schedules, retain a backup, then use `docs/phase-p/read-only-reconciliation.sql`, `scripts/phase-p/inspect-deployment.mjs` and `plan-deployment.mjs` to compare the actual history/schema with an isolated reproduction of that applied prefix. The fresh-install CI is valuable but does not prove the old project's partial history or manual fixes. Review source corrections affecting already-applied versions as schema drift; do not mark them unapplied or replay them.

Use the installed Supabase CLI and discover its current commands first:

```sh
supabase --help
supabase link --help
supabase migration list --help
supabase db push --help
supabase functions deploy --help
supabase link --project-ref uqiwbzfcntlcyyewawfc
supabase migration list --linked
supabase db push --linked --dry-run
```

Once the reconciliation produces a `REVIEWABLE_DRY_RUN` plan with no blockers, one command applies its exact pending migration set and deploys all functions:

```sh
node scripts/phase-p/deploy-reviewed-release.mjs --plan work/phase-p/reconciled-plan.json --apply
```

The runner verifies the linked project, source hashes and CLI dry-run pending filenames. Any difference stops before `db push`. It then uses `supabase db push --linked --yes` and `supabase functions deploy --project-ref uqiwbzfcntlcyyewawfc --use-api --jobs 4`, preserving per-function JWT configuration. Re-running after a partial deployment requires a fresh history/plan. It never resets the database, repairs history, includes seeds, promotes prepared/manual SQL, prunes functions or disables JWT globally. Do not paste secrets into scripts, git, command arguments or chat. Use the CLI's supported environment variables / secure secret input.

Deployment and activation are separate. SQL migrations install the durable jobs/authorities; Edge Function deployment installs handlers. The portable worker still requires its configured host. Launch Setup then verifies scanner/monitor cron names, token presence, worker heartbeat and stopped entry controls before resuming demo services. Check actual fresh cron run receipts rather than only registration. Add Whop/Daraja and Telegram configuration through the authenticated connection screens; test delivery/payment source verification before enabling access changes. No payment or messaging test is automatically triggered by the release runner.

For Forex, use `FOREX_OWNER_FEED_SETUP.md`: Windows VPS, installed MT5 terminal and investor credentials for the owner data feed. Customer execution terminals use separate customer-bound demo connections. A browser-only deployment cannot start a Windows MT5 process. Broker history limits, market closures and terminal/network outages remain observable constraints.

To include paused worker schedule installation in that same run, add `--install-schedules` with `HASHIBOT_ADMIN_JWT` supplied securely in the environment. An authenticated owner can instead use **Launch Setup → Install / update worker schedules (paused)**. All required worker secrets must already exist in Edge Function secrets. Installation returns missing secret names, never values, and writes tokens to Vault rather than plaintext cron commands. Scanner, outcomes, Binance/Bybit monitors, account authorization, account commands, canonical reporting, commerce recovery, Telegram access and agent jobs are installed paused. Resume only the services being tested; phase-O approval and destination/budget gates still apply. Existing older schedules must be reviewed to avoid running duplicate jobs.
