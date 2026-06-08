# HASHIBOT B6 — Binance USD-M Testnet Real Futures Bot Audit and Rebuild

Date: 2026-06-08
Scope: Binance USD-M Futures **testnet/demo only** execution, protection, monitoring, reset durability, and Admin Execution visibility.

## 1. Full current-state audit

### Current scanner/strategy state
- Scanner, arbitrator, and strategy selection logic were intentionally left unchanged.
- Forex/MT5 strategy logic was intentionally left untouched.
- Live trading remains blocked by environment/database guards and by the fixed Binance demo base URL guard.

### Current Binance request paths after audit/rebuild
1. **Entry endpoint:** `POST /fapi/v1/order`.
2. **Entry order type:** `LIMIT`, `timeInForce=GTC`, explicit `quantity`, explicit `price`.
3. **SL endpoint primary:** `POST /fapi/v1/order`.
4. **SL endpoint fallback:** `POST /fapi/v1/algoOrder` only when Binance rejects normal order placement as unsupported/algo-only.
5. **SL order type:** `STOP_MARKET`.
6. **TP1 endpoint primary:** `POST /fapi/v1/order`.
7. **TP1 endpoint fallback:** `POST /fapi/v1/algoOrder` only for Binance demo/algo endpoint rejection.
8. **TP1 order type:** `TAKE_PROFIT_MARKET`.
9. **TP2 endpoint primary:** `POST /fapi/v1/order`.
10. **TP2 endpoint fallback:** `POST /fapi/v1/algoOrder` only for Binance demo/algo endpoint rejection.
11. **TP2 order type:** `TAKE_PROFIT_MARKET`.

### Native protection params now required/sent
- `reduceOnly=true` for SL/TP1/TP2.
- `closePosition` is not used for TP1/TP2 partial exits and is not required for SL because explicit quantity is used.
- `stopPrice` is sent for SL/TP1/TP2.
- `price` is not sent for market conditional exits.
- `quantity` is explicit and split as TP1 50% / TP2 remaining 50%.
- `timeInForce` is not sent for `STOP_MARKET` / `TAKE_PROFIT_MARKET`; entry still uses `GTC`.
- `workingType=MARK_PRICE` is sent for SL/TP1/TP2.
- `positionSide` is not sent, keeping one-way mode compatibility. Hedge mode mismatch remains surfaced as a Binance rejection instead of hidden.

## 2. Whether Binance Futures is the problem

Binance Futures itself is not assumed broken. Binance Demo supports conditional orders in the UI, but API success must be verified differently from UI intent. The bot problem was implementation-level: protection could be recorded or assumed without proving SL/TP1/TP2 are present in Binance open orders, and fallback could look protected even when only intended levels existed.

## 3. Why TP/SL did not reliably reach Binance Testnet

Root causes found and addressed:

1. Protection could be submitted only when the entry response returned `FILLED`; otherwise protection depended on later sync/monitor paths.
2. Existing native verification only checked a narrow `openOrders` ID set and did not robustly include Binance demo algo open-order responses.
3. Verification did not fully validate side/type/reduce-only/stop price/quantity semantics.
4. Native fallback could become managed without clearly proving the monitor was the real protection mechanism.
5. The monitor could sync status and managed exits, but open-position rows did not have explicit time-stop/last-monitor-action visibility.
6. Partial TP1 native lifecycle needed stronger BE handling/fallback semantics.

## 4. Exact Binance endpoint/order-type issue

The API equivalent of the Binance Demo conditional panel is **not** a fake DB bracket row. It is either:

- normal signed USD-M order endpoint `/fapi/v1/order` with:
  - `type=STOP_MARKET` for SL;
  - `type=TAKE_PROFIT_MARKET` for TP1/TP2;
  - `reduceOnly=true`;
  - explicit `quantity`;
  - `stopPrice`;
  - `workingType=MARK_PRICE`; or
- when Binance Demo routes/requires algo conditional APIs, signed `/fapi/v1/algoOrder` with equivalent fields.

The rebuild records both the payload and endpoint used and then verifies the placed IDs against regular open orders plus algo open orders.

## 5. Native protection implementation details

- Native conditional payload construction now forbids `price`, `timeInForce`, and TP partial `closePosition` semantics at the pure helper level.
- SL/TP1/TP2 are placed as explicit reduce-only close-side conditional market exits.
- Open-order verification confirms order ID presence and validates the expected order type, side, stop price, quantity, and reduce-only state when Binance returns those fields.
- Native mode is marked protected only after verification succeeds.
- Native protection records real Binance IDs for SL/TP1/TP2.

## 6. Managed fallback implementation details

When native orders fail or cannot be verified:

- `bracket_mode=managed_exit_fallback`.
- `protection_status=protected_managed` only when the intended SL/TP levels and split quantities are stored and monitor fallback can act.
- The monitor watches mark price and closes by reduce-only market orders for TP1, TP2, SL/BE, and timeout.
- Admin/Telegram/event logs show managed fallback explicitly rather than pretending exchange-native protection exists.

## 7. Exact lifecycle implemented

Target lifecycle supported by schema/helpers/monitor:

`signal_created → execution_planned → entry_submitted → entry_filled → protection_submitted → protected_native/protected_managed → tp1_hit → sl_moved_to_be → closed_tp/closed_sl/closed_timeout → closed_synced`

The code continues to accept legacy statuses while adding B6 lifecycle statuses to avoid breaking prior rows.

## 8. TP1 / BE / TP2 behavior

