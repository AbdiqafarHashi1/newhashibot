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

## Performance Truth Split
Signal Performance answers: “Was the trade idea good?” A signal can be WIN/LOSS/EXPIRED/OPEN regardless of whether Binance entered it.

Execution Performance answers: “Did the bot enter, protect, manage, and close it correctly?” Execution rows classify not_executed, entry_submitted, entry_filled, protected_native, protected_managed, closed_synced, skipped, stale_closed, manual_closed, and API/protection failures independently.

## UI Contract
`/admin/performance` now shows separate signal cards, execution cards, signal-vs-execution rows, and Capital Allocation / Strategy Hardness research cards. Tracked rows expose signal status, execution status, signal R, execution reason, and TP/SL lifecycle evidence when available.
