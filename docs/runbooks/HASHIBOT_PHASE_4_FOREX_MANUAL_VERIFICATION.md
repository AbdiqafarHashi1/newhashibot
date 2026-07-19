# HashiBot Phase 4 Forex Manual Verification

## Preconditions

* Use a non-production Signal Mode environment.
* Configure `TWELVE_DATA_API_KEY`, the three existing Telegram chat IDs, and the explicit Forex allowlist.
* Confirm cron/schedules are disabled and no MT5/execution worker is attached.
* Confirm UTC clock synchronization.

## Checklist

1. Run `cd v2 && npm test` and retain the TAP summary.
2. Inspect the default registry and confirm four active Forex IDs and unchanged Crypto IDs.
3. Query provider health; verify daily credits are below warning and hard-stop limits.
4. Invoke one authenticated manual scan during London or New York on a small allowlist.
5. Confirm scanner diagnostics show one upstream fetch per unique symbol/timeframe, with additional strategy consumers recorded as reuse/cache activity.
6. Repeat before candle close and confirm cache hits rise without another history download.
7. Verify candidate evidence, session, spread model, expiry, stop, two targets, grade and RR before publication.
8. Repeat the scan and confirm active-signal and Telegram idempotency suppression.
9. Advance deterministic paper candles through entry, protection, TP1, break-even and TP2; separately exercise stop, time-stop, and expired-unfilled paths.
10. Confirm estimated-spread records say `estimated_spread`, never broker fill/execution.
11. Confirm VIP includes all professional signal fields and lifecycle updates reference the same signal ID.
12. Simulate stale data, rate limit, credit warning, provider failure, and Telegram failure; confirm one ADMIN_OPS alert for each idempotency key.
13. Compare Admin totals with reporting dimensions and verify expired-unfilled is absent from entered results.
14. Verify no cron, SQL, deployment, MT5, Prop, or customer-feature changes were introduced.

## Rollback

Disable `FOREX_ENABLED` or `TWELVE_DATA_ENABLED`. This stops Forex scans without changing Crypto, historical truth, or the shared platform services.
