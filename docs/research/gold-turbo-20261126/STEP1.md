# Gold Turbo work period 1: verified implementation map

Inspection date: 2026-11-26. Base: `ae0dc5a32b7604ad9150c5bd8dcecced6975afb0`.
Branch: `codex/gold-turbo-step1-inspection`. Inspection only; no trading behavior, deployments or account settings changed.

## Repository and continuation state

- Current main includes merged PR #280 (activation/resource guards), #279 (temporary offline lab access), #278 (browser ledger lab), and #276/#277 (growth lineup/research). Start here to preserve those changes.
- No repository AGENTS.md was found in this checkout. The conversation's instructions continue to apply.
- Existing `research/personal-growth-gold-turbo` head is `fc59591633f3d0117b8f52c17e414b8a79dff0e7`, dated November 24. The only path present there and absent from main in the inspected endpoint diff is `reports/backtests/personal-growth-baseline.json`. It is a realized-R baseline, not five implemented Turbo engines. Other differences include main's newer activation guards: do not replace main with that older branch.
- The open-PR search returned ten older PRs: #268, #267, #266, #264, #263, #251, #250, #248, #245 and #171. This is an inventory, not a recommendation to merge them; checking their patches against current main is outside this work period. GitHub reported them non-mergeable in the search snapshot.
- The older `codex/verify-and-implement-forex-and-gold-strategies` branch exists at `e1be1a4ae7eb8f6830392312743687d41f590bbb`; its implementation has not been independently audited here.

## Evidence verified locally

`inspection.json` records all configuration IDs, symbols, actual entry/exit ranges, per-source coverage, report hashes and source market manifests. Reproduce without downloads or strategy regeneration:

```bash
python3 scripts/research/gold-turbo/inspect.py > docs/research/gold-turbo-20261126/inspection.json
```

- 1,159 unique `(strategy_id, id)` trades across exactly 16 configurations. IDs match the three canonical review modules plus the two complementary IDs.
- All 30 referenced compressed reports exist; SHA256 of each decompressed report matches the ledger's source hash. Every trade resolves to a source hash. Entry/exit ordering, finite realized R and available entry-feature timestamps were checked.
- Trade rows: 510 Crypto, 475 Metals, 174 Forex. The nominal inventory is six crypto-prefixed, five forex-prefixed and five gold-prefixed configurations. **The forex complementary EMA strategy actually trades XAUUSD**: use actual instrument classification for product grouping and isolation, not the ID prefix alone.
- Earliest recorded entry is March 4, 2025; latest exit is October 30, 2026. Coverage is discontinuous and unequal; this is not continuous twenty-month coverage for every strategy.
- Original ledger was not changed or regenerated. Realized R already includes source trading costs; software subscription fees are excluded. Admission-limited trade history and sparse peak/entry features cannot reconstruct new entries, tick paths, floating drawdown or complete scanner participation.
- All 12 entries in the Gold micro SHA256 manifest verified, including archived source and completed study outputs. This verifies retained bytes, not a new independent validation of their financial assumptions.

## Market data: retained evidence versus usable raw history

| Item | Verified availability | Suitable use |
| --- | --- | --- |
| Browser ledger and 30 report sources | Present and hash-verified | Baselines, admitted-trade portfolio and risk simulations with stated limitations |
| Source manifests embedded in ledger reports | 150 distinct source URL/rows-hash/timeframe combinations extracted | Identify original assets/periods and hashes; these manifests are not raw candles |
| Gold micro August-October 2026 manifests | Present; report 18,987,095 ticks and 89,380 M1 rows | Recovery targets and provenance; counts were not recounted without raw bytes |
| `.tmp/gold-micro/data/XAUUSD-YYYY-MM.zip` and M1 JSON for those months | All six expected files absent in this checkout | Must recover original retained files or acquire only the missing selected period before execution validation |
| Research source TAR archives | Nineteen inspected; none has CSV/parquet/NPZ/NPY/ZIP/BIN member candidates | Reproduce prior engine versions; do not mistake C++ files named ticks.cpp for tick datasets |
| Four repository CSV files | Results/trade/metrics exports | Not continuous XAUUSD quote history |
| Other ignored caches and previous worker machines | Not supplied by this fresh clone | Existence elsewhere remains unverified; absence here does not prove loss everywhere |

