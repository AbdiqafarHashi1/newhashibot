# Backtest market-truth audit — 2026-09-07

## Scope and result

This audit covers the browser Backtest Lab data path, the strategy/arbitration test suites, and the execution-contract suite. It is **not** a claim that a strategy is profitable or ready for unattended live trading. A profitable historical replay cannot establish that result without broker-specific bid/ask ticks, commissions, swaps, slippage, latency, and an out-of-sample/paper-trading period.

## Remediation made in this change

1. MT4/MT5 broker exports are now accepted when tab-separated, comma-separated, or semicolon-separated. The importer recognizes angle-bracket headers such as `<DATE>`, `<TIME>`, `<OPEN>`, `<HIGH>`, `<LOW>`, `<CLOSE>`, and `<TICKVOL>`, preserves tick volume, parses quoted fields, and converts dot-form broker dates to UTC ISO timestamps before sorting.
2. The multi-asset downloader no longer substitutes generated synthetic bars after a live-feed failure. A failed instrument is reported as unavailable with zero bars, preventing it from silently contaminating a supposedly live pipeline/prop run.
3. Both live-data paths now reject a provider fallback whose returned interval differs from the requested interval. For example, a 60-minute response cannot be silently used as a 15-minute replay.

## End-to-end control findings

| Area | Evidence | Status |
| --- | --- | --- |
| MT5 CSV ingestion | New deterministic parser test uses the displayed MT5 `<DATE>\t<TIME>` format and validates chronological UTC conversion. | Pass |
| Forex and metals strategies | Production suites exercised Forex and Gold registries and passed. | Pass (contract/logic only) |
| Indicators and arbitration | Phase 4 indicator/arbitrator suite passed. | Pass (contract/logic only) |
| Crypto execution lifecycle | Execution truth suite passed; its chaos report deliberately contains two warnings for unavailable-provider/orphan-position scenarios, with zero failed scenarios. | Pass with warnings |
| Full browser typecheck | Repository-wide TypeScript check currently has pre-existing failures outside this change. Production Vite/server build succeeds. | Not a release gate until baseline is repaired |

## Required evidence before market deployment

1. Upload the broker's own CSV separately for every symbol/timeframe you intend to trade, including bid/ask or a documented conservative spread model, and confirm the timezone used by the export. MT5 server time is not automatically the same as UTC; the importer assumes UTC when no offset is supplied.
2. Use an out-of-sample holdout and paper/demo execution through each configured venue. Reconcile every signal's candidate, arbitration decision, order acknowledgement, fill, stop/TP, and final P&L against broker statements.
3. Do not call the Yahoo-based download a broker-execution replay. It remains a historical reference feed, not tick-level bid/ask market data. Use uploaded broker bars for historical validation and venue logs for execution validation.
4. Do not enable unattended live trading based solely on this audit. Resolve the repository typecheck baseline and require a defined paper-trading acceptance period with no unexplained signal/execution discrepancies.
