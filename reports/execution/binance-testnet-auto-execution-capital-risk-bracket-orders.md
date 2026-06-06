# Binance Testnet Auto Execution, Capital/Risk/Leverage, and Bracket Orders

Date: 2026-06-05

## 1. Why manual execution worked but auto did not

Manual execution worked because the admin page called the `binance-testnet-execution` Edge Function directly with `manual: true`. Auto execution depended on scanner-created signals and was gated after Telegram delivery. The scanner already called the execution function only for just-created signals after Telegram succeeded, but the execution function did not yet have an explicit `auto_execute_testnet` DB setting, so automatic enablement was not visible or independently controllable from the admin execution settings.

## 2. Why entry submitted but SL/TP failed

The entry order used `POST /fapi/v1/order` with `type=LIMIT`, which is supported. SL/TP used conditional futures order types (`STOP_MARKET` and `TAKE_PROFIT_MARKET`) against the regular `POST /fapi/v1/order` endpoint. Binance Demo returned: `Order type not supported for this endpoint. Please use the Algo order API endpoints instead.` That means the entry could be accepted while the conditional reduce-only exits were rejected.

## 3. Exact Binance endpoint/order-type fix

The connector now submits exit protection as reduce-only conditional orders. It first tries regular `POST /fapi/v1/order` for compatibility, and if Binance returns the Algo endpoint error it retries the same STOP/TAKE_PROFIT payload against signed `POST /fapi/v1/algoOrder` on the fixed testnet base URL `https://demo-fapi.binance.com`.

Entry remains a signed `POST /fapi/v1/order` `LIMIT` order according to the current design.

## 4. Exchange-native bracket orders or managed fallback

The system records one of three bracket modes:

- `exchange_native`: SL, TP1, and TP2 were accepted by Binance as native reduce-only conditional orders.
- `managed_exit_fallback`: Binance rejected or blocked exchange-native conditional orders; HashiBot stores intended SL/TP levels and sync/monitor can close with reduce-only market orders when mark price reaches SL/TP.
- `failed`: Entry or protection failed in a way that should not be represented as protected.

The system does not claim native SL/TP orders exist when only managed fallback is active.

## 5. Exact auto-execution gates

Auto execution requires all of the following:

1. `EXECUTION_MODE=testnet`.
2. `TESTNET_ENABLED=true`.
3. `LIVE_TRADING_ENABLED=false`.
4. `execution_settings.execution_mode='testnet'`.
5. `execution_settings.testnet_enabled=true`.
6. `execution_settings.kill_switch_enabled=false`.
7. `execution_settings.auto_execute_testnet=true`.
8. Signal is new/not historical relative to `testnet_enabled_at`.
9. Signal is crypto.
10. Signal source is scanner for automatic calls.
11. Signal has no existing Binance testnet execution.
12. No active execution exists for the same symbol when `one_active_execution_per_symbol=true`.
13. Open active executions are below `max_open_testnet_positions`.
14. Sizing is valid and all price levels exist.

## 6. Capital source used before

Before this change, the connector queried `/fapi/v2/balance`, selected the `USDT` row, and used `availableBalance` or `balance`. That meant sizing was effectively based on available USDT only.

## 7. Why bot used around 4950 while Binance wallet showed around 10600

The previous logic used available USDT only. Binance USD-M Demo can show a larger total margin balance because total margin may include USDT, USDC, and other collateral valuation such as BTC. Therefore the connector saw roughly the USDT available amount (~4950) while the Binance UI showed total margin balance (~10600).

## 8. How USDT + USDC + BTC/total margin balance is handled now

The connector now records and displays:

- `raw_total_margin_balance`
- `raw_total_wallet_balance`
- `raw_available_usdt`
- `raw_available_usdc`
- `selected_capital_used`
- `max_capital_cap_applied`

Capital basis options:

- `available_usdt`
- `available_usdc_plus_usdt`
- `total_margin_balance`
- `total_wallet_balance`
- `manual_override`

When `total_margin_balance` is selected, Binance account-level `totalMarginBalance` is used. This is the intended way to include the full USD-M margin balance that Binance reports, including collateral value represented by the futures account endpoint.

## 9. Recommended capital_basis for testnet

Recommended default remains `available_usdt` for conservative safety. For full Binance Demo portfolio testing, use `total_margin_balance`, optionally with `max_capital_used_usdt` as a cap.

## 10. Why ETH used 2x