Library title searches did not identify a raw XAUUSD/Exness/tick dataset. Broader searches returned text/images rather than a verified raw market archive. This does not establish that no such archive exists elsewhere; no unrelated files were imported. No market data was downloaded in this period.

Before work period 8, check available retained cache/artifact locations using the recorded source hashes. If recovery fails, select the smallest adequate development/validation periods and acquire only missing bytes. Persist acquired data durably with a manifest rather than leaving the only copy in ignored `.tmp` storage. August-October have already informed prior research; October's failed holdout is development evidence now. A new untouched chronological period must be reserved before inspecting its results; an incomplete November must be labelled partial.

## Existing architecture and exact reuse points

| Concern | Existing code | Reuse / required addition |
| --- | --- | --- |
| Strategy interface | `supabase/functions/_shared/professional-strategies.ts`, `strategy-plan.ts` | Existing versioned strategy/result/plan lineage. Current evaluation context is candle/indicator based; add an explicit local tick/developing-candle contract without changing existing evaluators. |
| Catalog and releases | `watched-strategy-catalog.ts`, `execution-canonical-reviews.ts`, `cost-positive-configs.ts` | Preserve all 16 reviewed configurations and release gates. Add five Turbo IDs separately as Personal demo research, not to the cost-positive list before evidence exists. |
| Regime/indicators | `entry-regime.ts`, `adaptive-market-policy.ts`, `active-validation-runtime.ts` | Reuse definitions where appropriate. Add bounded local tick windows, velocity/acceleration, forming candles, structural levels and execution-cost features. Avoid requiring cloud scanner cadence for micro decisions. |
| Strategy selection | `execution-strategy-selection.ts`, `execution-strategy-presets.ts`, `execution-tier-presets.ts` | Existing single/custom lists and shortcuts. Add explicit Turbo eligibility and adaptive selection mode; keep Prop/default exclusions. |
| Admin UI | `src/components/operations/AccountStrategySelection.tsx`, `src/pages/admin/BacktestLab.tsx` | Extend existing controls and reporting, keeping selection separate from starting execution. |
| Account authorization | `production-account-authorization.ts`, `account-policy-authority.ts`, `phase-d-execution-plan.ts` | Reuse customer/account identity, entitlement, expiry, risk and audit boundaries. Existing cloud signal decisions cannot simply be bypassed to allow local entries; a bounded, expiring local authorization contract is needed. |
| MT5 command lineage | `mt5-phase-e-execution.ts`, `supabase/functions/mt5-bridge/index.ts` | Preserve exact account/bridge identity, idempotency and approved quantity. Current certified plans support one/two child orders; arbitrary baskets need an explicit new compatible contract. |
| Local runtime | `mt5-agent/main.py`, `config.py`, `mt5_client.py`, `command_processor.py` | This is the implemented Python terminal agent. It reads actual account/specifications and submits/manages orders. Add a bounded local analysis/management path, reusing its terminal identity and command protections. |
| Market acquisition | `mt5-agent/market_data.py`, `mt5_client.py` | Client supports M1; cloud publisher sends 5m/15m/1h/4h frames on a default 30s cadence. Add local tick history consumption and deduplication; do not continuously publish Turbo ticks. |
| Position management | `mt5-agent/managed_positions.py` | Reuse scoped journals, uncertain-send handling, ticket ownership, native protection, TP1/TP2 management and trailing. Add basket ownership, original risk reservation, realized+floating P&L, coordinated closure/reconciliation. |
| Broker compatibility | `mt5_client.py`, `managed_positions.py` | Actual hedging capability and volume/tick specs are read. Current managed certified execution explicitly requires hedging; netting basket compatibility is not implemented or verified. Do not silently combine Turbo with unrelated netted XAUUSD positions. |
| News/expiry/profit protection | `mt5-agent/economic_calendar.py`, `expiry_guard.py`, `prop_profit_guard.py`, `weekend_guard.py` | Existing components and tests, not proof that every new local entry is protected. Wire and verify for Turbo; default daily loss limit must be 1-2%, not inherited aggressive Personal limits. |
| Native EA | `v2/hashibridge/agent-ea/HashiAgentEA.mq5` | Twelve-line heartbeat/contract scaffold, not a working native strategy executor. Do not report it as implemented integration or build a separate customer EA product. |
| Historical engine | `src/lib/clientBacktestEngine.ts`, `clientBacktestSources.ts`, `scripts/research/focused-portfolio/` | Reuse ledger simulations/export. They cannot validate new tick entries or basket fills. |
| Gold tick research | `scripts/research/gold-micro/{features.py,tick_replay.py,ticks.cpp}`, `tests/goldMicro/test_tick_engine.py` | Reuse provenance, causal feature and ordered bid/ask replay ideas. Existing engine is one-position research, not a production basket manager. |

