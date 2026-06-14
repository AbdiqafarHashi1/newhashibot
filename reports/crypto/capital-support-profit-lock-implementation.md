# Capital Support + Controlled Profit-Lock Implementation

## 1. USDT/USDC margin fallback behavior
USDT is selected first. USDC is attempted once only if configured, sufficient, and the mapped USDC contract exists. Existing trades are not cancelled because USDT is insufficient.

## 2. Supported symbol mapping
Runtime exchange info must produce supported USDT and USDC lists. `BASEUSDT` maps to `BASEUSDC` only when the USDC symbol is listed.

## 3. Insufficient margin diagnostics
Margin selection emits explicit reasons and supports admin visibility for backup attempted, backup asset used, and final result.

## 4. Profit-lock config
Profit-lock is disabled globally by default, testnet-gated, cooldown-limited, max-update-limited, and live-forbidden.

## 5. Profit-lock research mode proof
Study counters record highest positive R/PnL thresholds and simulated USDT saved/captured even while action execution is off.

## 6. Profit-lock testnet action proof if enabled
Action decisions require testnet, enabled config, current thresholds, cooldown clearance, and an existing valid SL.

## 7. Binance verification proof
The decision contract requires replacement SL verification before old SL cancellation. The pure decision API exposes `neverCancelOldSlBeforeVerification = true` for tests and integration guards.

## 8. Telegram lifecycle proof
No Free routing changes were made. VIP lifecycle updates should only be emitted by execution integration when meaningful; Admin alerts should be reserved for degradation/failure.

## 9. Admin UI proof
The admin execution page now surfaces USDT/USDC balances, selected/preferred margin asset details, last margin fallback state, profit-lock config/status, study counters, actions, skipped reasons, and per-trade R/PnL/lock fields.

## 10. What remains disabled for safety
Live trading, live profit-lock, capital-management enforcement, Forex, MT5, scanner scoring changes, and strategy entry changes remain disabled/untouched.

## 11. Files changed
- `src/lib/binanceTruthExecution.ts`
- `src/lib/types.ts`
- `src/pages/admin/Execution.tsx`
- `tests/execution/binanceTruthExecution.test.ts`
- `reports/crypto/usdt-usdc-margin-fallback.md`
- `reports/crypto/profit-lock-engine-testnet.md`
- `reports/crypto/capital-support-profit-lock-implementation.md`

## 12. Tests run
See final assistant response for command results.

## 13. Final decision
- READY FOR TESTNET PROFIT LOCK OBSERVATION: YES
- READY FOR LIVE PROFIT LOCK: NO
- READY FOR CAPITAL MANAGEMENT ENFORCEMENT: NO
