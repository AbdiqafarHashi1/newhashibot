# Connected forward demo activation

Run these commands from the repository root, in order. Hosted Supabase must be restored before the live mode can succeed. No credentials belong in the browser, a Git commit or a command transcript. Use three dedicated demo accounts with empty positions/pending orders and no normal authorization workers running during the smoke run.

## 1. Offline smoke while Supabase is paused

```sh
node --import tsx scripts/run_connected_demo_smoke.ts --mode=mock
```

Mock mode uses an in-memory database, the real `authorizeCanonicalAccountSignal()` and `drainAccountDispatch()` functions, a frozen MT5 policy fixture with House-Money enabled, and fake Telegram/provider transports. It prints `synthetic: true`, both VIP destination keys, `equity_phase`, `applied_risk_pct` and a mock receipt. It does not prove three-provider connectivity or contact any external service.

## 2. Restore Supabase, link and apply existing migrations

Load `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` into the operator shell using your secret manager. The restore API is asynchronous; wait for `ACTIVE_HEALTHY` before proceeding.

```sh
curl --fail-with-body --request POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/restore" --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
curl --fail-with-body "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF" --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase migration list
supabase db push --dry-run
supabase db push
```

If the project is already active, skip the restore POST. Check the existing migration history before pushing; do not repair a divergent history automatically. This change adds no migration.

## 3. Verify secrets and deploy functions

Create an operator-only `.env.connected-demo` outside the checkout (or use your secret manager). Include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `HASHIBOT_INTERNAL_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_VIP_CRYPTO_CHAT_ID`, `TELEGRAM_VIP_FOREX_GOLD_CHAT_ID`, `PHASE_H_SECRET_ADAPTER=SUPABASE_VAULT`, and the existing provider/bridge secrets required by your deployment. Exchange account keys are verified through Admin onboarding and stored in Vault; no shared customer exchange key is supplied to the smoke runner. Match VIP IDs to the configured Telegram Hub destinations. The Bot must be an administrator with permission to post in both channels.

```sh
supabase secrets set --env-file "$CONNECTED_DEMO_ENV_FILE"
supabase secrets list
supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"
```

`secrets list` confirms names/digests, not valid values. Actual connectivity is checked below. The all-functions deploy includes `execution-account-onboarding`, `phase-h-authority`, `account-signal-authorization`, `market-scanner`, `binance-testnet-execution`, `binance-testnet-monitor`, `bybit-testnet-monitor`, `bybit-demo-execution`, `mt5-bridge`, `telegram-orchestrator`, and the existing management workers.

## 4. Admin onboarding and account activation

Sign in as a user whose **profiles.role is admin**. In `/admin/onboarding`, create the customer-scoped Binance Testnet and Bybit Demo Trading connections through verified Vault onboarding. The current Bybit contract is **Mainnet Demo Trading (`api-demo.bybit.com`)**, not Bybit Testnet (`api-testnet.bybit.com`); these keys are not interchangeable. This task preserves the existing provider contract rather than labeling Demo as Testnet. Binance's current sandbox endpoint is `demo-fapi.binance.com`.

For MT5, create a demo account draft through Phase H, create/consume its pairing code and assign it to the intended Windows bridge and **Demo** terminal login. Do not put a real-money terminal on this bridge. The MT5 bridge is paired through Phase H, not the crypto-only onboarding endpoint.

In the Account risk policies navigation, inspect each customer's account, assign the Brain and apply the default account tier preset. Personal presets retain every market-compatible reviewed configuration. Challenge and Funded default selections omit only `gold.rsi-trailing-15-48-1.5-5-h96` and `gold.frontier-compression-15-24-1.5-5-h96`. They remain selectable manually by Admin. All 16 stay in scanner discovery and Personal selection; VIP broadcasts use the 14-config subset described below. Existing assignments are not silently overwritten.

Enable the existing `house-money/v1` option in Admin account controls and confirm fresh `equity_phase` / applied risk in the account report. Complete the existing entitlement, account-bound acknowledgement and forward-demo certification workflow, then Start/Resume from Admin controls. Policy/strategy edits pause entries and require the normal activation workflow again. Customer reports show assigned configurations and the latest saved equity phase/risk timestamp; they have no start/stop, credential, strategy or risk controls. Existing supported account/Brain provider combinations remain enforced.

