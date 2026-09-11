# Phase 5 — Final Convergence and Shadow Parity

**Status: PARTIAL (2026-09-10).** Pure-domain convergence advanced, but browser/production lifecycle and professional risk/capital adoption remain materially incomplete. No profitability, broker readiness, or connected-production shadow claim is made.

## 1. Phase 4 starting state
Four forex/metals strategies were canonical. Two scanner crypto strategies were RESEARCH/SHADOW and five differently named browser strategies remained legacy. Browser outcome lifecycle and professional risk/capital/orchestration remained separate.

## 2. Crypto semantic decisions
| Identity | Decision | Reason |
|---|---|---|
| `crypto.trend-pullback` | CANONICAL_RESEARCH | Existing scanner semantic frozen as `0.1.0-research-frozen`; never publishable by canonical status. |
| `crypto.reversal-exhaustion` | CANONICAL_RESEARCH | Existing scanner semantic frozen independently under its own ID. |
| `CryptoMicroScalper` | RESEARCH_ONLY_LEGACY | No matching scanner implementation. |
| `CryptoCompressionBreakout` | RESEARCH_ONLY_LEGACY | No matching scanner implementation. |
| `CryptoSwingContinuation` | RESEARCH_ONLY_LEGACY | Not silently equated to trend-pullback. |
| `CryptoReversalExhaustion` | RESEARCH_ONLY_LEGACY | Browser semantics differ from canonical research ID. |
| `CryptoMomentumBreakout` | RESEARCH_ONLY_LEGACY | No matching scanner implementation. |

## 3. Crypto fixture evidence
Immutable generated candle sequences drive both canonical crypto evaluators to LONG and SHORT candidates. Flat candles produce NO_TRADE. Replay and live facades receive the same closed multi-timeframe market view and produce deep-equal traces. These freeze semantics; they are not performance evidence.

## 4. Production strategy ownership
The four production forex/metals strategies remain the only `CANONICAL` definitions. The two crypto definitions are `RESEARCH_ONLY`. `PRODUCTION_CANONICAL_IDS` is derived from registry status, not UI labels.

## 5. Browser lifecycle migration
The canonical historical observation adapter remains available with conservative ambiguity and strict simulation provenance. `simulationEngine.ts` still calculates canonical-strategy TP/SL/BE/trailing outcomes independently; gate incomplete.

## 6. Production trade-management adoption
Explicit broker fill/protection/close observations map to canonical reducer events. The production orchestration modules are not all routed through that facade, so adoption is partial.

## 7. Risk adoption
Canonical decision traces use canonical risk intent. Existing professional/account-specific execution paths have not all been replaced; dual ownership remains.

## 8. Capital adoption
Canonical decision traces use canonical allocation intent. Existing production allocation paths have not all been replaced; dual ownership remains.

## 9. Arbitrator adoption
Every registry-driven canonical decision uses canonical arbitration. The general arbitrator remains for legacy/non-canonical flows and has not been fully fenced at every persistence boundary.

## 10. Backtest canonical-domain status
Four production evaluator branches enter the canonical domain with explicit symbols. Their lifecycle still enters the legacy simulation loop; therefore Backtest is not fully converged.

## 11. Prop Replay canonical-domain status
Prop Replay consumes the browser simulation engine. It inherits canonical evaluator routing but also the legacy lifecycle. Prop rules remain outside the canonical policy snapshot.

## 12. Shadow comparison results
Pure fixture comparisons return MATCH for replay/live canonical traces. No connected current-production shadow execution was possible in this environment.

## 13. Mismatch classifications
The harness supports EXPECTED_SEMANTIC_MIGRATION, BUG, ENVIRONMENTAL, INPUT_MISMATCH, and UNEXPLAINED. Missing classifications default to UNEXPLAINED. Fixture match: zero unexplained; deliberate mismatch test: one unexplained.

## 14. Positive candidate parity
LONG and SHORT evaluator-driven fixtures pass for both canonical crypto research definitions. Phase 3 suites retain production forex/metals trace equality, but exhaustive positive long/short coverage for all four production strategies remains incomplete.

## 15. Lifecycle parity
Equivalent simulated and broker-confirmed winner sequences reach ARCHIVED through the same reducer while retaining different provenance. Duplicate and invalid-order behavior is tested. Full loser, partial, and trailing observation-adapter matrices and runtime adoption remain incomplete.

## 16. Certification runner
`runCanonicalPeriod` applies one invocation contract to every declared research mode, orders decision times, produces traces/counts/reject-reason distributions, dataset/version provenance, and a stable run hash. Trade-result/R analytics await lifecycle migration.

## 17. Determinism evidence
Identical crypto datasets, account/risk/config snapshots, as-of values, and versions produce deep-equal decisions and identical `runHash` values.

## 18. Legacy routing protections
`assertLegacyRouteAllowed` rejects every production canonical ID. Registry status drives the protected list. Browser legacy names are allowed only because they are not production canonical identities.

## 19. Tests
The Phase 5 suite covers crypto LONG/SHORT/NO_TRADE, explicit symbol, multi-timeframe replay/live equality, registry status, deterministic period hashes, shadow mismatch accounting, lifecycle provenance, duplicate events, and invalid transitions. Exact commands/results are in the final response.

## 20. TypeScript status
Focused strict trading-domain compilation passes. The application-wide pre-existing baseline is measured separately; compiler settings were not weakened.

## 21. Connected MT5 verification status
OUTSTANDING. This Linux environment cannot prove the deployed Windows Desktop Bridge, authenticated MT5 terminal, broker symbol resolution, or real `copy_rates_range` response.

## 22. Remaining legacy/research code
Five browser crypto evaluators, FXMicroScalper, SessionORB, MacroYieldDifferential, browser trade lifecycle, general arbitration paths, and professional risk/capital orchestration remain.

## 23. Remaining dual ownership
Browser lifecycle versus reducer; production orchestration versus reducer; canonical versus professional risk; canonical versus production capital; canonical versus general arbitration for non-registry paths; and the two canonical-research crypto semantics versus their still-active legacy scanner entry functions.

## 24. Open risks
Research-only status is not yet enforced at every signal-publication boundary. Connected shadow evidence is absent. Browser candle lifecycle can disagree with conservative canonical ambiguity. Canonical runner does not yet own completed-trade/R outcomes.

## 25. Exact Phase 6 recommendation
Do not optimize. Complete a convergence-remediation phase first: route `simulationEngine.ts` canonical plans exclusively through the observation adapter/reducer; wire Prop Replay identically; adapt every live trade-management observation; replace production risk/capital calls with canonical intents; enforce registry lifecycle status before publication; route the two scanner research IDs through registry evaluation; add all production positive and complete lifecycle fixtures; then run execution-disabled connected shadow and require zero unexplained mismatches. Only then start strategy research/certification.
