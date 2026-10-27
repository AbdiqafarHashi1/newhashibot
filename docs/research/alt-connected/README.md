# Connected altcoin research candidate — not a Release 1 approval

27 October 2026 (East Africa time). Existing integration PR #269; no replacement scanner, publisher or executor.

## What is now connected

Backtest Lab → Scanner pipeline → built-in **Altcoin relative strength · research only** → authenticated `phase-p-workers` submission → frozen server-owned configuration → existing portable queue/store/worker → hash-verified native candles → production admission, indicators, registry, qualification, canonical arbitrator and active-signal policy → durable cycle/outcome evidence → existing inspection/export.

The candidate is also present in the active scanner's definition list as **DISABLED / SHADOW / RESEARCH**. This is not a production permission. Its immutable replay configuration has `researchOnly: true`; the existing database release trigger rejects promotion. No production strategy configuration, signal publication, cron, provider order or execution setting was enabled.

The new specialist policy checks BTC trend, alt return, relative return, weekly return, closed-hour breakout, native quote-volume ratio and declared costs. It does not impersonate one of the four legacy strategy names or raise its score to A+ to bypass legacy mixed-market rules. Qualification and arbitration still run through their existing shared authorities. The score of 80 is a rule score, not an 80% probability.

Native 15m candles are retained for fills; only complete, aligned, already-closed groups form the 240 hourly observations. BTC is an explicitly hashed reference dependency and never a tradeable event. Missing, stale, gapped, spot, wrong-source or quote-volume-deficient input produces rejection. Default scanner indicators retain their 110-bar window; only this candidate requests 960 native bars of decision history. Equal TP1/TP2 prices are normalized to one target at the qualification-to-arbitration adapter, preserving strict target ordering without inventing a second exit.

## Use in the existing lab

1. Data download: native **Binance USD-M**, 15m; BTCUSDT plus one to three eligible alts. The fixed list is BNB, SOL, XRP, ADA, DOGE, LINK, AVAX, LTC, BCH, NEAR, TRX, all quoted USDT. All remain in the research universe; losing assets were not dropped.
2. Download at least ten days before the intended replay Start and retain native quote volume/instrument evidence. The current data downloader and immutable dataset registration are reused. No exchange account API key is required for public candle acquisition.
3. Scanner pipeline: select the built-in candidate, complete server datasets and dates. For month-long batches use Extended historical window. The existing four-dataset, 10,000-cycle and 12,000-candle research bounds, time slices, retry limits, cancellation and daily budgets remain. The full eleven-asset quarter requires twelve bounded jobs; it is not one continuous portfolio run.
4. Costs/lifecycle are frozen server-side: next native 15m open; fee 10, spread 2, slippage 4, funding 9 bps; full 3R target; no partial/BE/trailing; stop-first collisions; 96 native bars maximum. Funding is an assumption, not an observed settled payment. Insufficient future candles remain OPEN.
5. Inspect/export persisted results. Genuine datasets are not preloaded into the user's paused remote database by this change. The local genuine-data diagnostic uses verified cached official archives, and the endpoint-to-store tests inject PostgREST/RPC transports.

Source files: `crypto-relative-strength.ts`, `crypto-relative-strength-contract.ts`, `phase-p-submission.ts`, `multi-dataset-scanner-replay.ts`, `cloud/worker/handlers.ts`. No migration was rewritten or added.

## Evidence boundaries

The genuine diagnostic reuses the **previously observed** July–September 2026 period. It checks exact frozen proposal arithmetic over every closed hourly decision and then runs the connected scanner policy. The specialist role was implemented as part of integration after identifying the legacy-role mismatch. This is engineering evidence, not an untouched validation or holdout. Current fixed-asset selection has survivorship bias. Monthly jobs reset active state, and independent signal R outcomes are not executable or mark-to-market portfolio returns.

Reproduce with the cached original and added-universe archives:

```sh
node --import tsx scripts/research/alt-scanner-connected.ts /path/to/crypto-alt-validation /path/to/alt-universe
```