- TP1 closes exactly 50% by plan split.
- TP2 closes the remaining 50%.
- No TP3 was added.
- Managed mode moves the logical stop to entry/breakeven after TP1.
- Native TP1 fill detection marks `sl_moved_to_be`; BE SL replacement is attempted in sync paths and failures are surfaced as protection errors.
- If native BE move fails, the row is no longer silently considered safe; it can be managed or marked unprotected according to monitor state.

## 9. Time-stop / expiry behavior

Added time-stop mapping:

| Strategy | Timeframe | Max open duration |
|---|---:|---:|
| MicroScalper | 5m | 120 minutes |
| MicroScalper | 15m | 360 minutes |
| CompressionBreakout | 15m | 720 minutes |
| CompressionBreakout | 1h | 48 hours |
| SwingContinuation | 15m | 1440 minutes |
| SwingContinuation | 1h | 96 hours |

When the deadline expires in managed monitoring, the monitor submits a reduce-only market close and marks `closed_timeout`.

## 10. Admin UI changes

Admin → Execution now exposes clearer account/monitor/execution state:

- Binance wallet/margin/USDT/USDC/open position/open order/uPnL snapshots.
- Per-row bracket mode, protection status, latest protection error, TP1 state, SL-to-BE state, remaining quantity, mark price, unrealized PnL, time-stop deadline, and last monitor action.
- Control buttons for connection, symbol validation, dry-run, execute, E2E flow, positions, cancel orders, close position now, resync, and stale row cleanup.

## 11. Reset trading history fix

Reset was rebuilt as a batch function:

- Deletes in chunks to avoid one huge timeout-prone statement.
- Preserves customers, packages, admin profiles, strategy configs, scanner config, Telegram settings, bot setup config, and execution settings.
- Cleans trading history objects including signals, signal updates, candidates, scanner runs, execution orders, and execution event logs.
- Optional tables are skipped safely if not present.

## 12. Product readiness verdict

1. **Signal Mode sellable now?** Yes, if existing Signal Mode acceptance remains green. This work did not alter scanner/arbitrator strategy logic.
2. **Binance Futures Bot mode sellable now?** Not yet as a paid production product. It is testnet-ready for soak testing, not public sellable automation.
3. **Acceptance tests required before selling Bot mode:**
   - Multiple Binance testnet entries fill.
   - Every open testnet position is either protected native with visible SL/TP1/TP2 open orders or protected managed with a confirmed monitor run.
   - Native TP1 fills cancel/replace SL to BE or safely switch remaining position to managed BE fallback.
   - Managed TP1/BE/TP2/SL/time-stop close actions submit reduce-only market orders and update Telegram/event logs.
   - No open Binance testnet position remains `unprotected_failed` for a full soak window.
   - Reset runs repeatedly without timeout.
   - Live trading remains impossible.
4. **Public page today:** advertise Signal Mode and setup/waitlist for bot automation; do not claim live Binance bot readiness.
5. **Customer dashboard today:** show bot packages as pending/admin-managed setup or testnet pilot only, not autonomous live execution.
6. **Admin dashboard today:** allow testnet controls and proof views only.
7. **Should bot packages remain hidden until Binance testnet passes soak testing?** Yes. Keep bot packages hidden or clearly marked private pilot until B6 soak testing passes.

## 13. Files changed

- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `src/lib/binanceTruthExecution.ts`
- `src/lib/binanceTestnetMonitor.ts`
- `src/pages/admin/Execution.tsx`
- `src/lib/types.ts`
- `tests/execution/binanceTruthExecution.test.ts`
- `tests/execution/binanceTestnetMonitor.test.ts`
- `tests/execution/sqlConstraints.test.ts`
- `supabase/migrations/20260608120000_046_b6_real_binance_futures_bot_lifecycle.sql`
- `reports/execution/binance-testnet-real-futures-bot-audit-and-rebuild.md`

## 14. SQL migration added

`supabase/migrations/20260608120000_046_b6_real_binance_futures_bot_lifecycle.sql`

Adds lifecycle/time-stop/monitor columns, extends status constraints, and implements `admin_reset_trading_history_batch` plus a compatible `admin_reset_trading_history` wrapper.

## 15. Manual test steps

1. Run SQL migration.
2. Deploy updated Edge Functions.
3. Open Admin → Execution.
4. Clean stale rows.
5. Test Binance connection.
6. Select a fresh signal.
7. Dry-run selected signal.
8. Execute selected signal.
9. Confirm Binance position opens.
10. Confirm either Binance open orders show SL, TP1, TP2, or Admin shows `protected_managed` and monitor confirms active fallback.
11. Run/fetch monitor sync.
12. Confirm TP1/TP2/SL/time-stop status is visible.
13. Confirm no open Binance position is unprotected.
14. Confirm Telegram sends execution/protection updates.

## 16. E2E test steps

1. Use `Run E2E Test Flow` on a fresh qualifying signal.
2. Confirm stale rows are cleaned before execution.
3. Confirm dry-run returns entry/SL/TP/quantity/leverage plan.
4. Confirm entry order ID is stored.
5. Confirm sync/fill path does not mark fake protection.
6. Confirm native open order verification or managed fallback activation.
7. Confirm monitor result includes checked/updated/reduce-only/cancel details.
8. Simulate/observe mark-price hits for TP1/TP2/SL and timeout.

## 17. Confirmation scanner/arbitrator strategy logic untouched

Confirmed. No scanner, arbitrator, or strategy-parameter tuning files were changed.

## 18. Confirmation forex/MT5 untouched

Confirmed. No forex/MT5 strategy logic was changed.

## 19. Confirmation live trading remains impossible

Confirmed. Execution and monitor still abort when live trading is enabled, require `EXECUTION_MODE=testnet`, require `EXCHANGE=binance_usdm_testnet`, require `TESTNET_ENABLED=true`, and enforce the Binance demo base URL.
