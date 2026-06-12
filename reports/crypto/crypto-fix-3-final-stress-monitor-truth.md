# Crypto Fix 3 — Final Testnet Stress Mode, Monitor Truth, and Performance Truth

## Scope

This phase is a surgical execution-truth update for the existing crypto Binance USD-M testnet engine. It does **not** rebuild strategies, scanner logic, signal generation, arbitration, Telegram channel architecture, AI intelligence, Forex, or MT5.

## Stress mode implementation

- Added backend testnet stress controls on `execution_settings`:
  - `stress_override_enabled` default `true`
  - `stress_risk_pct` default `2.0`
  - `stress_leverage` default `10`
  - `stress_ignore_open_risk_limit` default `true`
- Added durable execution truth fields on `execution_orders`:
  - `risk_source`
  - `stress_mode`
  - `open_risk_guard`
- When DB execution mode is `testnet` and stress override is enabled, order planning uses:
  - risk `%` from `stress_risk_pct`
  - leverage from `stress_leverage`
  - `risk_source = testnet_stress_override`
  - `leverage_source = testnet_stress_override`
  - `open_risk_guard = IGNORED_FOR_STRESS_TEST` when open-risk bypass is enabled
- Normal sizing and leverage automatically resume when `stress_override_enabled` is false.

## UI implementation

- Admin Execution now exposes real backend-backed controls for:
  - Stress Mode ON/OFF
  - Stress Risk %
  - Stress Leverage
  - Ignore Open Risk Limit ON/OFF
- The UI displays backend status values for:
  - Current Execution Mode
  - Current Effective Risk
  - Current Effective Leverage
  - Risk Source
  - Leverage Source
  - Governor Mode
  - Governor State
  - Execution Allowed
- The executions table now shows risk/leverage source truth per row.

## Risk override findings

- Stress mode bypasses signal guidance sizing, grade sizing, arbitrated sizing, confidence sizing, and governor risk multipliers.
- Stress risk is persisted to each execution row as `risk_pct`, `adjusted_risk_pct`, and `risk_source`.

## Leverage override findings

- Stress mode bypasses signal guidance and normal grade/admin leverage selection.
- Stress leverage is persisted to each execution row as `leverage` and `leverage_source`.

## Open-risk bypass findings

- When stress mode and `stress_ignore_open_risk_limit` are enabled, the execution gate does not block on max open positions or total open-risk portfolio caps.
- The bypass is scoped to testnet stress mode only and does not disable kill switch, duplicate prevention, one-active-symbol prevention, Binance credential checks, exchange rejection handling, minimum notional checks, protection placement, lifecycle management, or monitor reconciliation.

## Governor findings

- `OFF_FOR_TESTING` no longer presents as an execution blocker.
- Status payload and UI display:
  - Governor Mode: `OFF_FOR_TESTING`
  - Governor State: `IGNORED`
  - Execution Allowed: `TRUE`
- Historical governor reason/state remains visible in the detailed governor panel.

## Binance truth findings

- Entry, TP1, TP2, SL, profit-lock, expiry, manual closure, runner, protection, and cleanup classifications continue to derive from Binance order/position truth through the execution sync and monitor layers.
- Telegram execution messages now include execution truth fields so alerts match backend execution behavior.

## Monitor truth findings

- Monitor version updated to `crypto-fix-3-final-stress-monitor-truth`.
- Monitor now performs an account-level Binance/DB reconciliation pass after row-level sync:
  - Open Binance position + closed/non-active DB row: Binance wins; row is recovered to active `entry_filled`, marked `unsafe_untracked_position`, and queued for protection recovery on monitor handling.
  - Open Binance orders + no Binance position: marked `orphan_orders_detected`, cleanup is queued/executed, and cleanup status is persisted.
  - Existing active rows still reconcile entry fills, TP1, TP2, profit-lock closures, direct SL closures, expiry closures, runner state, protection state, and stale rows.

## Performance truth findings

- Performance remains based on execution rows populated by Binance execution/monitor truth.
- Filled entries only count as bot trades.
- Open trades are excluded from PF.
- Entry timeouts/skips/unfilled entries are excluded from PF.
- Profit-lock closures count separately from direct SL losses.
- TP2 closures count as wins.
- Added visible execution-truth cards for Profit-Lock Count, Direct SL Count, Expiry Count, Manual Close Count, Open Runner Count, Protected Runner Count, and Pending Sync Count.

## Telegram truth findings

- Execution Telegram messages now include:
  - Execution Mode
  - Stress Mode
  - Risk Used
  - Risk Source
  - Leverage Used
  - Leverage Source
  - Governor Mode
  - Governor State
  - Lifecycle State
  - Fill State
  - Protection State
  - Runner State
  - Expiry State
  - Cleanup State
  - Open Risk Guard
- When stress mode is active, Telegram displays `testnet_stress_override` risk/leverage sources and `IGNORED_FOR_STRESS_TEST` open-risk guard.

## Remaining risks

- Supabase Edge Function type-checking was not run with Deno in this container because `deno` is not installed; frontend TypeScript/build/lint and existing execution unit tests passed.
- Binance API behavior can still vary under testnet exchange outages, stale algo-order lookup responses, or credential/account permission problems. These remain surfaced as monitor warnings/errors rather than silently reclassified from DB state.
- Unknown Binance positions with no historical execution row are surfaced as `unsafe_untracked_position` warnings requiring manual review because there is no safe signal/order row to attach full lifecycle metadata to.

## Files changed

- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/migrations/20260612120000_061_crypto_fix_3_stress_monitor_truth.sql`
- `src/pages/admin/Execution.tsx`
- `src/pages/admin/Performance.tsx`
- `src/lib/types.ts`
- `reports/crypto/crypto-fix-3-final-stress-monitor-truth.md`

## Tests run

- `git diff --check`
- `npm run build`
- `npm run lint` — passed with pre-existing Fast Refresh warnings in unrelated files.
- `npm run typecheck`
- `npm run test:execution`