The script verifies official archive checksums, normalized-file hashes, row counts, chronology and source identity, then freezes hashes of the shared runtime files. Its summary and compressed selected-outcome evidence are committed beside this report. Source changes during a run invalidate that run; superseded local diagnostics were discarded, not reported as performance evidence.

## Verification and remaining release work

- New behavioral tests exercise authenticated endpoint → server snapshot → existing concrete store/worker adapter → registry/qualification/arbitration → persisted evidence, with injected database transport and no HTTP sends.
- Negative cases cover cross-owner/missing BTC, mutated data/hash/configuration, non-native/future/gapped data, invalid specialist evidence and mixed client scope. Interrupted jobs resume without duplicate outcomes.
- Actual embedded PostgreSQL checks the existing research-only release trigger and JSONB key reordering. This is **not** full deployed Auth/PostgREST/queue/RLS/concurrency verification.
- Authenticated desktop/mobile visual review is **NOT_RUN**: Playwright is installed but no Chromium binary is present. Build verification is separate from visual review.
- Remote database jobs, migrations, function deployment, schedule activation, actual Telegram delivery, provider fills and new forward observation are **NOT_RUN**.

Crypto still needs a preregistered fresh holdout and genuine closed-candle forward evidence; archived positive PF alone cannot approve paid signals. Earlier daily BTC/ETH spot candidates remain separate research with their own exit/instrument contracts, not silently relabelled as this futures strategy. No five-strategy launch claim is made.

## Forex handoff after crypto

Use the dedicated owner-controlled MT5/HashiBridge feed and existing bounded/resumable historical-download flow. Request genuine history, verify actual coverage and source identity, then replay registered Forex evaluators in the same Backtest Lab. Broker retention/terminal limits still apply: no unlimited-history claim. Genuine exported history is the fallback; retain UTC/timezone, symbol, timeframe, source and spread/bid-ask provenance. Missing coverage stays PARTIAL. The bridge must be running and the authenticated backend restored before remote acquisition can work; no live trading is required for scanner history.

Release 1 also retains the Telegram defects shown in the July screenshots as validation requirements: suppress failed/empty news output and raw HTML, deduplicate watchlists, distinguish rule score from calibrated probability, measure expiry results, format EAT timestamps and verify database-backed health recovery. Renaming the old VIP to Crypto and adding Forex & Gold gives four destinations including Free and Admin; actual identities/permissions still require verification. None is claimed fixed by this candidate integration.

## Actual connected diagnostic result

97,152 scanner cycles and 24,288 frozen hourly proposal comparisons; 117 resolved signals, 0 open/excluded outcomes. Net PF **1.5660**, stress PF **1.4552**, mean net return **0.11686R**. Realized signal-cash-flow drawdown **7.9258R**; this is not account or mark-to-market drawdown. The 92-day calendar has 45 active days and 47 zero-entry days; mean 1.272 entries/day, with a 10-day longest quiet streak.

The 117 connected selections and their base/stress entry, exit and P&L match the frozen wider-watchlist study. New independent regression checks recompute risk, costs and signed P&L from that study’s recorded candidate stops and actual next-open fills, rather than using a second strategy approximation. This is parity on observed data, not a new independent experiment. LTC and NEAR still have negative expectancy; TRX has zero trades. The original asset-evidence gate remains failed. No asset was dropped or strategy approved.

## Checks actually run on this change

PASS: `test:phase-l` (including the committed connected-evidence regression), `test:phase-p` (26 tests, including eight new candidate/endpoint/guard checks), `test:phase-m`, `test:phase-k`, `test:historical-data`, `test:release1`, `check:edge-functions`, application typecheck, cloud typecheck, production build and explicit ESLint for the new evaluator/contract, shared replay adapter, new scripts/tests and edited Operations panels. The broader explicit lint invocation also exposes pre-existing `any`/unused-variable diagnostics in Phase-P API/contract/submission files; no repository-wide lint-clean claim is made. Browser review remains NOT_RUN because no Chromium binary is available.

Text/whitespace and conflict-marker checks are performed against the preserved starting files. The checkout has no Git metadata, so these are not mislabelled as `git diff --check`. Published branch/head and PR mergeability are checked through the GitHub integration. No remote SQL or manual deployment is performed.
