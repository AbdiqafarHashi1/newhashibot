# Monitor Timestamp Parity Fix

## 1. Monitor write source

Canonical monitor source of truth is `execution_settings.latest_monitor_run_at`.

`binance-testnet-monitor` writes:

| Table | Column | Meaning |
| --- | --- | --- |
| `execution_settings` | `latest_monitor_run_at` | Canonical latest monitor invocation timestamp. |
| `execution_settings` | `latest_account_state_at` | Account snapshot fetch timestamp; written from the same `monitorRunAt` value for parity. |
| `execution_settings` | `latest_sync_time` | Monitor/account sync timestamp; written from the same `monitorRunAt` value. |
| `execution_settings` | `latest_monitor_status` | Monitor health classification (`healthy`, `degraded`, `critical_error`, `skipped`). |
| `execution_settings` | `latest_monitor_result` | JSON monitor result payload, including counters and reconciliation summary. |
| `execution_settings` | `latest_monitor_error` | Latest operator-visible monitor error text. |
| `execution_settings` | `latest_sync_error` | Latest operator-visible sync error text. |

The monitor also writes per-row status/error fields in `execution_orders`, but those are not monitor clocks.

## 2. Execution UI read source

| UI Field | DB Column | Table |
| --- | --- | --- |
| Execution Last Run | `latest_monitor_run_at` | `execution_settings` |
| Monitor Truth | `latest_monitor_run_at`, `latest_account_state_at`, `latest_monitor_status`, `latest_monitor_result`, `latest_monitor_error`, `latest_sync_error` | `execution_settings` |
| Truth Reason | Same `execution_settings` fields via `getMonitorTruth` | `execution_settings` |

## 3. Performance UI read source

| UI Field | DB Column | Table |
| --- | --- | --- |
| Monitor Critical Status | `latest_monitor_run_at`, `latest_account_state_at`, `latest_monitor_status`, `latest_monitor_result`, `latest_monitor_error`, `latest_sync_error` | `execution_settings` |
| Bot health monitor timestamp context | `latest_monitor_run_at` | `execution_settings` |

## 4. Exact parity break found

Case D: multiple operational clocks existed in practice because account-state updates could occur independently while the monitor clock was only persisted inside a broad `execution_settings` snapshot update.

The broad monitor snapshot update included many non-clock columns and did not check its Supabase update error. If any non-clock column was rejected by the deployed schema/cache, Cron could still show a successful Edge Function invocation while `execution_settings.latest_monitor_run_at` stayed at the old value. The UI correctly read `execution_settings.latest_monitor_run_at`, so it displayed the stale 02:37 timestamp while Supabase Cron showed the newer 06:50/06:54 run.

## 5. Files changed

- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/_shared/intelligence-engine.ts`
- `reports/product/monitor-timestamp-parity-fix.md`

## 6. Before vs after timestamps

| Source | Before | After |
| --- | --- | --- |
| Supabase Cron | 06:50/06:54 succeeded | Recent Cron run succeeds. |
| DB source of truth | `execution_settings.latest_monitor_run_at` could remain 02:37 if broad snapshot persistence failed. | `execution_settings.latest_monitor_run_at`, `latest_account_state_at`, and `latest_sync_time` are persisted from one `monitorRunAt` value. |
| Execution UI | Last Run 02:37 and stale truth. | Last Run reads the same `execution_settings.latest_monitor_run_at`. |
| Performance UI | Monitor Critical Status stale from the same old timestamp. | Monitor Critical Status uses `getMonitorTruth` against the same canonical timestamp. |

## 7. Proof plan for deployment

After deployment, validate with:

1. Supabase Cron job `hashibot_binance_testnet_monitor_1m` shows the latest scheduled run succeeded.
2. Query `execution_settings` row `id = 1` and confirm `latest_monitor_run_at` is within normal execution delay tolerance of Cron Last Run.
3. Execution UI Last Run equals `execution_settings.latest_monitor_run_at`.
4. Performance UI Monitor Critical Status is not stale when the canonical timestamp is recent.
5. `latest_account_state_at` and `latest_sync_time` match the same monitor run timestamp unless the monitor failed before account fetch.

## News feed fix

The news feed previously required `CRYPTO_NEWS_API_URL`; when unset it reported `provider_not_configured`. The intelligence engine now uses `CRYPTO_NEWS_API_URL` when configured and falls back to CryptoCompare public crypto news when no explicit provider URL is configured. This restores real headline availability without generating fake news.
