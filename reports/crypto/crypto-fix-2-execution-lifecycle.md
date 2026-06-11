# Crypto Fix 2 — Binance Testnet Execution Lifecycle

## 1. TP1 detection implementation
- Monitor logic now treats Binance order/algo truth as authoritative for TP1. When TP1 is filled, it records TP1 filled state, fill price/time, filled quantity, remaining runner quantity, and runner activity.
- Recovery-safe monitor unit logic supports Binance fill snapshots after restart instead of relying on in-memory state.

## 2. +0.3R profit-lock calculation
- Profit lock defaults to `+0.3R`.
- `1R = abs(entry - original stop)`.
- Long: `entry + 0.3R`.
- Short: `entry - 0.3R`.
- Break-even is no longer the default lifecycle target after TP1.

## 3. SL replacement safety sequence
- Exchange-native monitor path submits and verifies the replacement reduce-only stop for the remaining runner before cancelling the obsolete original SL.
- If replacement verification fails, the row is marked unsafe/critical and the old stop is not intentionally removed by the monitor path.
- Cleanup warnings are persisted where old SL cancellation requires retry.

## 4. TP2 runner management
- After TP1, the runner remains active with `tp2_pending`, `runner_active`, and profit-lock protection state.
- TP2 fill now closes as `closed_tp2`, clears runner quantity, marks `tp2_filled`, and queues all SL/profit-lock leftovers for cleanup.

## 5. Profit-lock stop handling
- Replacement SL hits after TP1 are classified as `closed_profit_lock`.
- Profit-lock closures are not counted as direct SL losses.
- Telegram/event text distinguishes protected-profit closure from original SL.

## 6. Direct SL handling
- Original SL before TP1 remains `closed_sl` and is the only normal full-loss path.
- TP1/TP2 leftovers are cancelled on direct SL closure.

## 7. Execution expiry before TP1
- Filled open positions that exceed strategy/timeframe max hold before TP1 are closed reduce-only by the monitor.
- These close as `closed_expired` and trigger cleanup of TP1, TP2, and SL conditionals.

## 8. Execution expiry after TP1
- Runners that exceed expiry after TP1 close as `closed_expired_after_tp1`.
- The monitor records that TP1 was secured, runner expired, runner closed, and cleanup was initiated.

## 9. Conditional cleanup behavior
- Terminal paths cancel TP1, TP2, original SL, and replacement SL identifiers.
- The cleanup ID set now includes replacement profit-lock SL IDs in addition to legacy SL/TP algo IDs.
- Stale no-position/open-order reconciliation classifies manual closure as `closed_manual`.

## 10. Performance integration
- Execution performance now recognizes `closed_tp2`, `closed_profit_lock`, `closed_expired`, `closed_expired_after_tp1`, and `closed_manual`.
- Profit-lock SL counts separately from direct SL.
- Open/protected runner counts are available from runner/profit-lock flags.
- Unit lifecycle classification covers TP2 win, profit-lock protected close, direct SL loss, expiry-after-TP1, and no-trade paths.

## 11. Telegram updates
- Monitor/execution event names now include TP1 profit-lock active, TP2 closed, profit-lock SL filled, direct SL filled, position expired, runner expired after TP1, and manual closure sync.
- Messages include symbol/action-specific lifecycle details and remain routed through the existing Telegram delivery/event logging architecture.

## 12. Monitor recovery behavior
- Each monitor run reads Binance positions, regular orders, open algo orders, and per-row algo statuses.
- Missed TP1/TP2/SL fills are reconstructed from Binance order truth.
- Expired positions and manual closures are detected from Binance position/order state rather than process memory.

## 13. Files changed
- `src/lib/binanceTestnetMonitor.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/migrations/20260611150000_060_crypto_fix_2_execution_lifecycle.sql`
- `src/pages/admin/Performance.tsx`
- `src/pages/admin/Execution.tsx`
- `src/lib/types.ts`
- `tests/execution/binanceTestnetMonitor.test.ts`
- `reports/crypto/crypto-fix-2-execution-lifecycle.md`

## 14. Tests run
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:execution`
- `git diff --check`

## 15. Remaining known risks
- Binance testnet can vary in whether simultaneous old and replacement stop orders are accepted for the same reduce-only exposure. The monitor-native path uses the preferred submit-verify-cancel sequence; retry/critical metadata is retained when cancellation or verification is imperfect.
- Supabase Edge Functions use Deno/JSR/npm imports, so local Node `tsc` cannot fully typecheck those files without the Supabase/Deno toolchain.
- Realized PnL/R remains best-effort unless Binance fill/account endpoints provide all fills for the closure event in the monitor invocation.
