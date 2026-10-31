# Stored Backtest Lab acceptance — 26 October 2026

## Delivered

The existing Backtest Lab now has one connected registration path for downloaded and imported native candles. It registers a content identity, uploads bounded 500-row chunks, resumes that same identity after transport failure, and finalizes only after server count, coverage and SHA-256 verification. It supports up to 250,000 stored rows per dataset rather than rejecting every dataset above 10,000 bars. A replay batch also caps total stored source rows at 250,000.

Native instrument identity, taker flow and observed bid/ask OHLC survive cache, server registration, PostgreSQL, pagination, hashing and replay. Missing values stay missing. Legacy datasets without native fields retain their old hash representation. SPOT and USD-M have different provider/cache identities; the Crypto data selector now explicitly offers Binance USD-M futures. MT5 history retains supplied ask fields; it never derives an ask path from a bid bar plus an assumed spread.

Actual defects fixed: browser download code referenced Node's `process.env`; unaligned date requests could repeatedly report cached candles missing; database timestamp serialization changed outcome cash-flow strings; server readers discarded native fields; and large-dataset registration/read paths rejected or truncated histories. The tests exercise each of these boundaries.

**Single strategy** now exposes the server scanner replay controls and strategy selection. Its experimental research workspace is retained as a clearly separate expandable section. Selection freezes a server-loaded subset; it cannot submit arbitrary browser parameters or alter live scanner settings. A candidate configuration uses the production evaluator functions, but must not be confused with a promoted live release's frozen parameters.

An explicit extended-research option allows up to 10,000 cycles and 12,000 working candles per dataset, including warm-up. Default 500-cycle/3,000-candle runs remain bounded. Existing 45-second slices, daily budgets, retry bounds, concurrency and 40-slice terminal limit remain unchanged. Long studies can still exceed those bounds and must use smaller declared periods; no partial run is labelled complete. Account/Prop simulation retains its existing separate limits. Extended replay is not an execution permission.

## Frozen learned-model reproduction

The scanner controls accept a model object or one of the existing `docs/research/cost-aware/*-development.json` reports. Models are validated server-side, stored immutably under the administrator's identity, and selected by canonical model ID. Browser-supplied parameters are not accepted when queuing a replay. Schema, feature count, inference bounds, training/evaluation chronology, monthly validity, target/stop/lifecycle and the declared cost protocol are checked.

These imported models are **research-only**. Costs/lifecycle are frozen from their original protocol; native Forex spread is added at the signal candle. The UI excludes them from release choices, and a database trigger prevents their configurations from being inserted or promoted as strategy releases. A positive-looking imported model cannot bypass that guard. Models require observed source fields; absent flow or bid/ask does not become zero.

The acceptance report reproduces one actual saved Crypto forecast and one actual saved Forex forecast after registration, SQL reload and server model lookup. Python's stored predictions match current inference, canonical arbitration selects the same candidate, and net-R accounting matches the stored outcome within 1e-9. Both examples are losses. This proves reproduction, not profitability.

The older whole-study diagnostic selected one active position until outcome exit. Full scanner replay uses the scanner's active-signal/cooldown policy. Those policies can select different later signals. We explicitly **do not** claim the old whole-study trade counts/PF equal a full scanner replay merely because individual forecast and accounting parity pass.

## Genuine evidence and its limits

`evidence.json` records 41 direct-versus-stored verification cases: four Crypto strategies and their combined pipeline across BTC, ETH, BNB, SOL and XRP; three hourly Forex strategies and their combined pipeline across EURUSD, GBPUSD, AUDUSD and USDCAD. Source file hashes, actual periods, frozen candidate settings, costs, outcomes, source-code hashes and blocked coverage are retained. These are deliberately short acceptance windows, not sufficient strategy qualification periods. Scenarios overlap and are not independent portfolio trades or Prop passes.

The 90 official Binance USD-M archive/checksum pairs were recovered again using the existing downloader. No untouched holdout prices were requested. Forex's existing partial native BID/ASK cache was recovered from the prior CI artifact; the fresh Dukascopy probe still returned HTTP 429. Availability-only contiguous segments were used, not segments selected by profit. USDJPY, Gold and native 15-minute Forex coverage remain blocked. Hourly candles were not expanded into invented 15-minute prices.

No new evidence establishes a profitable strategy. Existing failed results remain unchanged. No strategy, payment, entitlement, Telegram channel, schedule or execution route was activated.

## Operator journey after deployment

1. Apply the new migration after the existing migration chain in a disposable rehearsal, then deploy the updated validation/portable endpoints and worker before updating the browser. No migration history is rewritten.
2. In **Connections & historical data**, choose the explicit venue, symbols, timeframes and dates. For Forex/Gold, connect the dedicated owner MT5/HashiBridge history feed. Download Everything keeps source failures distinct.
3. Alternatively import a single-symbol/timeframe native candle JSON array. Source and provenance are operator-supplied research, not broker certification. Inspect the stored status, real interval, row count and hash. A PARTIAL upload cannot start replay.
4. In **Single strategy** or **Scanner pipeline**, choose stored datasets and matching UTC dates. Select one configured strategy or the full configured set. Enable extended research only when needed. Keep costs explicit.
5. For the older learned hypotheses, import the report/model JSON, choose the frozen monthly snapshot and its matching data period. Costs are frozen for that model. Native source fields are required.
6. Start the configured portable worker, inspect persisted progress/exclusions/decisions/outcomes, and export the complete evidence. A queued job is not a completed backtest. No schedule is activated by this change.
7. Treat model experiments and failed/insufficient samples as research. Establish an edge on sufficient chronological evidence, then genuinely untouched and forward observations before signal release. Customer execution remains Release 2 and uses separate account permissions.

## Verification and reproduction

Actual new migration execution in embedded PostgreSQL passed, including 10,001-bar interruption/retry, duplicate content conflicts, owner isolation, immutable models, research-release denial, authenticated-role RLS/grants, source-field/hash round trips, UTC outcomes, over-500-cycle replay and a 601-row nontruncated evidence export. The fixture auth functions are test substitutes: this is **not** real Supabase Auth/PostgREST verification or multi-session concurrency proof.

Release1, Phase K/L/M/P, strategies, historical-data and Telegram checks; application/cloud/focused types; build; Edge discovery/bundling; lint and changed-file whitespace are recorded in the PR with exact outcomes. Browser visual review is NOT_RUN: Chromium download was unavailable. No screenshots or authenticated browser success are claimed. No remote SQL, provider order, payment, message or production deployment occurred.

Reproduce against the original source files:

```bash
python3 scripts/research/cost-aware/download.py /tmp/lab-crypto
python3 scripts/research/cost-aware/prepare-fx.py /path/to/recovered-native-bi5-cache /tmp/lab-fx
node --import tsx scripts/research/lab-acceptance.ts /tmp/lab-crypto /tmp/lab-fx /tmp/lab-acceptance.json
npm run test:release1
npm run test:phase-p
```

The frozen reports are reproducible evidence of failed hypotheses, not a promise that further parameter searching will make them profitable. Further strategy work and complete Forex/Gold data are still needed; credentials alone do not satisfy the signal-quality gate.
