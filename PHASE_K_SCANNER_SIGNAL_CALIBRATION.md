# HashiBot Phase K — Active Scanner Consolidation

**Audit date:** 2026-09-30. **Lineage:** active `work` branch; the reported `f5ecb75` object is absent locally. Its equivalent Phase K commit is `5171c75`, based directly on Phase J merge `dd51477`.
**Completion verdict:** **PHASE K ACTIVE-RUNTIME CONSOLIDATION: COMPLETE IN CODE, DEPLOYMENT HELD.**
**Market certification:** **BLOCKED / NOT_RUN**. No remote migration, cron, function, provider, Telegram delivery, or order call was run.

## 1. Ownership decision and before/after path

### Before

`scheduled-market-scanner → market-scanner → inline adapter/indicator code → dynamically assembled ProfessionalStrategyRegistry → root compatibility arbitrator → one of two direct signals.insert branches → Telegram and optional execution paths`.

The prior Phase K pure module called the extracted `trading-domain` registry while the entry point called the professional registry. It therefore proved a useful contract but not active-entry parity. Risk-blocked candidates were also written as cancelled signals through a second insert branch. The report incorrectly treated active MT5 code as authority to supersede the earlier Twelve Data roadmap.

### After

`scheduled-market-scanner (schedule/run proof only) → market-scanner → bounded Crypto adapter (Forex admission blocked) → ProfessionalStrategyRegistry through evaluateActiveStrategies → arbitrateActiveScanner → commitScannerDecision RPC → immutable signals v2 + scanner_cycle_decisions + idempotent signal_publication_work`.

Operational ownership is now explicit:

* **Strategy framework:** `ProfessionalStrategyRegistry`, authority `professional-strategy-registry/v1`. The entry point constructs it once per symbol/timeframe context and calls it only through `evaluateActiveStrategies`.
* **Arbitrator:** `arbitrateActiveScanner`, authority `arbitrator.root-compat-v1`. It delegates ranking to `trading-domain.arbitrateCanonical`; the root calls no other arbitrator.
* **Signal writer:** `commitScannerDecision` → service-only `commit_scanner_signal_decision`. The root contains no direct signal insert.
* **Account decisions:** the scanner evaluates only `signal_mode`. Account risk, quantity, and execution remain downstream under Phase D.

The extracted `trading-domain/scanner-runtime.ts` and `phase-k.ts` remain research/certification utilities, not a second operational entry point. Active integration tests target the shared boundaries actually imported by `market-scanner`.

## 2. Strategy-by-strategy mapping

Historical `strategy_name` and `candidate_id` values are retained. New v2 signals additionally store `strategy_id`, `strategy_version`, `configuration_version`, `candle_close_time`, and stable `signal_identity`; no historical ID is rewritten.

| Stored/legacy name | Stable ID / version | Root implementation | Parameters | Eligibility | Replacement behavior |
|---|---|---|---|---|---|
| MicroScalper | `crypto.micro-scalper` / `1.0.0` | `evalMicroScalper` registered in ProfessionalStrategyRegistry | DB `strategy_configs`, fallback score 72/RR 1.2; runtime 5m/15m tuning | production eligible, **MONITOR** calibration | Preserved; qualification now reaches the single writer/arbitrator boundary. |
| QuickScalp | `crypto.quick-scalp` / `1.0.0` | `evalQuickScalp` | DB/fallback score 82/RR 1.15 | production eligible, **RESEARCH/MONITOR** evidence | Preserved. |
| CompressionBreakout | `crypto.compression-breakout` / `1.0.0` | `evalCompressionBreakout` | DB/fallback score 75/RR 1.2, max 48 bars | production eligible, **MONITOR** | Preserved; not silently removed because the extracted registry lacks it. |
| SwingContinuation | `crypto.swing-continuation` / `1.0.0` | `evalSwingContinuation` | DB/fallback score 75/RR 1.2, max 96 bars | production eligible, **RESEARCH** calibration | Preserved without promotion. |
| CryptoTrendPullback | `crypto.trend-pullback` / `0.1.0-research` | professional research adapter | frozen research defaults | shadow/research only | Evaluated diagnostically; never enters arbitration/publication. |
| ReversalExhaustion | `crypto.reversal-exhaustion` / `0.1.0-research` | professional research adapter | frozen research defaults | shadow/research only | Same. |
| ForexMicroScalper | `forex.micro-scalper` / contract version | Forex evaluator registry | DB plus contract parameters | shadow/monitor; data admission blocked | Identity preserved; no provider call. |
| ForexSwingContinuation | `forex.swing-continuation` / contract version | Forex evaluator registry | DB plus contract parameters | shadow/monitor; data admission blocked | Identity preserved; no provider call. |
| LondonBreakout | `forex.london-breakout` / contract version | `FOREX_PRODUCTION_EVALUATORS` adapter | contract/default parameters | code eligible; **BLOCKED** | No live claim until provider authority is resolved. |
| NewYorkContinuation | `forex.new-york-continuation` / contract version | same registry | contract/default parameters | code eligible; **BLOCKED** | Same. |
| ForexTrendPullback | `forex.trend-pullback` / contract version | same registry | contract/default parameters | code eligible; **BLOCKED** | Same. |
| GoldVolatilityBreakout | `gold.volatility-breakout` / contract version | same registry | contract/default parameters | code eligible; **BLOCKED** | XAUUSD precision/session/provider evidence remains absent. |

Moving these evaluators to a new registry would change score/reason/parameter semantics and historical attribution. This pass instead selected the already operational professional registry and made certification call its shared entry boundary. No strategy received `CERTIFIED_FOR_SIGNAL_MODE`; no adequately sized chronological holdout exists.

