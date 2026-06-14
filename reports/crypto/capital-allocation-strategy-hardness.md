> Research-mode report generated for HashiBot Phase X-A. This phase does not change live execution rules, scanner scoring, strategy entry logic, Telegram routing, Binance protection placement, Forex, or MT5.

## Scope
- Separate signal/paper-trade truth from Binance execution truth.
- Add research formulas and UI previews for future capital allocation.
- Keep enforcement disabled until at least 100 completed executed trades exist.

## Data Sources
- `signals` / `signal_analytics_view` for signal lifecycle and paper-trade R.
- `execution_orders` for Binance bot entry/protection/closure truth.
- `execution_event_logs` and `execution_settings` for monitor/protection health.
- `strategy_candidates`, scanner runs, intelligence feeds, and Telegram delivery tables are audit inputs when present.

## Current Decision
- READY TO CHANGE EXITS: NO — observe until 100 completed executed trades.
- READY FOR CAPITAL MANAGEMENT ENFORCEMENT: NO — research-only scoring is now visible.
- READY FOR OBSERVATION CONTINUATION: YES.

## Final Report
1. Performance truth split: implemented in UI and report.
2. Data readiness: mixed; enough for summaries, not enough for final exit enforcement.
3. 100 completed trades: checked dynamically in UI.
4. Symbol quality: scorecard preview added.
5. Strategy survival: matrix preview added.
6. TP1 vs TP2 truth: TP1→BE/SL and TP1→TP2 rates added.
7. Losing-trade max profit before reversal: requires MFE/MAE path persistence for final proof.
8. 10x profit-lock study: formulas and testable scoring functions added.
9. Best exit model per strategy: research-only until 100 closed executed trades.
10. Signal density: spam score and breakdowns available.
11. Correlation grouping: BTC Core, Majors, High-beta alts foundation added.
12. Opportunity ranking formula: MVP pure function added.
13. Customer experience: spam-score MVP added.
14. What should change next: persist per-trade MFE/MAE and fee-adjusted realized PnL snapshots.
15. What should NOT change yet: exits, scanner score, entries, Telegram routing, Binance protection, Forex, MT5, capital enforcement.
16. Files changed: UI, analytics helper, analytics tests, reports.
17. Tests run: recorded in final response.
18. Final decision: READY TO CHANGE EXITS: NO; READY FOR CAPITAL MANAGEMENT ENFORCEMENT: NO; READY FOR OBSERVATION CONTINUATION: YES.
