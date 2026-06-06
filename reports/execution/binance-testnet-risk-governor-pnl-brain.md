# Binance Testnet Risk Governor and PnL/Equity Brain

Date: 2026-06-05

## 1. What B3 adds beyond B2

B2 made Binance USD-M Futures Testnet execution explicit and protected: auto execution, capital basis, risk sizing, leverage rules, bracket orders, and managed fallback. B3 adds the risk governor/brain before order placement. The bot now reads Binance testnet account equity, balances, open exposure, open orders, unrealized PnL, and execution history, then decides whether the testnet bot should run `normal`, `defensive`, `aggressive_allowed`, or `paused`.

## 2. Binance account fields fetched

The execution function fetches and stores/displays:

- `totalMarginBalance`
- `totalWalletBalance`
- account `availableBalance`
- available USDT
- available USDC
- total unrealized PnL
- open position count
- per-symbol position amount
- per-symbol notional
- per-symbol unrealized PnL
- per-symbol mark price
- current margin ratio when maintenance margin and margin balance are available
- open order count

The latest raw/summarized snapshot is stored on `execution_settings` for admin visibility and governor evaluation.

## 3. Governor states and exact rules

Allowed states:

- `normal`
- `defensive`
- `aggressive_allowed`
- `paused`

Rules are evaluated before auto order placement:

1. Kill switch ON → `paused`.
2. `live_trading_enabled=true` → `paused` and blocked.
3. Current equity missing → `defensive` and never aggressive.
4. `daily_pnl_pct <= -max_daily_loss_pct` → `paused`.
5. Unrealized drawdown at or beyond max daily loss severity → `paused`; at or beyond `max_unrealized_drawdown_pct` → `defensive`.
6. Consecutive failed executions >= configured max → `paused`.
7. Consecutive `closed_sl` executions >= configured max → `paused`.
8. `daily_pnl_pct <= -defensive_loss_pct` → `defensive`.
9. `daily_pnl_pct >= aggressive_allowed_profit_pct` with no recent breach → `aggressive_allowed`.
10. Otherwise → `normal`.

## 4. Risk/leverage behavior by state

- `paused`: no new automatic execution.
- `defensive`: risk multiplier `0.5`, max leverage `3x`, max open positions `1`, and automatic execution only allows A+ signals as the stricter grade filter.
- `normal`: B2 defaults remain, A risk `0.5%`, A+ risk `0.75%`, A leverage `3x`, A+ leverage `5x`, hard max `7x`.
- `aggressive_allowed`: risk remains capped at `max_testnet_risk_pct` and never above `1%`; A can use `0.75%`, A+ can use `1.0%`, max leverage remains hard-capped at `7x`, and max open positions never exceeds the DB configured maximum.

## 5. How auto-execution uses governor

Automatic execution evaluates the governor after basic signal eligibility and before sizing/order placement. If the governor returns `paused`, the function creates a skipped execution record with `latest_auto_skip_reason=skipped_governor_paused` and does not call Binance order endpoints. If the governor is `defensive` and the signal is not A+, the function records `skipped_governor_defensive_filter`. If allowed, the governor state, reason, risk multiplier, adjusted risk percentage, and adjusted max leverage are written to execution records, event logs, dry-run output, and Telegram execution updates.

## 6. UI changes

Admin → MT5/Execution now includes a simple Risk Governor / PnL Brain section showing:

- governor enabled
- governor state
- current equity
- daily start equity
- daily PnL %
- unrealized PnL
- open positions
- open orders
- governor reason
- last checked time
- risk multiplier
- effective risk policy
- effective max leverage
- Refresh Binance Account State button
- Re-evaluate Governor button

## 7. Telegram changes

Automatic execution Telegram messages now include:

- Governor
- Governor reason
- Effective risk %
- Effective max leverage
- Capital basis
- Capital used
- Daily PnL %
- Unrealized PnL

The original signal message remains unchanged.

## 8. Files changed

- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/migrations/20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`
- `src/pages/admin/Execution.tsx`
- `src/lib/types.ts`
- `scripts/execution/binance-testnet-connector-selftest.mjs`
- `reports/execution/binance-testnet-risk-governor-pnl-brain.md`

## 9. SQL migration added

Added `20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`. It adds governor settings/state, account snapshot fields, PnL/equity fields, thresholds, streak limits, and execution-order governor audit fields.

## 10. Manual test steps

1. Run migrations 041 and 042 after existing migration 040.
2. Deploy the updated `binance-testnet-execution` Edge Function.
3. Refresh Admin → MT5/Execution.
4. Click Refresh Binance Account State.
5. Confirm total margin balance, total wallet balance, available balance, available USDT/USDC, open positions, open orders, and unrealized PnL update.
6. Click Re-evaluate Governor.
7. Confirm governor state/reason and effective risk/leverage are visible.
8. Dry-run a selected signal and confirm governor fields appear in the plan.
9. Manually execute a selected signal only after confirming testnet settings and protection behavior.

## 11. Auto test steps

1. Confirm Telegram signal delivery works.
2. Keep `LIVE_TRADING_ENABLED=false`.
3. Set env `EXECUTION_MODE=testnet` and `TESTNET_ENABLED=true`.
4. Set DB `execution_mode='testnet'`, `testnet_enabled=true`, `kill_switch_enabled=false`, `auto_execute_testnet=true`.
5. Let a new scanner signal arrive.
6. Confirm governor evaluates before any order placement.
7. If governor is paused/defensive-filtered, confirm a skipped execution record and no Binance order.
8. If governor allows execution, confirm Telegram includes governor, capital, effective risk, effective max leverage, daily PnL, and unrealized PnL.

## 12. Confirmation live trading remains impossible

Live trading remains impossible. The Edge Function still requires `EXECUTION_MODE=testnet`, `TESTNET_ENABLED=true`, `EXCHANGE=binance_usdm_testnet`, `LIVE_TRADING_ENABLED=false`, and the fixed Binance Demo base URL `https://demo-fapi.binance.com`. DB settings keep `live_trading_enabled=false` and the governor also pauses/block if that value is ever true.

## 13. Confirmation strategy/scanner/arbitrator logic unchanged

No strategy rules, scanner scoring, scanner tuning, arbitrator scoring, or forex/MT5 strategy logic were changed. The scanner still only calls the execution function after a new scanner signal is created and Telegram sends successfully; all B3 behavior is inside testnet execution/account governance.

## 14. Merge readiness

This branch is ready for manual B2/B3 deploy testing after migrations and Edge Function deployment. It should be merged only after confirming Binance Demo account snapshots, governor transitions, auto-execution skips/allows, bracket protection or managed fallback, Telegram updates, and admin sync behavior in the deployed Supabase environment.
