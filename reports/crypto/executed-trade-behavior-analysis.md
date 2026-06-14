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

## Executed Trade Behavior
The current implementation can derive filled/closed counts, TP1/TP2/SL/BE/profit-lock status, entry/SL/TP prices, lifecycle timestamps, and estimated R from execution rows. Full max positive/negative PnL before loss requires persisted price-path sampling or event snapshots; this report flags that as a missing enforcement-grade field.
