# Phase L — Replay, Shadow Validation and Backend Readiness

## Status and authority map

PR #246 is merged at `4531221`. Phase K is merged at `62945b9` with its consolidation fix at `425bf21`. The active `market-scanner` constructs one `ProfessionalStrategyRegistry`, calls `evaluateActiveStrategies` and `arbitrateActiveScanner`, and commits through `commitScannerDecision`; Phase D alone owns account risk/quantity, while Phase E/F retain account-scoped demo execution. Telegram and UI remain consumers of canonical signal truth. Phase L adds no signal insert, publication enqueue, Telegram send, paper intent, execution adoption, provider order call, or independently scheduled scanner.

| Concern | Authority | Phase-L result / gap |
|---|---|---|
| Indicators | Phase-K root indicator engine | Replay consumes scanner-built contexts; no duplicate strategy engine. |
| Strategies | `ProfessionalStrategyRegistry` | Shared evaluation boundary retained. Production identities remain MicroScalper, QuickScalp, CompressionBreakout and SwingContinuation; research strategies remain non-live. |
| Qualification/arbitration | active-scanner core / root-compatible canonical arbitrator | Replay and shadow call the same exported functions and record candidates, rejections, winner or no-trade. |
| Production signals | scanner decision RPC and publication queue | Validation tables are isolated; publication and execution flags are always false. |
| Historical data | persisted supplied/provider dataset | MT5/HashiBridge, Binance and Bybit downloads are bounded, resumable and provenance-bearing; no suitable real dataset is committed: **AWAITING_DATA**. |
| Forex/Gold scanner feed | dedicated owner-controlled MT5/HashiBridge | This is now the primary authority. Admission fails closed unless the configured feed identity is enabled, healthy, fresh, execution-account-independent and data-validated. Twelve Data is optional research input only. |
| Broker prices | Phase E MT5 / Phase F crypto providers | Scanner feed candles are analytical inputs; broker bid/ask, spread, execution latency and fills are separate execution evidence and must never be presented as equivalent. |
| Operations Center | existing Scanner Status + authenticated Phase-L handler | Start/cancel, progress, exclusions, hashes and genuine run history are wired through admin authority; deployment remains configuration-required. |

## Historical acquisition

The existing data-acquisition UI now uses bounded Binance/Bybit pagination and 30-day MT5 history commands, resumes missing ranges from IndexedDB coverage, and registers each completed dataset through the authenticated validation service in 500-row batches. Registration records source, symbol, timeframe, requested/actual dates, coverage, provenance, cursor and a server-computed hash. Interrupted registrations remain `FAILED` with their last durable cursor and never masquerade as ready.

## Replay contract

`phase-l-validation.ts` admits UTC, ordered, closed OHLCV data; excludes duplicates, malformed candles and future/open candles; and labels expected Forex weekend gaps separately from unexpected gaps. It never silently fills a gap. A bounded run records run/configuration, dataset/provenance/hash, strategy/version/parameter version, symbol/timeframe/close, candidates/rejections, and canonical arbitration/no-trade. The caller must build contexts with the active scanner indicator boundary. The runner rejects lookahead and cannot publish or execute.

Actual bounded replay (JSON candle array plus an approved scanner-configuration snapshot):

```bash
npm run replay:phase-l -- ./candles.json ./approved-config.json EURUSD 15m 2026-01-01T00:00:00Z 2026-03-01T00:00:00Z 500
```

The command constructs the exact shared scanner indicators, builds the production registry from approved configuration, invokes shared qualification/arbitration, and emits cycle evidence. It fails precisely with `AWAITING_DATA`, `APPROVED_SCANNER_CONFIGURATION_REQUIRED`, an evaluator/version mismatch, or a symbol/timeframe eligibility error. It never invents defaults.

## Outcomes and evidence

Every genuine run must declare fee, spread, slippage and funding assumptions; `NEXT_OPEN` entry; partial-exit percentage and lifecycle; and both-hit ordering. A same-candle stop/target collision is `AMBIGUOUS` or conservatively `STOP`, never resolved with later candles. Reports may calculate trade count, net expectancy, profit factor and peak-to-trough drawdown overall and per strategy/symbol/timeframe only from persisted genuine evidence. Existing production outcomes remain canonical for live signals; research assumptions must be visibly labelled and are not production outcomes.

