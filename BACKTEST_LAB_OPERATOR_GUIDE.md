# Backtest Lab operator handoff

This change replaces the stacked internal-phase panels with eight task workspaces. It does not certify a strategy, make a performance prediction, activate a worker or submit a provider order.

## Connected workflow

| Workspace | Actual authority and use | Important boundary |
| --- | --- | --- |
| Connections & data | Existing public Binance/Bybit download adapters and dedicated owner MT5/HashiBridge history feed; resumable cache and server dataset registration | MT5 needs a healthy owner feed and backend. Crypto download can proceed independently. Failed registration is an error, not a replay-ready dataset. |
| Single strategy | Existing research strategy registry, cached campaign, trade/chart research | Research registry is not represented as identical to production scanner evaluators. |
| Scanner pipeline | Complete server datasets -> portable replay job -> existing production admission, indicators, qualification, arbitrator and shared selection policy | Requires deployed database/functions and configured portable worker. No second scheduled scanner. |
| Account simulation | Completed scanner evidence -> current account Brain / Phase D -> isolated account simulation | Sequential realised outcomes; not complete overlapping-position or intratrade-equity accounting. |
| 100 Prop challenges | Completed account evidence -> frozen professional firm profile -> existing 100 chronological windows | Overlap disclosed; unsupported rules and insufficient evidence remain incomplete. No claim of 100 independent challenges or payout eligibility. |
| Forward testing | Existing shadow start/observe/inspect/cancel and links to separate account/provider/demo-certification operations | Inspect is read-only. Shadow candles are not fills. Demo certification requires its own provider authorization and evidence. |
| Calibration | Existing research evaluator; up to eight bounded parameter proposals; development/validation/holdout split before evaluation | Local research only. External AI/analyst JSON is allowlisted data, not executable instructions. No integrated AI forecasting service or automatic strategy promotion. |
| Results & exports | Existing server evidence endpoint, structured results and full ledger export; separate worker recovery disclosure | Pagination reads all evidence up to a bounded 20,000-row limit and rejects larger exports instead of silently truncating. |

## Data and UI fixes

- Download Everything publishes its actual campaign to the other research workspaces and refreshes server dataset lists after successful registration.
- Partial Forex/MT5 availability does not make a combined campaign complete. Provider/registration errors remain visible.
- Cached campaigns reopen from existing bars only after count and hash verification. Changed/missing cache fails explicitly; no replacement candles are fabricated.
- Dedicated owner-feed readiness requires an enabled healthy feed, bridge/history account, finite recent heartbeat and no future heartbeat.
- Backend history, dataset and authority reads fail independently; an unrelated reporting health query no longer blanks the whole Lab.
- Operator controls use task names rather than prompt/phase labels. Public pages and approved offers are untouched.
- Account changes clear the previously selected Brain. Submission controls retain existing stable portable-job idempotency.
- Results expose scanner outcomes and individual Prop trials (20 per page), metadata, assumptions, source hashes, raw evidence and JSON exports.

## Calibration methodology

Candles split chronologically 60% development, 20% validation and 20% final holdout before replay. Each period has its own warmup and no cross-period trades. Too little history, incompatible instruments or unsupported parameters fail in the existing research authority. The configured workload is at most 20,000 candles and eight configurations.

Only registered discrete strategy parameters are accepted. Risk/policy changes and arbitrary model output are rejected. Proposals are ranked on development expectancy; validation is measured for every proposal, so it is explicitly not untouched. The final holdout applies to a frozen development winner. Local browser records refuse a different configuration/cost binding after inspection, but are not a tamper-proof server holdout ledger. Changing datasets/configuration/costs makes old results stale and disables holdout/export until rerun.

There is no promise that calibration can rescue an unprofitable strategy. Small samples, nonpositive validation/holdout expectancy and missing evidence remain visible. Positive historical samples are not forecasts. The UI never promotes a strategy or changes the approved production configuration.

