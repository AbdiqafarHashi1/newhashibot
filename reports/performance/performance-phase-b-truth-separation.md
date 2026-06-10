# Performance Phase B — Truth Separation

## 1. Current Performance page problem
The previous admin Performance page presented one combined `Signal Performance` view. Its cards, breakdowns, and tracked table were all calculated from the same signal analytics result set, so strategy outcomes, Binance execution attempts, unfilled orders, skipped executions, open signals, and filled positions were visually close enough to be mistaken for one performance truth.

That was dangerous because an open strategy signal could look like an open trade even when Binance never filled an entry, and a cancelled/expired limit entry could be interpreted as strategy performance instead of an execution miss.

## 2. Exact old data source
Before Phase B, `src/pages/admin/Performance.tsx` loaded:

- `signal_analytics_view` for the displayed rows and all performance cards/breakdowns.
- `strategy_configs` for configured strategy names, with required strategy fallbacks.
- `admin_reset_trading_history_batch` RPC only when the reset danger-zone action was manually invoked.

The page did not directly read `signals`, `execution_orders`, `signal_outcomes`, `signal_updates`, or `telegram_deliveries` for normal display. Those tables could influence the page only indirectly through `signal_analytics_view` or the reset RPC.

## 3. New Strategy Performance definition
Strategy Signal Performance now means signal/outcome truth only:

- Includes all qualified REAL DATA strategy signals that pass the current page filters.
- Does not depend on Binance fill status.
- Keeps the prior style of overall cards, strategy breakdown, symbol breakdown, timeframe breakdown, grade breakdown, and tracked signals.
- Uses `signal_analytics_view` for signal status, outcome category, R result, targets, stop, timestamps, and current signal state.
- Counts open signals as open signal ideas, not as Binance positions.
- Keeps expiries separate from wins/losses.

## 4. New Binance Execution Performance definition
Binance Testnet Execution Performance now means execution truth only:

- Reads from `execution_orders`.
- Counts eligible signals separately from execution attempts.
- Separates entry submitted, entry filled, entry timeout cancelled, skipped executions, and block reasons.
- Counts Binance bot win rate, PF, total R, TP1, TP2, and SL only from rows with filled entries.
- Shows missing/unsynced execution outcomes as pending instead of guessing when no usable execution result exists.

## 5. New Bot Health definition
Bot Health / Protection Performance now means safety and reliability truth:

- Reads `execution_orders` for protection status, bracket mode, native/managed flags, order IDs, fill/protection timestamps, stale cleanup status, and monitor row state.
- Reads `execution_settings` for monitor status, latest monitor result, synchronized Binance open positions/orders, stale rows cleaned, open position count, and latest sync time.
- Reads `execution_event_logs` for reliability counters such as orphan cleanup and monitor error evidence.
- Reports open filled Binance execution rows and whether each has SL, TP1, TP2, native verification, managed fallback, and safety status.

## 6. Which metrics changed
Changed metrics are now scoped by truth source:

- Strategy cards are explicitly labeled as `Strategy Signal Performance` and use only signal/outcome data.
- Binance bot win rate/PF/R moved into a separate execution section and ignore unfilled entries.
- Entry timeout cancellations are counted as execution misses/no-trade, not losses.
- Bot Health cards separately report monitor status, protection SLA, protected-native count, managed-fallback count, unprotected open positions, stale rows cleaned, monitor errors, and timeout/cleanup counters.

## 7. Which metrics are no longer mixed
The following are no longer treated as one metric family:

- Strategy wins/losses versus Binance trade wins/losses.
- Open strategy signals versus open Binance positions.
- Signal expiries versus filled Binance trade timeouts.
- Unfilled Binance limit entries versus Binance losses.
- Skipped/governor-blocked executions versus strategy quality.
- Protection failures versus strategy R/PF.

## 8. How unfilled limit orders are handled
An unfilled limit entry remains in Strategy Performance as a valid strategy signal. In Binance Execution Performance it is shown as:

- `ENTRY_TIMEOUT_CANCELLED`
- `no_trade`
- reason `limit_entry_not_filled`

It is excluded from Binance bot win rate, PF, total R, TP1 count, TP2 count, and SL count. In Bot Health it is not treated as an unprotected open trade because there is no filled Binance position to protect.

## 9. How skipped executions are handled
Skipped execution rows remain execution truth, not strategy truth. They are counted in Binance Execution Performance as skipped/block reasons, including governor, bot paused, duplicate, same-symbol, risk cap, max position, missing credentials, invalid symbol, and protection-unavailable buckets where the stored reason supports it.

Skipped executions do not affect Strategy Performance PF/R and do not create Bot Health safety issues unless a filled/open position exists.

## 10. How open signals differ from open Binance positions
An open signal means the strategy idea is still awaiting a signal outcome. It may have no Binance trade at all.

An open Binance position means execution filled an entry and the monitor/execution sync still sees an active filled execution row or synchronized Binance position. The tracked table now shows both `Signal Status` and `Execution Status`, and explicitly annotates `Signal open · execution not open` when a signal remains open but no filled Binance execution exists.

## 11. How current tables/cards were reorganized
The page is now organized into three clear sections:

1. `Strategy Signal Performance — Overall`, followed by strategy, symbol, timeframe, grade, expiry-cause, and tracked signal tables.
2. `Binance Testnet Execution Performance`, with execution-only cards and block reason table.
3. `Bot Health / Protection Performance`, with monitor/protection cards and an open-position safety table.

The final tracked table shows signal truth and execution truth side by side.

## 12. Files changed
- `src/pages/admin/Performance.tsx`
- `reports/performance/performance-phase-b-truth-separation.md`

## 13. Confirmation untouched areas
This Phase B change intentionally did not modify strategy logic, scanner logic, arbitrator code, Binance execution placement, TP/SL engine, monitor edge-function logic, Telegram sending, live trading controls, customer pages, or product pages. The work is limited to admin Performance page data separation and this report.