## 5. Start provider observation and the MT5 worker

On the paired Windows demo VPS, in a separate shell with its existing bridge environment loaded:

```powershell
cd mt5-agent
python -m pip install -r requirements.txt
python main.py
```

On the operator machine, export the smoke variables above plus `SMOKE_ACCOUNTS_FILE`. Set that file to a JSON array of three objects containing `customerId`, `accountId`, `signalId`: one Binance sandbox, one Bybit Demo, one MT5 Demo. Signal IDs must come from **fresh, confirmed scanner signals**, not invented examples. Each selection requires its own fresh scanner-created authorization job with `state=PENDING` and `dispatch_state=PENDING`. Pause the normal authorization cron during this one-shot run so it does not consume those jobs first. Keep provider observation/protection monitoring and the MT5 agent running.

Refresh the exchange monitors before the smoke (the monitors use the existing configured account scopes):

```sh
curl --fail-with-body "$SUPABASE_URL/functions/v1/binance-testnet-monitor" --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" --header 'Content-Type: application/json' --data '{}'
curl --fail-with-body "$SUPABASE_URL/functions/v1/bybit-testnet-monitor" --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" --header 'Content-Type: application/json' --data '{}'
node --import tsx scripts/run_connected_demo_smoke.ts --mode=live
```

Live mode refuses non-sandbox, wrong-owner, disabled or incompletely scoped accounts and dispatchable jobs outside the selected demo accounts. Use an isolated demo queue with no concurrent authorization producers during this step. It verifies both VIP message receipts, runs canonical authorization, records the matching job decisions, and calls the existing SQL-guarded dispatch/adoption path. It prints current risk phase and applied risk and waits up to 30 seconds per provider for an actual stored provider order ID. A queued MT5 command is not reported as a broker fill. Missing, blocked, uncertain or timed-out evidence exits nonzero; do not retry an uncertain submission blindly—use reconciliation.

The Telegram messages are explicitly labeled CONNECTED DEMO SMOKE, not trade alerts. Telegram delivery here checks formatting and channel permissions directly; it does not bypass or certify the production router's durable publication queue.

## 6. Resume normal execution workers after successful smoke

Resume the existing account authorization cron. For a bounded manual cycle, use:

```sh
curl --fail-with-body "$SUPABASE_URL/functions/v1/account-signal-authorization" --header "x-hashibot-internal-secret: $HASHIBOT_INTERNAL_SECRET" --header 'Content-Type: application/json' --data '{"action":"drain"}'
curl --fail-with-body "$SUPABASE_URL/functions/v1/binance-testnet-monitor" --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" --header 'Content-Type: application/json' --data '{}'
curl --fail-with-body "$SUPABASE_URL/functions/v1/bybit-testnet-monitor" --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" --header 'Content-Type: application/json' --data '{}'
```

Keep the MT5 daemon and the deployment's existing protection/reconciliation schedules running; do not create duplicate schedulers. Verify provider order IDs, protected lifecycle states, stop/target placement, positions and entitlement expiry in Admin account reports. A smoke receipt proves the observed step, not future profitability. Hosting restoration, deployment, channel permissions and genuine provider demo observations are the remaining live activation steps.

## VIP channel content and pinned guide

Add `TELEGRAM_FREE_CHAT_ID` for public analysis/incentives, alongside the two separate `TELEGRAM_VIP_CRYPTO_CHAT_ID` and `TELEGRAM_VIP_FOREX_GOLD_CHAT_ID` smoke destinations. Also configure the corresponding **FREE**, **VIP_CRYPTO** and **VIP_FOREX_GOLD** destinations in Admin Telegram Hub (`telegram_audience_configuration`); the production router resolves these verified Hub bindings, not smoke-only environment aliases. All three chat IDs must be distinct. Verify Bot admin/posting permissions, then pin `docs/launch/VIP_SUBSCRIBER_RISK_GUIDE.md` in each paid channel.

