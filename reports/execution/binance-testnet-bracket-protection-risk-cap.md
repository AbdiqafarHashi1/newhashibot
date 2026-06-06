# Binance Testnet Bracket Protection, Break-even Move, and Open Risk Cap

Date: 2026-06-06

## 1. Why TP1/TP2/SL were not appearing

Binance USD-M Futures does not provide one native multi-target bracket feature named TP1/TP2. TP1, TP2, and SL must be submitted as separate reduce-only conditional orders. On Demo/Testnet, `/fapi/v1/order` can reject conditional STOP/TAKE_PROFIT order types with the message telling clients to use Algo order API endpoints. When that happened, entry could exist while exits were not visible.

## 2. Exact protection mode now used

HashiBot now records one honest mode per execution:

- `exchange_native`: SL, TP1, and TP2 were submitted as separate reduce-only exchange orders and order IDs were saved.
- `managed_exit_fallback`: native/Algo protection is unavailable, so HashiBot stores intended SL/TP1/TP2 and closes with reduce-only market orders when sync/monitor sees levels reached.
- `failed`: no valid native or managed protection path exists, so `protection_status=unprotected_failed` and an admin-visible error is stored.

## 3. Whether Binance native Algo orders work on demo

The connector still tries regular `/fapi/v1/order` for compatibility, then retries conditional exits through signed `/fapi/v1/algoOrder` when Binance tells us to use Algo endpoints. If Demo/Testnet rejects or blocks Algo, the system falls back to managed protection and does not claim exchange-native protection exists.

## 4. How managed fallback works if needed

Managed fallback saves intended SL, TP1, and TP2 levels, keeps `bracket_mode=managed_exit_fallback`, and marks `protection_status=protected_managed`. Sync checks mark price and current position. If TP/SL levels are hit, HashiBot sends reduce-only market close orders for the correct remaining quantity.

## 5. How TP1 50%, BE move, and TP2 50% are handled

- TP1 closes 50% of the starting position.
- After TP1 is confirmed filled/hit, HashiBot moves SL to break-even for the remaining position.
- TP2 closes the remaining 50%.
- If SL hits before TP1, the full position is closed.
- If break-even SL hits after TP1, the remaining position is closed and status becomes `closed_breakeven`.
- No TP3, no averaging down, and no martingale were added.

## 6. Sync behavior

Sync now fetches entry order status, native exit order statuses when IDs exist, current position, and mark price. It detects TP1/TP2/SL fills or managed level hits, cancels stale exits after full closure, moves native or managed SL to break-even after TP1, updates `tp1_filled`, `sl_moved_to_be`, `be_stop_level`, `bracket_mode`, `protection_status`, and event logs, and stores `latest_protection_error` if any protection step fails.

## 7. New max position logic

`max_open_testnet_positions` remains default 3 but is now admin-configurable up to the hard allowed max of 10. `one_active_execution_per_symbol=true` remains the default strict same-symbol guard.

## 8. Total open risk cap logic

`max_total_open_risk_pct` defaults to 3.0 and has a hard DB/code cap of 5.0. Before opening a new automatic execution, HashiBot sums active execution risk percentages and adds the proposed trade risk. If the total would exceed the configured cap, execution is skipped with `skipped_total_open_risk_cap`.

## 9. Files changed

- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/migrations/20260606100000_043_binance_testnet_bracket_be_risk_cap.sql`
- `src/pages/admin/Execution.tsx`
- `src/lib/types.ts`
- `scripts/execution/binance-testnet-connector-selftest.mjs`
- `reports/execution/binance-testnet-bracket-protection-risk-cap.md`

## 10. SQL migration added

Added `20260606100000_043_binance_testnet_bracket_be_risk_cap.sql` for BE stop/order fields, TP1/BE flags, latest protection error, current/after-trade open risk, max open allowed max 10, max total open risk cap, `protected_managed` protection states, and `closed_breakeven` status.

## 11. Manual test steps

1. Run migrations through 043.
2. Deploy the updated `binance-testnet-execution` Edge Function.
3. Refresh Admin → MT5/Execution.
4. Set max open positions between 1 and 10 and max total open risk to 3% initially.
5. Dry-run a signal and confirm proposed risk and total open risk after trade.
6. Execute a selected testnet signal.
7. Confirm entry appears.
8. Sync after entry fill and confirm SL, TP1, TP2 are native order IDs or managed fallback is clearly active.
9. Simulate/observe TP1 and sync; confirm 50% close and SL moved to break-even.
10. Simulate/observe TP2; confirm remaining position closes and leftover SL cancels.
11. Simulate/observe SL before TP1 and BE SL after TP1 on separate tests.

## 12. Auto test steps

1. Keep scanner as-is and enable existing auto-execute gates.
2. Wait for a new scanner-created crypto signal after Telegram delivery.
3. Confirm governor/risk gates run.
4. Confirm total open risk cap allows trades up to the cap and skips the next trade above cap.
5. Confirm same-symbol and duplicate-signal guards still skip.
6. Confirm Telegram protection and TP/SL updates are sent.

## 13. Confirmation scanner auto-execution was not rewired

Scanner auto-execution wiring was not changed. All changes are inside the Binance testnet execution function, admin UI/types, migrations, tests, and reports.

## 14. Confirmation live trading remains impossible

Live trading remains impossible. The function still requires testnet env/settings, `EXCHANGE=binance_usdm_testnet`, `LIVE_TRADING_ENABLED=false`, and the fixed Demo base URL `https://demo-fapi.binance.com`. No live Binance endpoint was added.
