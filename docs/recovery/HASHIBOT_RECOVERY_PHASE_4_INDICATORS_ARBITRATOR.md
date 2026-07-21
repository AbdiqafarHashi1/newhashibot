# HashiBot Recovery Phase 4 — Shared Indicators and Arbitrator

## Scope and safety posture

Phase 4 adds root-owned, pure indicator and arbitration domains and connects them to the **existing** root `market-scanner`. It does not add a scanner, provider, registry, candidate writer, signal writer, Telegram route, paper engine, or execution path. It does not enable cron or any research strategy. No migration is introduced or executed.

## V2 reference material

The implementation inspected these abandoned reference files and translated only domain ideas—not imports or runtime code:

- `v2/packages/indicator-engine/index.ts`
- `v2/tests/market-intelligence/indicator-engine-step10.test.ts`
- `v2/tests/market-intelligence/runtime.test.ts`
- `v2/strategies/index.ts`
- `v2/services/arbitrator/index.ts`
- `v2/tests/arbitrator/arbitrator.test.ts`
- `v2/services/signal-mode/index.ts`
- `v2/services/crypto-certification/index.ts`
- `v2/tests/execution/crypto-certification.test.ts`

There are no executable root imports from `v2/`.

## Root files changed

- `supabase/functions/_shared/indicator-engine.ts`: closed-candle validation and shared pure indicators.
- `supabase/functions/_shared/arbitrator.ts`: immutable compatibility arbitrator, rejection evidence, decision key, and in-memory diagnostics.
- `supabase/functions/_shared/forex-domain.ts`: research-context EMA now delegates to the same exact root-v1 primitive.
- `supabase/functions/market-scanner/index.ts`: exact-parity EMA/RSI/ATR delegation, one pure arbitration call boundary, research exclusion count, and response diagnostics.
- `tests/runtime/indicatorArbitratorPhase4.test.ts`: deterministic indicator, safety, arbitration, immutability, and scanner-boundary tests.
- `package.json`: `test:indicators-arbitrator`.
- This document.

## Characterized production formulas

The active scanner behavior remains the compatibility baseline:

| Calculation | Root semantics before Phase 4 | Phase 4 identity | State |
|---|---|---|---|
| EMA | SMA of the first `period` values, multiplier `2/(period+1)`, no rounding; short input returns last value or zero | `indicator.ema/root-v1` | Extracted with exact parity |
| RSI | trailing simple gain/loss window; insufficient/flat returns 50; zero loss uses the existing `rs=100` behavior | `indicator.rsi/root-v1` | Extracted with exact parity, including legacy quirk |
| True range | maximum of high-low, high-previous-close, low-previous-close | `indicator.true-range/root-v1` | Shared pure helper |
| ATR | simple average of the trailing 14 true ranges; insufficient input returns zero | `indicator.atr/root-v1` | Extracted with exact parity (not Wilder) |
| SMA | trailing arithmetic mean | `indicator.sma/root-v1` | New shared contract |
| Geometry | absolute body, upper/lower wick, body/range | `indicator.candle-geometry/root-v1` | New shared contract |
| Volume | trailing average and relative volume | `indicator.volume/root-v1` | New shared contract |
| Distance | absolute percentage distance | `indicator.normalized-distance/root-v1` | New shared contract |
| RR | absolute reward divided by absolute risk | `indicator.risk-reward/root-v1` | New shared contract |

Highest high, lowest low, rolling range, percentage change, and relative volume are also available as pure helpers. Closed-candle normalization rejects malformed values, non-strict timestamps, unclosed/future boundary candles, insufficient lookback, and stale input. It never sorts an ambiguous input silently and never reads a later candle to calculate an earlier result.

### Migrated versus retained

Only the scanner's duplicated EMA, RSI, and ATR helper bodies delegate to the shared engine. Their exact formulas, fallback values, inclusion, and rounding are unchanged. Production momentum categorization, regime calculation, range-compression construction, strategy thresholds, evaluator formulas, grading, score breakdowns, stop/target construction, and expiration remain legacy-owned. The six evaluator bodies remain in place and remain protected by the Phase 1 compatibility suite. This deliberately avoids an unverified rewrite of the scanner.

## Pure arbitrator contract

