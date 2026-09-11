# Phase 6 — Final Convergence Remediation

**Status: PARTIAL (2026-09-10).** Canonical result ownership and production-boundary guards are now concrete, but runtime lifecycle/risk/capital adoption remains incomplete. No strategy tuning or execution expansion occurred.

## 1. Phase 5 starting status
Four production forex/metals evaluators were canonical; two crypto definitions were canonical research-only. Browser/Prop lifecycle, live orchestration, professional risk/capital, and some arbitration/publication routes remained separately owned.

## 2. Browser lifecycle migration
Not complete. `simulationEngine.ts` still calculates lifecycle and R for canonical strategy output. New canonical results can replace it, but this phase does not falsely claim that wiring exists.

## 3. Prop Replay lifecycle migration
Not complete. Prop Replay inherits the browser simulator. It retains canonical data/evaluator routing but not exclusive canonical result ownership.

## 4. Canonical completed-trade result
`CanonicalCompletedTradeResult` records strategy/config/symbol/market/timeframe/datasets, intent and actual fill, exits, close, gross/net R and PnL, explicit costs, ambiguity, provenance, lifecycle IDs, and run reference.

## 5. Canonical R outcome
`completeTradeResult` uses actual fill, not intended entry, requires exit fractions to total one, and computes weighted realized R. The fixture proves half at +1R and half at breakeven equals +0.5R gross.

## 6. Execution-cost interface
Spread, slippage, commission, financing, latency and currency are separate `ExecutionCosts`. Costs reduce net PnL/R without entering strategy evaluation.

## 7. Production trade-management adoption
The existing broker-confirmation facade remains. Full production observation-path migration was not completed; requests remain conceptually separate from confirmations.

## 8. Protection/recovery boundary
Existing recovery/protection was not weakened. Canonical protection state still requires confirmation evidence; no repair request is translated into `PROTECTION_CONFIRMED`.

## 9. Risk convergence
Canonical traces use canonical risk, but professional/account-specific runtime paths remain active. Full convergence is outstanding.

## 10. Capital convergence
Canonical traces use canonical allocation, but production allocation paths remain active. Full convergence is outstanding.

## 11. Arbitrator fencing
Registry canonical evaluation uses canonical arbitration and production IDs have a legacy-route guard. Every downstream general-arbitrator route is not yet fenced.

## 12. Research publication/execution gates
`assertProductionBoundary` blocks `RESEARCH_ONLY` definitions at candidate persistence, signal truth, Telegram, execution planning, customer routing and broker submission. Tests block both frozen crypto research IDs. Runtime boundary call-site adoption remains incomplete.

## 13. Crypto registry routing
The registry owns frozen research definitions. Legacy scanner function call sites remain, so evaluator ownership is still dual.

## 14. Forex/metals positive candidate parity
Phase 3 parity remains; the requested full LONG/SHORT matrix for every strategy was not safely completed. No candidate was fabricated and no parameters were tuned.

## 15. Full lifecycle parity
Phase 5 tests cover an archived winner, provenance, duplicate and invalid order. The exhaustive loser/partial/trailing/protection matrix remains incomplete.

## 16. Intrabar ambiguity model
Phase 4 conservative stop-first, mark-ambiguous, lower-timeframe-required and tick-required policies remain unchanged. Canonical completed results can retain ambiguity counters and resolution methods. Lower-timeframe resolver and runner accumulation remain outstanding.

## 17. Certification runner completed-trade support
Completed-trade construction exists as a canonical pure function, but `runCanonicalPeriod` still does not iterate plans through future observations. This gate remains incomplete.

## 18. Determinism/run hash
Decision-period hashes remain deterministic. Completed results retain a run reference. Execution/capital/trade-policy versions are not all incorporated into the period hash yet.

## 19. Shadow proof
Fixture comparison still has zero unexplained mismatches for identical canonical inputs. No connected production shadow was run.

## 20. Connected MT5 workflow/result
**OUTSTANDING — not run in this Linux environment.** Operator procedure:
1. Deploy the Phase 2 migration/functions and start Desktop Bridge on Windows.
2. Log MT5 into the intended account and record account, broker and server.
3. In Research Data Manager select MT5/account; sync EURUSD M5/M15/H1 and XAUUSD M5/M15/H1/H4 over a fixed UTC range.
4. Record resolved source symbol, requested/returned coverage, count, spread/tick/real-volume presence, response duration, quality, dataset ID.
5. Run canonical research once and record trace/run hash.
6. Stop Desktop Bridge; rerun the exact range and prove IndexedDB reuse.
7. Extend `to` beyond coverage and verify explicit bridge-offline missing-range failure.
8. Save the report and run execution-disabled shadow; do not publish or submit.

## 21. Prop Clearance regression
The stale copy assertions now match the current `Upload Real CSV(s)` UI and the stronger canonical/CSV provenance and synthetic-substitution guards remain. The test passes.

## 22. Tests
Exact commands and results are reported in the final response. Phase 6 covers weighted R, actual-fill ownership, costs, invalid fractions and all six research-only production boundaries.

## 23. TypeScript status
Focused domain compilation is required to pass. App-wide legacy baseline is reported separately; settings were not weakened.

## 24. Remaining dual ownership
Browser/Prop lifecycle, live lifecycle orchestration, professional risk, production capital, downstream general arbitration, scanner crypto functions, and publication boundary call sites.

## 25. Remaining legacy code
`simulationEngine.ts`, legacy research evaluators, professional risk/capital engines, general arbitrator paths, and production trade-management modules remain active.

## 26. Open risks
A guard not invoked at a runtime boundary cannot protect it. Canonical results are not yet the browser's metric source. No connected broker/shadow evidence exists. Full strategy/lifecycle matrices remain incomplete.

## 27. Exact recommendation for Phase 7
Do not certify profitability. Perform an integration-only phase: replace the browser canonical branch with a canonical replay executor/result; make Prop use it; adapt broker truth into reducer events; invoke production status guards at every six named boundary; route scanner crypto through registry; migrate risk/capital call sites; complete all positive/lifecycle fixtures; extend run hashes; then run connected MT5 and execution-disabled shadow verification.