## Verification in this work session

PASS:
- `npm run test:backtest-lab`: five behavioral tests, including actual existing research evaluation on deterministic candles, chronological partitions, parameter/cost rejection, cache hash checking and 2,100-row pagination.
- `npm run test:phase-l`
- `npm run test:phase-m`, including the existing persisted scanner -> account -> Prop deterministic chain.
- `npm run test:historical-data`: 15 deterministic historical-acquisition checks.
- Targeted browser bundle of `BacktestLab.tsx` and neutral server bundle of `phase-m-validation/index.ts`.
- `git diff --check`.

NOT VERIFIED:
- Full application build/typecheck: the available local source snapshot lacks unrelated route/tab dependencies. Full build stops at an absent `AdminVisualBridgeManagement` import; the repository's baseline also has existing diagnostics. This is not a passing full check and is not attributed to upstream without a complete checkout comparison. Affected-file diagnostic review and focused bundles are only partial evidence.
- Phone/desktop visual review: cloud browser cannot connect to the workspace's localhost; local Chromium installation failed. No screenshot or visual-pass claim is made.
- Deployed Auth/PostgREST/RLS, real provider/history download, Storage, portable worker operation, real forward cycles and customer/demo certification: NOT_RUN.
- No genuine market dataset was used in tests. Synthetic candles verify behavior only.

## Before calling this production-ready

1. Run full build/typecheck and authenticated mobile/desktop journeys from a complete checkout/preview.
2. Rehearse existing ordered migrations and Edge Function deployments in an isolated backend; this change adds no migration and changes no cron definitions.
3. Connect the dedicated owner MT5 feed and public Crypto history; verify range, source, missing intervals, closed candles, registration hashes and restart/resume on real data.
4. Configure the existing portable worker and run scanner -> account -> Prop evidence against genuine data. Verify 100 stored windows and complete exports.
5. Address overlapping positions and intratrade equity before relying on the account/Prop result for firm-rule certification. A local research holdout must not be called global certification.
6. Validate shadow observation separately from real demo fills/protection/reconnect/closure. Live execution stays disabled.

No remote SQL, schedules, messages, payments, provider orders or production activation were performed.


## Altcoin relative strength research candidate

In Scanner pipeline, select **Altcoin relative strength · research only**. Use native Binance USD-M 15m datasets: BTCUSDT as reference, plus one to three of BNB, SOL, XRP, ADA, DOGE, LINK, AVAX, LTC, BCH, NEAR or TRX (all quoted USDT). The existing Download page now lists this entire fixed universe. Do not substitute spot data or fabricate quote volume.

The downloaded range must begin at least ten days before the replay Start. Choose Extended historical window for month-long batches; existing 10,000-cycle / 12,000-candle research bounds, time slices, quotas and cancellation still apply. BTC is reference-only and does not consume trading cycles. Three alts over one month fit this bound; the full eleven-asset quarter requires separate bounded jobs. Those jobs do not constitute one continuous portfolio.

The server freezes 25 bps total assumed round-trip costs (fees 10, spread 2, slippage 4, funding 9), next 15m open, full 3R target, no partial exit/breakeven/trailing, conservative collisions and 96 native bars maximum. Funding is an assumption, not an observed funding payment. Hourly triggers use only already-closed aligned BTC and alt candles. The production registry, qualification, arbitrator and active-signal policy still apply. Results and exports remain isolated simulations. The new candidate cannot be promoted through measured release because its immutable configuration is research-only.

For Forex, use the dedicated owner-controlled MT5/HashiBridge history feed. Request genuine history through Data download, verify stored coverage, then run existing registered Forex evaluators. Broker retention and terminal settings can limit available history; incomplete coverage must remain PARTIAL. Genuine UTC exports with instrument/source/timeframe and spread provenance are the fallback. Credentials and execution-account connections are not historical-performance evidence. No Forex execution is required to acquire scanner history.