## 3. Forex provider conflict

Repository history contains a Phase 4 Twelve Data target. Later implementation wired MT5 durable candles and labeled MT5 canonical, but no explicit later user decision was found that supersedes the locked target. Implementation is evidence, not roadmap authority.

Therefore `market-scanner` now returns HTTP 409 with `FOREX_PROVIDER_AUTHORITY_UNRESOLVED_TWELVE_DATA_LOCK_MT5_IMPLEMENTATION` for Forex-only/Gold calls, reports zero attempted provider calls, and disables Forex inside combined cycles. It does not call Twelve Data or MT5, does not fabricate fallback candles, and does not create a second Forex scanner. Historical Forex outcome handling remains readable for pre-existing signals; this does not admit new Forex signals.

## 4. Durable signal truth and migration safety

Forward migration `20260930120000_phase_k_active_scanner_signal_truth.sql` is not applied remotely. It adds:

* `scanner_cycle_decisions`, unique by `(cycle_key, arbitration_scope)`, so every reached arbitration scope records `SIGNAL`, `NO_TRADE`, or `REJECTED`.
* Versioned identity/provenance columns on `signals` while preserving existing UUID IDs and historical rows.
* `signal_publication_work`, unique by deterministic signal event key.
* A trigger preventing changes to v2 immutable fields while allowing lifecycle `status`, `updated_at`, and downstream execution references to advance.
* A `SECURITY DEFINER` RPC restricted to `service_role`, with transaction-scoped advisory locking, conflict hashes, atomic signal/decision/publication creation, and idempotent retry results.
* RLS plus revoked anonymous/authenticated writes. Existing customer-safe signal reads remain unchanged.

The outcome evaluator's `signals.status`/`updated_at` update does not touch protected truth fields. Its append to `signal_updates` remains the lifecycle evidence path. The scanner's former `paper_execution_intent_id` update is unreachable because its only mode is `signal_mode`; Phase D owns account-specific decisions. Existing execution services may read signals, but this pass activates none.

## 5. Bounds, candle admission, arbitration, and publication

The root applies `boundedScannerUniverse` before its provider loop. Defaults/hard maxima are Crypto 10/25, Forex 3/6, total 13/31; invalid, fractional, zero, negative, and excessive values throw. Phase K constants additionally document four timeframes, 124 provider requests, two retries, and concurrency four. Forex is blocked before provider access.

Existing professional evaluators reject insufficient, stale, and malformed input, and Phase K tests cover missing, duplicate, mutable, malformed, and stale candles. The root uses closed-candle time in cycle and signal identity. Exactly one winner or explicit no-trade commit exists per market/symbol/timeframe/candle/configuration scope. A/A+ remains the publication set; below-threshold candidates retain rejection evidence. Publication work is created atomically but no customer delivery is invoked by tests.

## 6. Active-entry and replay evidence

`npm run test:phase-k` now runs both the deterministic Phase K fixture suite and `activeScannerIntegration.test.ts`. The latter imports the exact shared framework/arbitrator/limit/writer modules imported by the root entry point, then verifies deterministic ranking, real limit behavior, stable v2 identity, concurrent retry collapse, content conflict rejection, and one publication-work identity. It also audits the root entry source to ensure one registry construction, one active arbitrator call, no direct signal insert, signal-only mode, and explicit Forex block.

This is an isolated repository boundary, not a deployed database test. The SQL transaction semantics are reviewed/tested structurally; a local Supabase database was not available. Genuine provider validation is **NOT_RUN**. No dataset ID, holdout statistic, profitability, Telegram delivery, or live status is invented.

## 7. Operations Center truth

Scanner Status distinguishes: code consolidation, deterministic repository parity, real-provider `NOT RUN`, no certified strategy, Telegram projection-only status, pending migration deployment, and disabled execution. Runtime counts still come from the persisted latest scanner run; missing fields remain `—`/not reported.

## 8. Test results and known baseline failure

Phase K, recovery, Edge Function import checks, scanner parity, canonical runtime, strategies, Telegram, Phase D–J, build, and diff checks are required. On this active lineage, `npm run typecheck` fails with numerous pre-existing application errors outside the Phase K diff (examples: `src/App.tsx` invalid `Section`, MT5 account shape mismatches, unused React imports, and ES library `.at` errors). Phase K changed none of those files except Scanner Status, which is not present in the reported error set. `npm run test:paper-telegram` also fails an existing source-text assertion requiring `.eq("signal_id", event.signal_id)` in `telegram-router.ts`; Phase K does not modify that router. The repository must not be described as fully green.

## 9. Recommendation, blockers, and queue

**Merge recommendation:** merge only after review of the forward migration and explicit acceptance that Forex admission is intentionally blocked. **Deployment hold:** do not deploy until the migration is applied first in an isolated environment and concurrency/conflict/RLS tests pass against PostgreSQL. Deploying the function before the RPC would fail closed with `SCANNER_SIGNAL_COMMIT_FAILED`.

Remaining certification blockers: approved read-only market data, resolved Twelve Data versus MT5 authority, an isolated database migration test, statistically adequate disjoint holdouts using root calculations and realistic costs, and sandbox Telegram delivery. Execution remains disabled and no cron state changed.

Queue: **real-data strategy calibration and scanner signal-mode certification → Telegram signal/reporting certification → Customer #001 forward demo certification → Operations Center/recovery completion → growth, outreach, proof, and engagement agents → Google Cloud workers → controlled acquisition**. Owner-only manual/possible prop automation remains separate from customer execution authority.
