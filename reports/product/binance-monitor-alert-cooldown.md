# Binance Monitor Admin Alert Cooldown

## Scope

Only Binance monitor admin Telegram alert frequency was changed. The monitor still runs every minute; scanner, strategies, execution placement, Binance protection logic, intelligence, Telegram routing policy, and UI design were not changed.

## Problem

`binance-testnet-monitor` generated an admin Telegram event every minute while the monitor remained in the same degraded state. The event id included the current minute, so router-level dedupe could not suppress repeated identical degraded alerts.

## Fix

The monitor now stores the last sent Binance monitor admin alert state in `execution_settings.latest_monitor_alert_state`.

Stored fingerprint fields:

- `monitor_status`
- `severity`
- `critical_errors`
- `unsafe_positions`
- `affected_symbols`
- `latest_error_short`

## Send rules

The monitor sends an admin alert when one of these is true:

1. No previous Binance monitor admin alert state exists.
2. The fingerprint changes, including status, affected symbols, unsafe position count, critical error count, or latest short error.
3. Severity becomes critical.
4. The same degraded fingerprint repeats after 60 minutes.
5. The same critical fingerprint repeats after 10 minutes.
6. A healthy recovery occurs after the previous sent state was degraded or critical.

If the same fingerprint appears inside the cooldown window, Telegram send is skipped, but the monitor run and normal monitor DB writes continue.

## Cooldowns

| Severity | Repeat cooldown |
| --- | --- |
| Degraded | 60 minutes |
| Critical | 10 minutes |
| Healthy recovery | Send once when transitioning from degraded/critical to healthy |

## Files changed

- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/migrations/20260614110000_062_binance_monitor_alert_cooldown.sql`
- `reports/product/binance-monitor-alert-cooldown.md`

## Acceptance mapping

| Acceptance item | Implementation |
| --- | --- |
| Binance monitor still runs every minute | Cron schedule and monitor loop were not changed. |
| Admin does not receive repeated same degraded alert every minute | Same degraded fingerprint is skipped until the 60-minute cooldown expires. |
| Critical new problems still alert immediately | Fingerprint changes and severity escalation to critical bypass cooldown. |
| Recovery alert sends once | Healthy recovery sends only when the previous sent alert state was degraded or critical. |
| Monitor logs normally while Telegram is skipped | Cooldown returns before Telegram routing only; monitor DB writes are unchanged. |