`arbitrate()` accepts immutable candidate snapshots containing identity/version, market, symbol/timeframe, side, confidence, grade, compatibility score, prices, targets, RR, expiry/freshness, lifecycle/publication mode, evidence, and priority. It returns `WINNER` or `NO_TRADE`, the winner where present, all considered candidates, structured rejections, tie-break evidence, version `arbitrator.root-compat-v1`, final evidence, and a deterministic decision key.

The function performs no I/O and mutates no caller input. Invalid, stale, expired, non-finite, structurally invalid, disabled, shadow, or research inputs fail closed. Exceptions cannot yield a partial winner.

## Compatibility behavior and tie breaking

The scanner still performs the existing evaluator, configuration, candidate insert, score/RR, distance, market-context, duplicate, grade, signal, Telegram, and paper-intent gates at their prior boundaries. The pure arbitrator receives only candidates that passed the existing pre-arbitration gates and reproduces the existing ordering exactly:

1. descending existing `arbitrationScore`;
2. when scores differ by no more than `0.0001`, descending existing strategy identity fit;
3. descending risk/reward;
4. stable input order when all keys are equal.

The existing market-context `NO_TRADE` rules remain authoritative. Losers continue to receive the existing candidate update vocabulary and publication proceeds through only the first winner. This is compatibility consolidation, not a new ranking model.

## Rejection vocabulary and diagnostics

Pure-domain reasons include `research_or_non_live_excluded`, `legacy_gate_rejected`, `stale_candidate`, `expired_candidate`, `non_finite_value`, `invalid_price_structure`, `invalid_risk_reward`, `below_score_threshold`, `grade_filtered`, `arbitration_blocked`, and `arbitration_no_trade`.

The existing scanner response now includes:

- `shared_indicator_diagnostics`: versions, calculation count, parity state, and retained legacy calculations;
- `arbitration_diagnostics`: received/rejected counts, reason counts, winners/no-trade, ties, stale/expired/invalid inputs, conflicting sides, research exclusions, failures, duration, version, and last decision key.

These diagnostics are per-run and in memory. No database schema or reporting UI changed.

## Research exclusion boundary

The six research definitions remain disabled/shadow/non-publishable:

- `crypto.trend-pullback`
- `crypto.reversal-exhaustion`
- `forex.london-breakout`
- `forex.new-york-continuation`
- `forex.trend-pullback`
- `gold.volatility-breakout`

The professional registry's `publishable` gate excludes them before `allEvals`; consequently they cannot enter candidate persistence or the production arbitrator. The new pure arbitrator independently rejects `RESEARCH` or `SHADOW` input as defense in depth.

## Testing and parity evidence

The Phase 4 suite covers SMA, EMA seed/smoothing, RSI legacy smoothing and zero-loss behavior, true range, ATR, rolling high/low/range, candle geometry, average/relative volume, percentage change, normalized distance, RR, insufficient/malformed/non-finite data, duplicate/out-of-order/unclosed/stale candles, repeat determinism, and no-lookahead boundaries. Price operations remain unrounded, preserving Crypto, standard Forex, JPY, and Gold precision supplied by callers.

Arbitration tests cover zero/one/multiple candidates, same/conflicting sides, thresholds, stale/expired/invalid inputs, grade filtering, deterministic ties, priority, one winner, forced no-trade, immutability, repeatable decision keys, structured rejections, and research exclusion. Static scanner regression assertions confirm all six production evaluator entry points remain and research is excluded before the production candidate collection.

## Known limitations and readiness

- Behavior parity is certified for the extracted EMA, RSI, and ATR primitives. Remaining indicator-derived production logic is intentionally **not yet migrated**.
- Existing Phase 1 evaluator characterization protects the six strategy bodies; richer captured-provider behavioral fixtures would be required before extracting any evaluator formula.
- Arbitration diagnostics are response-level only and reset each invocation.
- The decision key is a deterministic non-cryptographic identity, not an authentication primitive.
- This phase does not certify profitability and does not make research strategies production-ready.

**Readiness:** suitable for compatibility-mode root deployment review after the repository's existing unrelated typecheck/execution-suite failures are resolved or accepted. Research publication remains prohibited. A later recovery phase may migrate additional legacy-owned formulas only after golden-fixture parity is established; it must not alter execution, customer, or scheduling boundaries.