The previous code selected leverage from signal guidance first (`suggested_leverage_max` or `suggested_leverage_min`) and then capped it by `signal.leverage_cap` and the hard cap. If an ETH signal carried 2x guidance or a 2x signal cap, the connector honored that value instead of a grade fallback.

## 11. New leverage rules

- A grade default: 3x.
- A+ grade default: 5x.
- Valid signal guidance is used only when it is between 1x and the configured maximum.
- Hard cap: 7x.
- Leverage source is logged as `signal_guidance`, `grade_default`, `admin_setting`, or `capped_to_max`.
- Leverage controls margin requirement only; it does not determine risk amount.

## 12. New risk sizing rules

- A signal risk: 0.5% by default.
- A+ signal risk: 0.75% by default.
- `max_testnet_risk_pct` defaults to 1.0 and risk is never allowed above 1% in this phase.
- Formula:
  - `risk_amount = capital_used * risk_pct`
  - `stop_distance = abs(entry - stop_loss)`
  - `raw_quantity = risk_amount / stop_distance`
  - `notional = quantity * entry`
- Quantity is then adjusted for Binance step size, precision, min quantity, min notional, leverage margin capacity, and configured capital cap.

## 13. Files changed

- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/migrations/20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`
- `src/pages/admin/Execution.tsx`
- `src/lib/types.ts`
- `scripts/execution/binance-testnet-connector-selftest.mjs`
- `reports/execution/binance-testnet-auto-execution-capital-risk-bracket-orders.md`

## 14. SQL migration added

Added migration `20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`. It adds auto-execution, capital basis, risk, leverage settings, bracket/protection fields, capital snapshots, risk/notional fields, leverage source, and skip reason visibility.

## 15. UI changes

Admin → MT5/Execution now shows:

- Auto-execute new scanner signals ON/OFF.
- Capital basis dropdown.
- Selected capital used.
- Total margin balance.
- Total wallet balance.
- Available USDT.
- Available USDC.
- Risk A and A+.
- Leverage A and A+.
- Max leverage.
- Max open positions and one-active-per-symbol status.
- Bracket mode.
- Protection status.
- Entry/SL/TP order IDs.
- Latest auto skip reason.
- Latest exchange error.
- Sync actions and results.

## 16. Manual test steps

1. Run SQL migration 041 after migration 040.
2. Deploy `binance-testnet-execution`.
3. Refresh Admin → MT5/Execution.
4. Confirm `auto_execute_testnet` is OFF.
5. Set execution mode/testnet settings as needed.
6. Click Test Binance Connection.
7. Dry-run selected signal.
8. Confirm capital, risk, leverage, notional, and quantity.
9. Execute selected signal manually.
10. Confirm entry appears in Binance Demo.
11. Sync after fill and confirm protection status.

## 17. Auto-execution test steps

1. Confirm Telegram signal delivery is working.
2. Keep `LIVE_TRADING_ENABLED=false`.
3. Set `EXECUTION_MODE=testnet` and `TESTNET_ENABLED=true`.
4. Set DB `execution_mode='testnet'`, `testnet_enabled=true`, `kill_switch_enabled=false`.
5. Turn `auto_execute_testnet=true`.
6. Wait for a new scanner-created crypto signal.
7. Confirm execution order is created only after Telegram sends successfully.
8. Confirm Telegram execution update starts with `BINANCE TESTNET — NOT LIVE`.

## 18. Sync test steps

1. Open an execution with `entry_order_id`.
2. Click Sync.
3. Confirm entry status changes from `entry_submitted` to `entry_filled` after Binance fill.
4. Confirm SL/TP statuses update when exchange-native orders exist.
5. If fallback mode is active, confirm mark-price checks trigger reduce-only market closes at TP/SL.
6. Confirm `execution_event_logs` records sync results and errors.

## 19. Confirmation live trading remains impossible

Live trading remains blocked by env guards, DB guards, fixed exchange value `binance_usdm_testnet`, fixed testnet base URL, and the `live_trading_enabled=false` database check. No live Binance base URL is allowed.

## 20. Confirmation forex/MT5 strategy logic untouched

No forex strategy, MT5 bridge, or MT5 provider execution logic was changed. The admin page name remains MT5/Execution, but this work only extends Binance USD-M Testnet execution tracking.

## 21. Confirmation scanner/arbitrator strategy logic untouched

Scanner strategy scoring, arbitrator selection, and trading strategy logic were not changed. Scanner integration remains limited to calling the testnet execution function after a new signal is created and Telegram sends successfully.