Paths in the architecture table without prefixes are under `supabase/functions/_shared/` unless another directory is shown.

## Important findings for implementation

1. Existing production authorization includes active-symbol conflict gates. Add coordinated basket semantics explicitly; do not remove one-position safeguards globally or interfere with Standard/Forex/swing ownership.
2. Current local daemon performs synchronous cloud work and command polling; a 0.2s loop sleep does not guarantee 0.2s strategy latency. Local protection and tick processing must remain responsive under slow/disconnected cloud calls. Protect against stale ticks and reconnect gaps.
3. Account authorization/planning contains balance-based risk amounts. Turbo sizing must reconcile actual equity, account currency, contract profit/margin calculations and the stricter shared risk envelope; do not assume current fields already satisfy equity-aware baskets.
4. Broker/venue capabilities and cent-account units must be observed. Exness historical reference quotes do not establish Pepperstone fills, live compatibility or cent-account sizing. No terminal/provider handshake was performed here.
5. Gold micro prior candidate failed October after favorable August/September. Retain this failure and source versions; adding local speed alone does not prove an edge. The new five-engine scope remains intact.
6. Current Personal defaults are one Crypto core and four Forex/Gold sources; broader reviewed configurations remain available. Preserve existing product selections while adding demo-only Turbo. Existing selection code's prefix-based grouping merits care because of the XAUUSD complementary ID.

## Next work period: number 2 only

Implement a dependency-light `mt5-agent/gold_turbo/` shared intelligence package, local to the existing agent, with synthetic deterministic fixtures. Proposed names are new work, not claimed existing functions:

- Versioned bid/ask tick and candle input contracts with timestamps/source identity; immutable feature snapshots.
- Ordered/deduplicated bounded tick buffers; 5/15/30-second movements, velocity, acceleration, persistence and spread statistics. Reject stale/out-of-order/gapped evidence appropriately.
- M1/M5/M15 completed and developing candles built causally from observed data; no invented missing ticks or candles. Keep completed and forming states explicit.
- Candle body/wick, swing/support/resistance without future pivots, volatility and trend/range/transition/shock features; cost components remain observed or explicitly assumed.
- Targeted tests for future-data mutation, incomplete candles, timestamp boundaries, duplicates, stale quotes, gaps and cost-sensitive features. This period does not yet enable entry or claim five profitable engines.

Later periods 3-7 implement the five distinct engines, basket execution, safe local authorization/integration and admin selection. Periods 8-9 perform the historical baseline and focused improvement. Keep all Turbo engines demo-only.

## Verification and limits

The offline inventory command passed: 1,159 unique trades, 16 matching IDs, 30 matching report hashes and 12 matching research checksums. The generated JSON contains the detailed coverage and manifests. No full-repository suite, historical optimization, candle download, remote migration, paid/live execution or new strategy performance test was run. Runtime functionality and connectivity remain unverified in this inspection period.
