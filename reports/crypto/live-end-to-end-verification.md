# HashiBot Live End-to-End Verification

## A. Code-level verification completed in Codex

### Auth helper cleanup

`supabase/functions/_shared/internal-auth.ts` now uses one shared authorization model for the repaired Edge Functions.

Allowed internal/admin auth paths:

1. `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
   - Service-role bearer auth is allowed for trusted server-side/internal callers.
2. `x-scanner-cron-secret: <SCANNER_CRON_SECRET>`
   - Existing scanner cron secret header remains allowed for cron/service calls.
3. `x-hashibot-cron-token: <HASHIBOT_CRON_TOKEN>` or `x-hashibot-cron-token: <INTERNAL_CRON_TOKEN>`
   - Environment-backed internal cron token remains allowed through the custom header.
4. `x-hashibot-cron-token: <scanner_config.cron_pg_token>`
   - Database-backed cron token is allowed only through the custom `x-hashibot-cron-token` header.
5. `Authorization: Bearer <valid Supabase user JWT>` where `profiles.role = 'admin'`
   - Admin user JWT remains allowed for authenticated operator actions.

Forbidden auth path:

- `Authorization: Bearer <scanner_config.cron_pg_token>` is intentionally forbidden.

Reason:

- `scanner_config.cron_pg_token` is not a Supabase JWT.
- Supabase Edge gateway can reject malformed/non-JWT Authorization bearer values before function code runs.
- That failure can appear as `UNAUTHORIZED_INVALID_JWT_FORMAT` and prevent runtime logs, DB proof rows, or function-level error handling.
- Therefore cron tokens that are not Supabase JWTs must travel in `x-hashibot-cron-token`, not in `Authorization`.

Affected functions using the shared helper:

- `scheduled-market-scanner`
- `evaluate-signal-outcomes`
- `binance-testnet-execution`
- `binance-testnet-monitor`
- `telegram-orchestrator`
- `intelligence-engine`
- `telegram-send`
- `telegram-test`

### Codex checks required for this cleanup

Run before merge:

```bash
npm run typecheck
npm run lint
git diff --check
```

### Live proof status inside Codex

Live verification cannot be truthfully completed inside this Codex container unless the real runtime secrets and deployed Supabase project access are available.

Required unavailable live inputs include, at minimum:

- Supabase project URL and service/admin credentials capable of invoking deployed Edge Functions.
- Telegram bot token and configured Admin/Free/VIP chat IDs visible to deployed functions.
- Binance USDM Testnet API credentials visible to deployed functions.
- Access to inspect the relevant Supabase tables after invocation.

If those secrets are unavailable in Codex, live Telegram/Binance/Supabase verification must remain **not verified**. Do not mark production readiness based only on code review or local compilation.

## B. Live verification still required after merge/deploy

### 1. Deploy functions with JWT verification mode aligned to the auth model

Deploy the affected Edge Functions and ensure gateway settings allow intended internal/header-based calls to reach function code.

Required functions:

- `scheduled-market-scanner`
- `evaluate-signal-outcomes`
- `binance-testnet-execution`
- `binance-testnet-monitor`
- `telegram-orchestrator`
- `intelligence-engine`
- `telegram-send`
- `telegram-test`

### 2. Verify latest invocations are not 401

For each function above:

- Invoke with the correct allowed auth method.
- Confirm latest invocation status is not `401`.
- Confirm function logs show the request entered runtime code.
- Confirm `net._http_response` is no longer dominated by auth-gateway failures.

Expected result:

- Each required function returns a runtime response, not a gateway-level auth rejection.

### 3. Telegram end-to-end routing proof

Invoke `telegram-test` to each destination:

- Admin
- Free
- VIP

Verify in `telegram_deliveries`:

- New rows are created.
- `destination_channel` is correct.
- `destination_chat_id` matches configured chat ID.
- `status` / `delivery_status` is `sent`, or exact Telegram API error is recorded.
- `telegram_message_id` is present for successful sends.

### 4. Intelligence end-to-end proof

Invoke `telegram-orchestrator` with a test intelligence payload.

Verify:

- New `intelligence_events` row exists.
- New `intelligence_feed_results` row exists.
- New `telegram_deliveries` rows exist for Free and VIP.
- Delivery uses router path, not a direct Telegram bypass.
- Free and VIP channel messages are received.

### 5. Binance monitor truth proof

Invoke `binance-testnet-monitor`.

Verify:

- Function returns 2xx.
- Binance account fetch succeeds.
- Binance balances/equity are fetched.
- Binance open orders are fetched.
- Binance positions are fetched.
- Local DB reconciliation runs.
- Monitor health reflects latest fetch + reconciliation result, not stale historical success.

### 6. Execution protection truth proof

For every active Binance Testnet trade/order, record and compare:

- Binance entry order.
- Binance SL/protection order.
- Binance TP order(s), if configured.
- Binance open position, if any.
- Local `execution_orders` row.
- Local execution status.
- Local lifecycle/protection columns.
- `execution_event_logs` lifecycle/protection events.

Every item must be classified explicitly:

- Matched
- Stale
- Orphaned
- Cancelled
- Expired
- Rejected
- Reconciled
- Mismatch Resolved

No ambiguous permanent `entry_submitted`, `pending`, or `stale` state should remain without an explanation and reconciliation outcome.

### 7. BNB stale state investigation

Treat Binance Testnet API truth as authoritative.

Verify whether Binance still holds any BNB-related:

- Open position.
- Open entry order.
- Stop/protection order.
- TP order.

Then verify local DB state matches Binance truth:

- If Binance has real BNB state, local DB must represent it.
- If Binance has no real BNB state, local DB must mark stale local state as reconciled/stale with proof.

### 8. TP1 / breakeven / +0.3R lifecycle proof

Verify implementation and live behavior:

- TP1 detection exists and emits event logs.
- Breakeven movement after TP1 exists, or exact reason not moved is recorded.
- +0.3R protection behavior is documented and prioritized relative to TP1.
- Binance stop update is confirmed through Binance API, or exact Binance error is recorded.
- Telegram VIP lifecycle update is delivered.
- UI displays protection state from latest truth.

Required proof rows/logs:

- TP1 detected event.
- Breakeven moved event or reason not moved.
- Binance confirmation or exact error.
- Telegram delivery row for lifecycle update.

### 9. UI truth recovery proof

Verify UI health cards use latest actual truth:

- Latest function invocation status.
- Latest Binance fetch status.
- Latest reconciliation status.
- Latest Telegram delivery status.
- Latest intelligence generation/delivery status.
- Latest execution lifecycle/protection status.

Health must show `unhealthy` or `stale` when the latest required step fails or is old. It must not show healthy based only on older historical success.

### Final gate

Do not move to Observation Expansion or Capital Allocation until all live checks above are complete and documented with database rows, invocation logs, Telegram delivery proof, Binance API proof, and reconciliation proof.
