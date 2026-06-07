# Binance USD-M Futures Testnet Execution Connector — Phase B

## 1. Files changed

- `supabase/functions/binance-testnet-execution/index.ts` — server-side Binance USD-M Futures testnet connector, signed requests, sizing, execution, sync, manual actions, Telegram execution updates, and safety guards.
- `supabase/functions/market-scanner/index.ts` — optional post-Telegram auto execution call for just-created scanner signals when testnet env is explicitly enabled.
- `supabase/migrations/20260605123000_040_binance_usdm_testnet_execution.sql` — execution table enhancements, event logs, and execution settings.
- `src/pages/admin/Execution.tsx` — admin execution panel for status, manual tests, dry-run, selected-signal execution, positions, cancellation, latest executions, failures, and skipped records.
- `src/lib/types.ts` — Binance execution, event log, and settings types for admin UI.
- `scripts/execution/binance-testnet-connector-selftest.mjs` — focused connector self-tests for signature, rounding, leverage cap, duplicate prevention, old-signal skip, and live-trading guard.
- `package.json` — added `npm run test:execution`.
- `reports/execution/binance-usdm-testnet-connector.md` — this implementation report.

## 2. DB migrations added

Added `supabase/migrations/20260605123000_040_binance_usdm_testnet_execution.sql`.

It adds/updates:

- `execution_orders` Binance testnet fields: `exchange`, `environment`, `side`, `leverage`, `quantity`, `entry_order_id`, `sl_order_id`, `tp1_order_id`, `tp2_order_id`, `raw_exchange_response`, `testnet_enabled_at`, and `last_exchange_error`.
- `execution_event_logs` with `execution_id`, `event_type`, `message`, `metadata`, and `created_at`.
- `execution_settings` with safe defaults: `execution_mode='signal_only'`, `testnet_enabled=false`, `live_trading_enabled=false`, kill switch, max open positions, one-active-per-symbol, activation timestamp, and fallback balance.
- Admin RLS policies.
- Unique duplicate guard for `(signal_id, exchange, environment)`.

No API keys or secrets are stored in the database.

## 3. Environment variables required

Server-side Edge Function secrets only:

- `BINANCE_TESTNET_API_KEY`
- `BINANCE_TESTNET_API_SECRET`
- `BINANCE_TESTNET_BASE_URL=https://demo-fapi.binance.com`
- `EXECUTION_MODE=testnet`
- `EXCHANGE=binance_usdm_testnet`
- `TESTNET_ENABLED=true`
- `LIVE_TRADING_ENABLED=false`

Safe defaults are assumed by code when not configured:

- `EXECUTION_MODE=signal_only`
- `TESTNET_ENABLED=false`
- `LIVE_TRADING_ENABLED=false`

## 4. How signal converts to Binance Futures order

The connector reads the selected `signals` row and uses:

- `symbol`
- `direction`
- midpoint of `entry_low` / `entry_high` as entry price
- `stop_loss`
- `tp1`
- `tp2`
- `grade`
- `strategy_name`
- `timeframe`
- `recommended_risk_pct`
- `suggested_leverage_min`
- `suggested_leverage_max`
- `leverage_cap`

Conversion:

- `buy` → long futures entry (`BUY`) and close orders (`SELL`).
- `sell` → short futures entry (`SELL`) and close orders (`BUY`).
- Entry is currently submitted as a Binance USD-M Futures `LIMIT` order at the signal entry price.
- After entry fill is detected by sync, the connector submits reduce-only SL, TP1, and TP2 orders.

## 5. Binance endpoints used

All endpoints use `https://demo-fapi.binance.com` only.

- `GET /fapi/v2/account` — test connection / account check.
- `GET /fapi/v2/balance` — available USDT balance for sizing.
- `GET /fapi/v1/exchangeInfo` — symbol validation and precision/min-notional rules.
- `POST /fapi/v1/leverage` — leverage setup.
- `POST /fapi/v1/marginType` — isolated margin setup when supported.
- `POST /fapi/v1/order` — entry, stop-loss, TP1, TP2 orders.
- `GET /fapi/v1/order` — order status tracking.
- `GET /fapi/v2/positionRisk` — open position/status fetch.
- `DELETE /fapi/v1/allOpenOrders` — emergency/symbol cancel and reduce-only cleanup.

Signed requests include timestamp, query string signing, HMAC SHA256 signature, and `X-MBX-APIKEY` header.

## 6. Leverage/risk rules implemented

Risk:

- Grade `A`: 0.5% fallback risk.
- Grade `A+`: 0.75% fallback risk.
- If signal `recommended_risk_pct` is present, it is capped by the grade fallback risk.

Leverage:

- Grade `A`: 3x fallback.
- Grade `A+`: 5x fallback.
- Suggested leverage is used when present and valid.
- Signal `leverage_cap` is respected.
- Absolute hard cap: 7x.

## 7. Quantity sizing logic

Quantity calculation uses:

1. Binance testnet USDT available balance from `/fapi/v2/balance`.
2. `execution_settings.fallback_account_balance` only if balance fetch cannot provide a valid value.
3. Entry price.
4. Stop-loss distance.
5. Risk percent.
6. Symbol step size / quantity precision.
7. Min quantity.
8. Min notional.
9. Leverage cap and max notional quantity.

