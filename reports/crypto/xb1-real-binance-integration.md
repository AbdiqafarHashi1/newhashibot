# X-B.1 Real Binance Testnet Integration

## 1. Real Integration Points Found
- Real testnet entry order submitter: `executeSignal` submits `/fapi/v1/order` LIMIT entries after symbol configuration.
- Quantity/margin/notional calculation: `buildPlan` calculates entry price, stop distance, risk amount, quantity, notional, and `marginRequired`.
- Insufficient-margin handling: `classifyExecutionError` now classifies Binance margin rejection as `insufficient_margin`; the pre-order selector can also skip before placement.
- `execution_orders` writer: `executeSignal` inserts the pending row with `commonExecutionFields`; `createSkipped` writes skipped diagnostics.
- `execution_event_logs` writer: `logEvent` writes event metadata for planned, margin selection, submitted, skipped, and failed events.
- Binance monitor: `binance-testnet-monitor` `monitorRow` manages active positions, fills, protection, time stops, and native/managed exits.
- SL move/replace path: `placeAndVerifyProfitLockStop` submits replacement SL, verifies it, then cancels the old SL if verification succeeds.

## 2. Files changed
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/migrations/20260614190000_070_xb1_capital_profit_lock_real_integration.sql`
- `src/lib/binanceTestnetMonitor.ts`
- `src/lib/types.ts`
- `src/pages/admin/Execution.tsx`
- `tests/execution/binanceTestnetMonitor.test.ts`
- `tests/execution/sqlConstraints.test.ts`
- `reports/crypto/xb1-real-binance-integration.md`

## 3. USDT/USDC fallback real integration proof
`executeSignal` now calls `applyMarginFallbackToPlan` before inserting/submitting the Binance entry. The integration fetches Binance exchange info, checks supported USDT/USDC symbols, selects USDT first, and uses the mapped USDC symbol only when testnet/config/balance/symbol support are all valid.

## 4. Insufficient-margin proof
A safe `diagnose_margin_fallback` action simulates insufficient USDT without placing an order. It writes a skipped `execution_orders` row and an `execution_event_logs` row containing the margin selection proof. Real exchange rejections are also classified and logged with exchange code/message.

## 5. Profit-lock study loop proof
`monitorRow` now persists current R, current PnL, highest positive R/PnL, threshold flags, reversal-after-positive-excursion, TP hit flags, SL-valid state, recommendation, and skip reason on every active-position monitor tick.

## 6. Profit-lock action mode proof if enabled
Default mode remains study-only. If DB config explicitly enables `enable_profit_lock_engine` and `enable_testnet_profit_lock_engine` while testnet env is true, post-TP1 native replacement can call `placeAndVerifyProfitLockStop`.

## 7. Binance SL verification proof
`placeAndVerifyProfitLockStop` submits replacement SL, fetches the Binance algo order, requires a live status, and only then attempts to cancel the old SL. If verification fails, old SL remains preserved and the row is marked retry/degraded rather than unprotected by cancellation.

## 8. Admin UI proof
`/admin/execution` reads the real execution/settings fields: USDT/USDC balances, selected/fallback margin asset, last insufficient-margin event, profit-lock mode, study counters, actions, skipped reasons, current/highest R/PnL, recommendation, verified replacement, and old-SL preservation.

## 9. Tests run
See final response for command results.

## 10. What remains disabled
Scanner scoring, strategy entries/thresholds, Telegram routing policy, Binance reconciliation safety rules, Forex, MT5, live trading, and capital-management enforcement remain unchanged or disabled.

## 11. Final decision
- REAL USDT/USDC FALLBACK WIRED: YES
- REAL PROFIT-LOCK STUDY WIRED: YES
- REAL PROFIT-LOCK ACTION WIRED: YES, TESTNET-CONFIG-GATED
- READY FOR TESTNET OBSERVATION: YES
- READY FOR LIVE: NO
