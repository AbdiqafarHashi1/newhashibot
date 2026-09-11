# Phase 3 — Canonical Trading Domain

Status: **PARTIAL**. Four production forex/metals strategies now enter one shared domain from browser and scanner, but eight research strategies and browser trade lifecycle simulation remain dual-owned.

## 1. Phase 2 starting architecture
Phase 2 unified historical data but passed bars into browser-only evaluators while scanner used `_shared` production evaluators, arbitrator, risk/capital and live trade management.

## 2. Duplicate trading-brain audit
Browser `evaluators.ts` and `simulationEngine.ts` owned indicators, entries, score, stop/target and fill lifecycle. Scanner owned separate professional/forex evaluators and root indicators. Prop Replay called the browser simulation engine. The Phase 2 report's subsystem inventory remains accurate.

## 3. Canonical domain architecture
`supabase/functions/_shared/trading-domain` is the environment-neutral package. It imports no React, DOM, storage, Supabase, fetch, credentials, or provider client. Contracts → market view → root indicators → strategy registry → candidate → arbitrator → risk/capital intent → trade plan → lifecycle reducer → trace. It is directly bundled by Vite and Deno-compatible Edge imports.

## 4. Market as-of view
`buildCanonicalMarketView` supports M1/M5/M15/M30/H1/H4/D1, sorts immutable copies, and exposes only candles with `openTime + timeframe <= asOf`. Every view records dataset identity, last close and warm-up state.

## 5. Indicator convergence
The domain re-exports the existing root indicator engine rather than copying formulas. EMA/SMA/RSI/ATR/true range/high/low/range/volume/geometry/distance/RR are one implementation. `canonicalIndicatorSnapshot` supplies migrated strategies. Formula differences are frozen separately.

## 6. Strategy registry
Requirements and evaluator are colocated for London Breakout, New York Continuation, FX Trend Pullback and Gold Volatility Breakout, version 1.0.0. Unknown IDs throw. Each definition includes status, market/instruments, primary/required timeframes, warm-up, close-confirmation, defaults and reason vocabulary.

## 7. Strategy migration status
| Strategy | Primary / required | Status | Active owners |
|---|---|---|---|
| LondonBreakout | M15 / M15,H1 | MIGRATED | canonical registry; old browser branch bypassed |
| NYContinuation | M15 / M15,H1 | MIGRATED | canonical registry; old browser branch bypassed |
| FXTrendPullback | M15 / M15,H1 | MIGRATED | canonical registry; old browser branch bypassed |
| GoldVolatilityBreakout | M15 / M15,H1,H4 | MIGRATED | canonical registry using dedicated production evaluator |
| CryptoMicroScalper | existing UI metadata | DUPLICATE | browser/live-specific |
| CryptoCompressionBreakout | existing UI metadata | DUPLICATE | browser/live-specific |
| CryptoSwingContinuation | existing UI metadata | DUPLICATE | browser/live-specific |
| CryptoReversalExhaustion | existing UI metadata | DUPLICATE | browser/live-specific |
| CryptoMomentumBreakout | existing UI metadata | DUPLICATE | browser/live-specific |
| FXMicroScalper | M5/M15 implicit | RESEARCH_ONLY | browser branch |
| SessionORB | M5/M15 implicit | RESEARCH_ONLY | browser branch |
| MacroYieldDifferential | implicit | BLOCKED | needs deterministic macro-event input contract |

## 8. Candidate contract
Canonical candidates carry deterministic ID, strategy/config versions, as-of, symbol/timeframe, side, unrounded entry/stop/targets, score, structured reason codes, indicator evidence and observations; no UI text is required as source of truth.

## 9. Arbitrator convergence
The pure canonical arbitrator applies score/blocked-symbol gates, stable score then candidate-ID tie ordering, structured rejections and score evidence. Migrated replay/live pipeline calls it. The older general root arbitrator remains for non-migrated strategies.

## 10. Risk convergence
Pure risk intent accepts candidate, balance/equity/available capital, open risk, daily loss, drawdown, exposure and versioned limits. It returns allowance, amount, unrounded desired size, reasons and limits. Existing professional/account risk remains active outside migrated end-to-end adoption.

## 11. Capital convergence
Pure capital intent caps allowed risk against available capital and maximum allocation. Provider rounding remains outside domain. Existing professional allocator remains active for execution routing.

## 12. Trade-plan convergence
The shared pipeline creates one unrounded candle-close intent with stops, targets, R distance, partial/BE/trailing policy and expiry. It does not claim an actual fill.

## 13. Trade-management convergence
The canonical reducer has explicit transitions, event idempotency, and separates SIMULATED_FILL from BROKER_FILL. Simulation cannot claim broker confirmations. The legacy browser loop and full live lifecycle have not yet been replaced; parity is therefore PARTIAL.

## 14. Backtest adapter architecture
The four migrated browser strategy names immediately delegate to canonical market view/registry. Remaining branches are legacy. Metrics/fill simulation are unchanged.

## 15. Live/scanner adapter architecture
`FOREX_PRODUCTION_EVALUATORS` is now a compatibility facade over `CANONICAL_STRATEGIES`; the scanner's existing import therefore calls canonical evaluation without changing execution enablement. Replay/live adapters call the identical `evaluateTradingDecision` function.

## 16. Execution simulation vs broker-truth boundary
Domain output is intent. Replay owns simulated spread/slippage/fills and must label `SIMULATED_FILL`; live owns broker acknowledgements. Neither adapter changes the signal.

## 17. TradingDecisionTrace
Trace v1 stores deterministic ID, dataset IDs, candle timestamp references, versions, indicator outputs, evaluation, arbitration, risk, capital and plan. It excludes full candle bodies, secrets and environment-specific transport data.

## 18. Golden parity results
The same immutable request passed through `evaluateForReplay` and `evaluateForLiveScanner` produces deep-equal traces and trace IDs. Tests also cover timeframe boundaries, indicator values, no warm-up, deterministic arbitration, risk blocks, capital caps and lifecycle transitions.

## 19. Shadow comparison results if implemented
`compareShadowDecision` is observation-only and returns MATCH/SEMANTIC_MISMATCH plus trace ID. It sends and executes nothing. No production shadow run was performed.

## 20. Legacy code remaining
Non-migrated evaluator branches; simulation engine fill/TP/BE/trailing; Prop replay's call to that simulation; old general arbitrator and professional risk/capital execution route. These are explicitly dual-owned, not certified parity.

## 21. Tests
See final response for exact commands/results. Golden domain, existing forex/gold/strategy, historical, research, risk/capital/execution/trade-management and scanner suites were run.

## 22. TypeScript baseline
Focused strict domain compilation passes without `any` in core. Application-wide baseline remains separately reported and settings were not weakened.

## 23. Open risks
Only four strategies migrated. Compatibility mapping currently canonicalizes migrated forex evaluation to its declared M15 primary timeframe; legacy H1 invocation semantics need an explicit separate definition or removal. Browser evaluator lacks an explicit symbol argument and retains its historic EURUSD default for non-gold strategy evaluation. Trade-management/risk/capital execution adoption remains incomplete. No connected provider or profitability certification was performed.

## 24. Exact recommendation for Phase 4
Finish semantic selection for active crypto strategies, then delete/bypass their browser branches and route scanner definitions through the same registry. Add symbol to the replay evaluator contract. Replace simulation TP/BE/trailing with canonical observation events and adapt the production lifecycle facade. Finally route professional risk/capital through canonical intents with golden account fixtures before any execution expansion.
