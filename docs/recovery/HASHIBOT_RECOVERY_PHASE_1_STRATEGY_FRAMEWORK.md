# HashiBot Recovery Phase 1 — Professional Strategy Framework

## Status

Implemented in the active root runtime. This phase does not deploy, execute SQL, enable cron, change database contracts, or modify Binance, Bybit, MT5, customer, Telegram, signal persistence, reporting UI, or arbitrator behavior.

## V2 reference material reused

The implementation was translated rather than imported. The following abandoned V2 files informed the root design:

- `v2/strategies/index.ts` — strategy identity, version, lifecycle, candidate/reject result, evidence and registry concepts.
- `v2/strategies/crypto/trend-pullback/index.ts` and `README.md` — CryptoTrendPullback identity and intended research posture.
- `v2/strategies/crypto/reversal-exhaustion/index.ts` and `README.md` — ReversalExhaustion identity and intended research posture.
- `v2/tests/strategies/strategies.test.ts` — deterministic registry/filter and strategy test patterns.
- `v2/services/crypto-certification/index.ts` and `v2/tests/execution/crypto-certification.test.ts` — explicit strategy versions, stable evidence and certification boundaries.

There are no runtime imports from `v2/`.

## Root files changed

- `supabase/functions/_shared/professional-strategies.ts` adds the root-owned professional contract, legacy compatibility adapter, single registry implementation, diagnostics collector, and two research strategies.
- `supabase/functions/market-scanner/index.ts` constructs and invokes that registry while retaining the existing evaluator functions, configuration rows, candidate loop, arbitrator, persistence and publication paths.
- `tests/strategies/professionalStrategyFramework.test.ts` provides deterministic compatibility, registry, malformed-input, repeatability and no-lookahead boundary tests.
- `package.json` exposes `npm run test:strategies`.

## Compatibility guarantees

The six active strategies remain the same evaluator functions with the same parameters and `strategy_configs` values:

| Existing strategy | Professional ID | Version | Runtime state |
|---|---|---:|---|
| `MicroScalper` | `crypto.micro-scalper` | `1.0.0` | existing config controls publication |
| `QuickScalp` | `crypto.quick-scalp` | `1.0.0` | existing config controls publication |
| `CompressionBreakout` | `crypto.compression-breakout` | `1.0.0` | existing config controls publication |
| `SwingContinuation` | `crypto.swing-continuation` | `1.0.0` | existing config controls publication |
| `ForexMicroScalper` | `forex.micro-scalper` | `1.0.0` | existing config controls publication |
| `ForexSwingContinuation` | `forex.swing-continuation` | `1.0.0` | existing config controls publication |

For publishable strategies the registry returns the original `EvalResult` object as `professional.legacy`; the scanner passes that unchanged into its existing candidate, distance guard, arbitration and signal loop. The adapter adds `BUY`/`SELL`/`NO_TRADE`, identity, version, expiry, evidence and diagnostics without changing the database payload contract. Disabled rows and symbol/timeframe filters remain non-evaluating/non-publishing.

The scanner entry point remains `supabase/functions/market-scanner/index.ts`. There is one registry, one arbitrator, one candidate/signal writer and one Telegram path.

## Professional contract

`ProfessionalStrategyResult` contains:

- strategy ID and version;
- market, normalized symbol and timeframe;
- `BUY`, `SELL`, or `NO_TRADE`;
- structured rejection reasons;
- confidence and grade;
- entry low/high, stop, TP1, TP2 and risk/reward;
- deterministic bar-based expiry;
- evidence and runtime diagnostics; and
- the exact legacy result used by the existing scanner.

## Registry and configuration

`ProfessionalStrategyRegistry` owns eligibility and evaluation. It enforces unique IDs, market selection, existing `allowed_symbols`/`allowed_timeframes`, the existing `enabled` value, lifecycle state, exception isolation, and diagnostics. Existing database configuration is adapted in memory; there is no new table or migration.

The two recovered strategies are deliberately configured as follows:

| Strategy | ID | Version | Enabled | Lifecycle | Publication |
|---|---|---:|---:|---|---:|
| CryptoTrendPullback | `crypto.trend-pullback` | `0.1.0-research` | false | `RESEARCH` (shadow evaluation) | never |
| ReversalExhaustion | `crypto.reversal-exhaustion` | `0.1.0-research` | false | `RESEARCH` (shadow evaluation) | never |

They run only for eligible crypto `15m`/`1h` contexts, populate in-memory diagnostics, and are omitted from `allEvals`; therefore they cannot reach candidate persistence, the arbitrator, signals, Telegram or execution.

## Diagnostics

The root registry tracks evaluations, eligible evaluations, candidates, rejections/reasons, runtime failures, published signals, and last evaluation/candidate/publication timestamps. The scanner exposes a `professional_strategy_diagnostics` object alongside its existing `strategy_evaluation_summary` response. The existing database summary and reporting contracts are unchanged; no diagnostic column is assumed to exist.

## Tests and limitations

The compatibility suite pins SHA-256 baselines for all six actual production evaluator function bodies so an unreviewed formula change fails the suite. It also covers all six active identities across BUY, SELL and NO_TRADE legacy shapes, including score, rejection reason, stop, targets, expiry, configuration filters, evidence and exact legacy payload preservation. Research coverage includes deterministic repetition, disabled/shadow publication, malformed and stale candles, duplicate IDs, and a closed-candle/no-lookahead boundary.

Known limitations:

- Existing evaluators remain in the scanner during this compatibility-first phase. Moving those large formulas into root shared modules requires captured golden market fixtures and is intentionally deferred to avoid behavior drift.
- The research strategies are translations of V2 intent, not production-certified strategies. They do not publish or write research candidates yet.
- Registry diagnostics are per scanner invocation and returned in the scanner response. Durable aggregation would require a reviewed root migration, which this phase intentionally avoids.
- Staleness continues to be enforced by the scanner/provider boundary rather than changing evaluator behavior.
- Repository-wide typecheck currently has unrelated pre-existing errors; readiness requires those failures to be resolved independently.

## Remaining recovery work

Future authorized phases may add golden candle fixtures from certified root runs, extract existing formulas without changing results, persist approved diagnostic aggregates through a root migration, certify research strategies in replay/paper mode, and only then consider controlled promotion. None of those later actions are performed here.

## Readiness assessment

The professional contract and registry are ready for root scanner use, and active strategy outputs continue through the existing production path. The two recovered strategies are ready for shadow/research observation only. Phase 1 is not authorization to enable them, change cron, or deploy.
