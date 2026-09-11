# Phase 4 — Full Trading-Brain Convergence

**Status: PARTIAL (2026-09-09).** This report does not claim profitability, certification, a live-terminal run, or full repository convergence.

## 1. Phase 3 starting status
Phase 3 made four forex/metals evaluators canonical, but browser lifecycle, professional risk/capital, crypto research strategies, and the general arbitrator remained separately owned.

## 2. Explicit symbol fix
`evaluateStrategySetup` now requires `symbol`; all simulation call sites pass the feed/asset symbol. Canonical dataset identity and candle records use that symbol. The EURUSD/gold-name fallback was removed.

## 3. Full strategy inventory
| Strategy | Runtime reality | Phase 4 status |
|---|---|---|
| forex.london-breakout | production canonical | CANONICAL |
| forex.new-york-continuation | production canonical | CANONICAL |
| forex.trend-pullback | production canonical | CANONICAL |
| gold.volatility-breakout | production canonical | CANONICAL |
| crypto.trend-pullback | scanner RESEARCH/SHADOW | DUAL/RESEARCH |
| crypto.reversal-exhaustion | scanner RESEARCH/SHADOW | DUAL/RESEARCH |
| CryptoMicroScalper | browser/operator configuration only | RESEARCH_ONLY legacy |
| CryptoCompressionBreakout | browser/operator configuration only | RESEARCH_ONLY legacy |
| CryptoSwingContinuation | browser evaluator; not identical to scanner trend-pullback | RESEARCH_ONLY legacy |
| CryptoMomentumBreakout | browser/operator configuration only | RESEARCH_ONLY legacy |
| FXMicroScalper, SessionORB | browser research | RESEARCH_ONLY legacy |
| MacroYieldDifferential | lacks immutable macro-event input | BLOCKED |

## 4. Crypto semantic audit
The five browser names are not five production scanner strategies. The scanner registry exposes only `crypto.trend-pullback` and `crypto.reversal-exhaustion`, explicitly as RESEARCH/SHADOW. Browser formulas and names do not provide a justified one-to-one semantic mapping. They were therefore not falsely promoted or merged.

## 5. Crypto migrations
None were promoted to production. This is the principal reason Phase 4 is PARTIAL. A semantic fixture/data approval is required before replacing the two research scanner evaluators or the five browser formulas.

## 6. Research-only strategy decisions
FXMicroScalper and SessionORB remain isolated browser research logic. MacroYieldDifferential remains BLOCKED. Canonical placement must not confer production eligibility.

## 7. Strategy requirement completeness
Requirements remain complete for the four production canonical strategies. Research crypto declarations remain split and incomplete; no fake defaults were added.

## 8. Legacy evaluator removal/isolation
The four production IDs still route before legacy branches. Explicit symbol ownership was fixed. Browser crypto and research branches remain legacy and are documented, not presented as production canonical.

## 9. Canonical simulation lifecycle
A pure historical observation adapter now emits canonical management events and enforces `HISTORICAL_SIMULATION` provenance. Existing browser metric simulation has not yet been fully rewired to the reducer.

## 10. Intrabar ambiguity model
`CONSERVATIVE_STOP_FIRST` is the default when one OHLC bar touches stop and target without ordering evidence. `MARK_AMBIGUOUS`, `LOWER_TIMEFRAME_RESOLUTION`, and `TICK_RESOLUTION` explicitly withhold an outcome when their required evidence is unavailable.

## 11. Partial TP/BE/trailing convergence
The canonical reducer has TP1, breakeven, trailing, TP2, stop, close, and archive states. Browser simulation still contains policy calculations, so convergence is incomplete.

## 12. Live trade-management facade
Broker observation mapping emits `BROKER_FILL`, `PROTECTION_CONFIRMED`, or `CLOSE_CONFIRMED` only from explicit broker observations. It does not infer confirmation from a requested action. Production orchestration is not yet fully routed through this facade.

## 13. Risk convergence
The canonical risk intent remains deterministic, but all professional/account-specific live call sites have not been migrated. Dual ownership remains.

## 14. Capital convergence
The canonical allocator remains available, but production persistence/orchestration still includes separate allocation decisions. Dual ownership remains.

## 15. Arbitrator convergence
Canonical strategies use the canonical arbitrator in the decision pipeline. The general arbitrator remains active for non-migrated flows.

## 16. Positive candidate golden parity
Phase 3 parity exists for canonical trace inputs, but this phase did not establish evaluator-driven positive long/short fixtures for every strategy. Gate not met.

## 17. Full lifecycle golden parity
Deterministic simulation provenance, conservative ambiguous-bar behavior, and broker-observation mapping are tested. Full replay/live winner/loser lifecycle parity is not yet proven.

## 18. Multi-timeframe parity
Phase 3 as-of filtering remains canonical. Crypto multi-timeframe positive-candidate parity remains unproved.

## 19. Shadow harness
A pure, side-effect-free recursive comparator reports `MATCH` or field-level `MISMATCH`. No production shadow run was performed.

## 20. Certification runner foundation
`runCanonicalDecision` accepts a research mode, explicit symbol, canonical datasets, strategy/config, account/risk snapshot, session, and as-of time. It validates instrument ownership and returns one standardized canonical trace. It performs no optimization.

## 21. Simulation/live provenance
The domain distinguishes HISTORICAL_SIMULATION, SHADOW, PAPER, DEMO_BROKER, and LIVE_BROKER. Historical observations cannot emit broker confirmations.

## 22. Tests run
Results are recorded after execution in the commit/PR summary. The focused Phase 4 suite covers conservative ambiguity, simulation provenance, broker mapping, and shadow mismatch paths.

## 23. TypeScript status
Focused strict compilation is required to pass. Application-wide typecheck remains a separately reported legacy baseline; settings were not weakened.

## 24. Remaining dual ownership
Browser crypto strategy formulas; research scanner crypto formulas; browser TP/BE/trailing/outcome simulation; production risk and capital paths; production trade-management orchestration; and the general arbitrator.

## 25. Remaining legacy paths
`src/pages/admin/backtest/evaluators.ts` retains non-production research branches, and `simulationEngine.ts` retains outcome/lifecycle calculations. `_shared/professional-strategies.ts` owns the two research crypto scanner strategies.

## 26. Open risks
No connected production shadow evidence exists. Crypto semantic identities are ambiguous. Candle-only execution remains unable to establish intrabar ordering. Full lifecycle and risk/capital migration could change operational behavior and needs staged shadow evidence.

## 27. Exact recommendation for Phase 5
Do not begin profitability optimization. First run a narrowly scoped convergence completion: approve immutable positive fixtures for the two scanner crypto research strategies, either retire or explicitly freeze the five browser-only crypto names, route browser and production lifecycle through the reducer, and shadow canonical risk/capital/arbitration against production with execution disabled. Only after zero unexplained mismatches should certification research begin.