Apply the editorial-spacing migration with `supabase db push` before deploying the updated functions. The existing intelligence agent produces source-backed news/analysis and separate editorial work; it now includes macro discipline reminders and a periodic execution-tier invitation. Editorial delivery receives a durable randomized 2–12 minute scheduling delay, a channel-wide minimum two-hour reservation cooldown and a fresh check against recent/queued trade alerts. Trade alerts take priority and do not wait for editorial slots. Unavailable/missing-source intelligence remains withheld. A future unannounced trade alert cannot be predicted; the guard protects the preceding 30-minute window and known queued alerts.

Run one bounded generation/publication cycle after the existing schedules are enabled (do not create duplicate crons):

```sh
curl --fail-with-body "$SUPABASE_URL/functions/v1/intelligence-engine" --header "x-hashibot-internal-secret: $HASHIBOT_INTERNAL_SECRET" --header 'Content-Type: application/json' --data '{"action":"scheduled"}'
curl --fail-with-body "$SUPABASE_URL/functions/v1/canonical-reporting-worker" --header "x-hashibot-internal-secret: $HASHIBOT_INTERNAL_SECRET" --header 'Content-Type: application/json' --data '{"action":"work"}'
```

Check `signal_publication_work` for delayed editorial work and its `next_attempt_at`. Run the existing reporting worker schedule after that time; a queued/delayed post is not a delivered receipt. Content can expire while waiting behind signals/cooldowns and is then suppressed. The two VIP-excluded strategies remain active for scanner/account evaluation; they are held at the subscriber publication boundary.

## Targeted verification for this change

```sh
node --import tsx --test tests/operations/connectedDemoPart2.test.ts
node --import tsx scripts/run_connected_demo_smoke.ts --mode=mock
```

Touched TypeScript/TSX/MJS files are linted with `scripts/connected-demo/eslint.config.mjs`; pass the explicit changed-file list to ESLint. The ordinary repository config ignores edge/script files, so using only that config would not check these changes. The live-branch unit coverage uses injected Supabase/provider transports and is not an observed hosted smoke run. The new editorial migration still needs to be applied and exercised on restored Supabase.

Approved Phase-O text posts for FREE/VIP_CRYPTO/VIP_FOREX_GOLD also enter the canonical editorial queue; Phase O records delivery only after a canonical Telegram message receipt is stored. Existing manually approved artifact/document delivery retains its separate reviewed flow. Keep `phase-o-worker` and `canonical-reporting-worker` schedules enabled; a scheduled text post is not marked sent prematurely.

## Personal growth lineup update

Push migration `20261118223000_personal_growth_profiles.sql` before deploying the updated functions. It retains existing account ownership/RLS, installs the 13-engine product union when an Admin exists, narrows exact broad Personal sandbox strategy defaults, and pauses those accounts' new entries. Custom strategy selections and Prop policies remain unchanged. Risk is never raised automatically.

After deployment, use Admin account operations: **Activate product strategy lineup** (13 scanner engines / eight VIP sources), **Apply default account tier preset**, then save **Personal demo risk profile → Growth 2** or **Aggressive 5** where desired. These profiles require demo/testnet and fresh account facts. Review risk/exposure/margin limits and the paused account state before restarting through the existing controls. Preserve the Standard profile on accounts that have not been selected for the experiment. See `docs/research/focused-portfolio-20261118/DEPLOYMENT.md` for exact IDs and limitations.

Repeat the existing `--mode=mock` command after deployment changes. The live runner still requires actual sandbox connections and observes provider receipts; an injected-transport unit test is not a live provider smoke run. No hosted deployment or live receipt is implied by these repository tests.

Offline sizing-path smoke commands (synthetic account and margin capability only):

```bash
SMOKE_PERSONAL_RISK_PROFILE=GROWTH_2 node --import tsx scripts/run_connected_demo_smoke.ts --mode=mock
SMOKE_PERSONAL_RISK_PROFILE=AGGRESSIVE_5 node --import tsx scripts/run_connected_demo_smoke.ts --mode=mock
```

The override is rejected in live smoke mode. Live smoke reads the Admin-assigned profile from the connected account.
