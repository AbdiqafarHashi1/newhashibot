# Focused Canonical Runtime Integration Fix

**Integration status: PARTIAL (2026-09-10).** The active single-strategy Backtest path now invokes the shared replay executor for four canonical production strategy names. Multi-asset/Prop and production scanner ownership remain incomplete.

## 1. Starting dual ownership
Phase 6 listed browser/Prop lifecycle, production orchestration, risk, capital, general arbitration, crypto scanner functions, production-boundary call sites and browser R metrics as active dual owners.

## 2. Backtest lifecycle old owner → new owner
| OLD OWNER | NEW OWNER | PRODUCTION CALL SITES CHANGED | LEGACY STILL REACHABLE FOR PRODUCTION? | TEST PROOF |
|---|---|---|---|---|
| `simulationEngine.ts` lifecycle | `runCanonicalReplay` | `runSingleStrategyEngine` canonical branch switched | NO for single-strategy; YES for multi-asset/Prop | runtime-source assertion plus executor fixtures |

The executor consumes a canonical plan and historical observations, emits canonical events, reduces canonical state, and delegates result construction. `runSingleStrategyEngine` now branches canonical production names into it and never assigns those trades to `inTrade`. Multi-asset engines still use the old lifecycle, so overall ownership remains incomplete.

## 3. Backtest metric/R old owner → new owner
| OLD OWNER | NEW OWNER | PRODUCTION CALL SITES CHANGED | LEGACY STILL REACHABLE FOR PRODUCTION? | TEST PROOF |
|---|---|---|---|---|
| browser per-trade calculations | `completeTradeResult` | single-strategy canonical branch reads `result.netR/netPnl/closeReason` | NO for single-strategy; YES for multi-asset/Prop | runtime-source and result fixtures |

## 4. Prop Replay old owner → new owner
| OLD OWNER | NEW OWNER | PRODUCTION CALL SITES CHANGED | LEGACY STILL REACHABLE FOR PRODUCTION? | TEST PROOF |
| browser simulation inherited by Prop | shared `runCanonicalReplay` | no UI call-site switch | YES | identical Backtest/Prop-equivalent calls deep-equal |

## 5. Production trade-management old owner → new owner
| OLD OWNER | NEW OWNER | PRODUCTION CALL SITES CHANGED | LEGACY STILL REACHABLE FOR PRODUCTION? | TEST PROOF |
| production lifecycle modules | canonical reducer/broker facade | none in this change | YES | existing broker facade/reducer tests |

## 6. Protection/recovery integration
Requests remain distinct from confirmation in domain contracts. Recovery production call sites were not migrated. Existing repair behavior was not weakened.

## 7. Risk old owner → new owner
| OLD OWNER | NEW OWNER | PRODUCTION CALL SITES CHANGED | LEGACY STILL REACHABLE FOR PRODUCTION? | TEST PROOF |
| professional risk engine | canonical risk intent | none | YES | canonical and professional suites pass separately |

## 8. Capital old owner → new owner
| OLD OWNER | NEW OWNER | PRODUCTION CALL SITES CHANGED | LEGACY STILL REACHABLE FOR PRODUCTION? | TEST PROOF |
| professional capital allocation | canonical capital intent | none | YES | canonical and professional suites pass separately |

## 9. Arbitrator old owner → new owner
| OLD OWNER | NEW OWNER | PRODUCTION CALL SITES CHANGED | LEGACY STILL REACHABLE FOR PRODUCTION? | TEST PROOF |
| general arbitrator | canonical arbitrator | none | YES | existing legacy-route guard is domain-only |

## 10. Crypto research scanner routing
The scanner still registers the two legacy functions directly. They remain non-publishable RESEARCH/SHADOW, but semantic call-site ownership was not changed.

## 11. Production-boundary call-site adoption
Phase 6 gate exists and blocks every boundary in isolation. The market scanner's actual signal/Telegram/execution call sites were not wired to it in this change. Existing `publishable` filtering blocks these two research definitions before arbitration, but this is a separate legacy guard.

## 12. Canonical period-runner integration
`runCanonicalReplay` is now the common trade executor primitive. `runCanonicalPeriod` has not yet been upgraded to invoke it automatically.

## 13. Completed-trade result ownership
The replay executor delegates final weighted R/cost/provenance output to `completeTradeResult`; it does not recalculate result math.

## 14. Positive candidate fixtures
Phase 5 crypto research fixtures remain. The complete four-strategy production positive matrix is still absent.

## 15. Lifecycle matrix
New fixtures prove partial TP winner, conservative ambiguous stop, unresolved MARK_AMBIGUOUS, archive, and non-simulation rejection. Full requested matrix remains incomplete.

## 16. Legacy isolation inventory
| LEGACY FILE | ACTIVE FOR WHICH STRATEGIES | PRODUCTION CANONICAL REACHABLE? |
|---|---|---|
| `src/pages/admin/backtest/simulationEngine.ts` | legacy research plus multi-asset/Prop | NO for single canonical; YES for multi-asset canonical |
| `src/pages/admin/backtest/evaluators.ts` legacy branches | browser research strategies | canonical evaluator branches bypass formulas, lifecycle remains reachable |
| `_shared/professional-risk-engine.ts` | production execution planning | YES |
| `_shared/professional-capital-allocation.ts` | production execution planning | YES |
| market-scanner general arbitrator | scanner candidates | YES |
| `_shared/professional-strategies.ts` crypto research functions | two research/shadow IDs | NO production publishability, YES semantic evaluation |

## 17. Determinism
Identical executor input returns deep-equal state, events, result, R, costs, ambiguity, and provenance.

## 18. Test results
Exact commands and results appear in the final response.

## 19. TypeScript status
Focused strict compilation passes. Application-wide baseline is reported separately; settings were not weakened.

## 20. Connected MT5 status
OUTSTANDING. No Windows terminal was available, and no connected evidence is fabricated.

## 21. Remaining dual ownership
Seven material groups remain: browser lifecycle/R, Prop inheritance, live lifecycle/recovery, professional risk, production capital, general arbitration, and scanner crypto/call-site gates.

## 22. Remaining blockers before Prop Engine
Wire the executor into Backtest and Prop; migrate production broker observation handling; adopt canonical risk/capital and arbitration at actual scanner execution paths; route research crypto through registry; invoke boundary gates at actual persistence/publication/execution sites; complete production candidate and lifecycle matrices; make period runner execute trades. Do not begin Prop Engine work before those are complete.
