# HASHIBOT B6.4 — Binance Futures Algo TP/SL ID Fix

Date: 2026-06-08

## 1. Why SL/TP were not appearing

The execution flow attempted normal futures order behavior for conditional `STOP_MARKET` and `TAKE_PROFIT_MARKET` protection, then mixed normal order IDs and algo IDs in storage/sync. Binance USD-M Futures now exposes TP/SL conditional orders through the Algo Order service. A native TP/SL placement must therefore use `POST /fapi/v1/algoOrder` with `algoType=CONDITIONAL`.

Official Binance references used:

- New Algo Order: https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order
- Query Algo Order: https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Query-Algo-Order
- Current All Algo Open Orders: https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Current-All-Algo-Open-Orders

## 2. Why `/fapi/v1/order` returned “Order does not exist”

`/fapi/v1/order` is the normal order endpoint and is still correct for entry orders. Conditional TP/SL orders created by `/fapi/v1/algoOrder` return `algoId` and `clientAlgoId`. Querying those algo IDs through `/fapi/v1/order` can produce `Order does not exist` because they are not normal entry/order IDs.

## 3. Exact algo endpoint used

Native protection now uses:

- `POST /fapi/v1/algoOrder`
- `algoType = CONDITIONAL`
- `type = STOP_MARKET` for SL
- `type = TAKE_PROFIT_MARKET` for TP1 and TP2
- `triggerPrice` for the stop/target trigger
- `reduceOnly = true`
- `workingType = MARK_PRICE`

Entry orders remain on:

- `POST /fapi/v1/order`

## 4. Fields saved for algo IDs

B6.4 adds and saves separate conditional algo identifiers:

- `sl_algo_id`
- `tp1_algo_id`
- `tp2_algo_id`
- `sl_client_algo_id`
- `tp1_client_algo_id`
- `tp2_client_algo_id`
- `native_protection_verified`
- `managed_fallback_active`

Legacy `sl_order_id` / `tp1_order_id` / `tp2_order_id` and `binance_*_order_id` fields are also populated with the algo IDs for UI/backward compatibility, but sync code treats them as algo IDs when protection mode is exchange-native.

## 5. Sync behavior for normal orders vs algo orders

The sync/monitor contract is now split by ID type:

- Entry order: `GET /fapi/v1/order` using `entry_order_id` / `binance_entry_order_id`.
- SL/TP conditional orders: `GET /fapi/v1/algoOrder` using `sl_algo_id`, `tp1_algo_id`, and `tp2_algo_id`.
- Open native protection visibility: `GET /fapi/v1/openAlgoOrders` with `algoType=CONDITIONAL`.
- Algo IDs are no longer intentionally queried through `/fapi/v1/order`.

## 6. Native protection verification result

`protected_native` is only written when all three conditional algo orders are present and verified:

- SL algo order exists
- TP1 algo order exists
- TP2 algo order exists

Verification checks the exchange-native open algo order set and matching side/type/trigger fields. If verification fails, the order is not marked `protected_native`.

## 7. Managed fallback behavior if native fails

If native algo placement or verification fails and intended SL/TP quantities are valid, the execution row is updated to:

- `bracket_mode = managed_exit_fallback`
- `protection_status = protected_managed`
- `native_protection_verified = false`
- `managed_fallback_active = true`
- `latest_protection_error = <exact Binance or verification failure>`

The monitor then uses mark price and closes via reduce-only market orders when TP1/TP2/SL/time-stop levels are hit.

## 8. Manual test steps

1. Confirm environment remains testnet only (`EXECUTION_MODE=testnet`, `TESTNET_ENABLED=true`, `LIVE_TRADING_ENABLED=false`).
2. Select one valid crypto signal in Admin → Execution.
3. Run selected Binance USD-M testnet execution.
4. Confirm entry `orderId` is stored in `entry_order_id` / `binance_entry_order_id`.
5. Confirm `sl_algo_id`, `tp1_algo_id`, and `tp2_algo_id` are populated.
6. Confirm Admin UI shows `protected_native` only if `native_protection_verified = true`.
7. If native algo placement fails, confirm Admin UI shows `managed_fallback_active = yes` and the exact latest protection error.
8. Run sync/monitor and confirm it queries entry through `/fapi/v1/order` and TP/SL through `/fapi/v1/algoOrder`.

## 9. Confirmation scanner/arbitrator unchanged

No strategy, scanner, arbitrator, signal-generation, forex/MT5, or TP/SL target calculation logic was changed. B6.4 only changes Binance USD-M testnet execution/protection transport, ID storage, sync, monitor, and UI display.

## 10. Confirmation live trading remains impossible

The existing live-trading impossibility guards remain in place. Entry and managed fallback orders continue to assert testnet execution and abort if live trading is enabled.