The append-only ledger requires non-overlapping chronological DEVELOPMENT, VALIDATION and untouched HOLDOUT periods plus dataset/configuration hashes. Neither local replay nor shadow output promotes or certifies a strategy.

## Shadow readiness

`ShadowCoordinator` enforces cycle idempotency, hard cycle/request bounds, cancellation and checkpoint recovery. The authenticated `phase-l-validation` handler invokes the existing active scanner boundary, persists status/cycles/exclusions/failures, and uses the Phase-L tables. It must not have a scheduler independent of the scanner, publication credentials, or execution provider access. Deployment begins in `NOT_RUN`; absent feed configuration is configuration-required, not success.

## Purchase lifecycle

Attempt identity now includes authenticated customer and immutable offer/account/phone selection. Retry, transport uncertainty, and configuration recovery retain the same key; terminal provider/canonical evidence is required before explicit new-purchase rotation. Changed account/offer/phone creates a distinct scope. UI submission locks use `finally`. The checkout Edge Function validates reused selection, recovers `CREATED`/`SLOT_RESERVED` checkouts and `STK_NOT_SENT` attempts once configuration is available, and refuses phone mutation or duplicate initiation. Logout/account switching cannot reuse another customer's scope.

## Migration and deployment preparation

Phase L follows `20260930120000_phase_k_active_scanner_signal_truth.sql` and `20260930180000_public_purchase_journey.sql` with `20261001120000_phase_l_replay_shadow_evidence.sql`, then `20261001180000_phase_l_validation_server_and_datasets.sql`. No duplicate Phase-L timestamp was found. Before deployment:

1. Take a provider-supported database backup and record restore/PITR procedures and current migration table.
2. Read-only compare `supabase_migrations.schema_migrations`, table/column definitions, policies, triggers and function definitions against local ordered migrations. Never mark a migration applied without matching SQL.
3. Apply in an isolated environment; verify extensions/schema prerequisites, `is_admin()`, RLS denial for ordinary users, service-role writes, immutable triggers, overlap exclusion and concurrent cycle uniqueness.
4. Deploy required existing scanner/commerce Edge Functions and the future server validation handler only after review. Safe configuration names: `MT5_MARKET_DATA_FEED_ID`, `MT5_BRIDGE_TOKEN`, `PHASE_L_MAX_CYCLES`, `PHASE_L_MAX_REQUESTS`, `PHASE_L_VALIDATION_ENABLED`; secrets remain server-only. Twelve Data credentials are optional research configuration.
5. Verify zero rows in customer signals/publication/execution from a replay, cancellation/restart, request bounds, dataset hashes, and admin read-only UI.
6. Activation gates: backup proven; isolated migration passed; dedicated MT5/HashiBridge feed identity, health and data contract validated for Forex; server auth/limits proven; explicit owner approval. Do not enable cron or execution.

No remote SQL, reset, cron activation, function deployment or provider order was performed.

## Remaining roadmap (not implemented)

- Telegram canonical signal and trade reporting.
- Customer #001 forward-demo integration and evidence.
- Unified Operations Center, support and recovery.
- Growth/outreach/engagement agents.
- Evidence-backed screenshot/proof generation and approved upgrade links.
- Campaign/affiliate attribution and dashboard tracking toward 1,000 active VIP customers.
- Google Cloud deployment of scanner and heavy workers using portable job contracts.
- Controlled acquisition after payment, Telegram and signal evidence gates.
- Public Auto Execution only after owner testing and separately approved release gates.

The private owner prop research/testing track remains separate from customer execution authority.

## Honest evidence status

- Real historical data processed: **AWAITING_DATA**.
- Measured strategy results: **NOT_RUN**.
- Real shadow cycles: **NOT_RUN**.
- Strategy certification: **NOT_RUN**; deterministic tests are not certification.
- Forex feed: **code-ready; dedicated MT5/HashiBridge configuration and real-provider validation required**.
- Database deployment: **NOT_RUN**.
- Visual review: **NOT_RUN** (no browser visual tooling used).