Invalid quantity is skipped, logged, and reported through admin-visible execution records and Telegram execution warning when Telegram is configured. The connector does not force orders to satisfy min notional.

## 8. Safety controls implemented

- Testnet-only base URL guard: only `https://demo-fapi.binance.com` is accepted.
- Live trading impossible guard: blocks if `LIVE_TRADING_ENABLED=true`.
- Explicit env gates: `EXECUTION_MODE=testnet`, `EXCHANGE=binance_usdm_testnet`, `TESTNET_ENABLED=true`.
- DB gates in `execution_settings`.
- Admin kill switch.
- Max open testnet positions (default 3).
- One active execution per symbol by default.
- Duplicate execution prevention via code and unique DB index.
- Old historical signal auto-execution skip based on `execution_settings.testnet_enabled_at`.
- Manual selected signal execution is allowed for admin testing.
- Execution error logging in `execution_orders` and `execution_event_logs`.
- Emergency/symbol cancel action through the admin panel.
- Secrets are never returned to the browser; only configured/missing booleans are shown.

## 9. Telegram execution update examples

All execution updates begin with:

```text
BINANCE TESTNET — NOT LIVE
```

Examples:

```text
BINANCE TESTNET — NOT LIVE

Entry order placed: BTCUSDT BUY
Qty: 0.012
Entry: 68250
Leverage: 3x
```

```text
BINANCE TESTNET — NOT LIVE

Entry filled: BTCUSDT
SL placed: 67500
TP1 placed: 69000
TP2 placed: 70500
```

```text
BINANCE TESTNET — NOT LIVE

TP1 hit: BTCUSDT
Position partially closed on Binance testnet.
```

```text
BINANCE TESTNET — NOT LIVE

SL hit: BTCUSDT
Remaining testnet orders cancelled if open.
```

## 10. Admin UI/manual actions added

Admin Execution page now shows:

- Testnet connection/config status.
- Execution mode.
- Kill switch state.
- Latest executions.
- Open testnet executions.
- Failed executions.
- Skipped executions.
- Latest exchange error.
- Test connection button.
- Validate symbol button.
- Dry-run selected signal button.
- Execute one selected recent signal on testnet button.
- Fetch positions button.
- Cancel symbol orders button.
- Sync execution lifecycle button.

The admin UI does not expose Binance API secrets.

## 11. Manual setup steps for Binance Demo/Futures API keys

1. Create Binance USD-M Futures Demo/Testnet API credentials.
2. Store the key and secret as Supabase Edge Function secrets:
   - `BINANCE_TESTNET_API_KEY`
   - `BINANCE_TESTNET_API_SECRET`
3. Set:
   - `BINANCE_TESTNET_BASE_URL=https://demo-fapi.binance.com`
   - `EXECUTION_MODE=testnet`
   - `EXCHANGE=binance_usdm_testnet`
   - `TESTNET_ENABLED=true`
   - `LIVE_TRADING_ENABLED=false`
4. Deploy the `binance-testnet-execution` function.
5. Apply migration `040` and set `execution_settings.testnet_enabled=true`, `execution_settings.execution_mode='testnet'`, and `testnet_enabled_at=now()` when ready.

## 12. Manual test steps after deploy

1. Add env vars/secrets listed above.
2. Deploy server/Edge functions needed for execution.
3. Open Admin → Execution.
4. Click **Test Binance Connection**.
5. Validate `BTCUSDT` or another eligible USD-M Futures symbol.
6. Dry-run one recent crypto signal.
7. Execute one manually selected new signal on testnet.
8. Confirm order appears in Binance Demo Futures.
9. Use **Sync** after entry fill to place SL/TP orders.
10. Confirm Telegram message starts with `BINANCE TESTNET — NOT LIVE`.
11. Use cancel action if emergency cleanup is needed.

## 13. Confirmation old signals are not auto-executed

Automatic execution is only called from the scanner immediately after a new signal is created and after the Telegram signal send succeeds. The execution function also skips any non-manual signal whose `created_at` is earlier than `execution_settings.testnet_enabled_at`.

## 14. Confirmation live trading is impossible in this phase

The connector rejects execution unless all of these are true:

- `BINANCE_TESTNET_BASE_URL=https://demo-fapi.binance.com`
- `EXECUTION_MODE=testnet`
- `EXCHANGE=binance_usdm_testnet`
- `TESTNET_ENABLED=true`
- `LIVE_TRADING_ENABLED=false`

The DB `execution_settings.live_trading_enabled` also has a check constraint forcing it to `false`.

## 15. Confirmation forex/MT5 untouched

No forex provider logic, forex scanner strategy logic, MT5 bridge logic, or MT5 endpoint integration was changed. The existing `execution_orders` table was extended for Binance testnet tracking, but this phase does not activate MT5.

## 16. Confirmation provider/scanner strategy logic untouched

Strategy evaluation, scanner arbitrator scoring, provider fetch logic, and parameter tuning were not changed. The scanner only received a post-signal optional call to the new testnet execution function after Telegram sending.

## 17. Testing results

Commands run in this implementation:

- `npm run test:execution`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

See final PR notes for pass/fail details from the local environment.
