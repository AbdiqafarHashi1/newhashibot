# HashiBot Recovery Phase 2 — Backend Foundation for V1 Frontend

## Architecture

```text
V1 production frontend
  -> V1 compatibility contracts (views + RPC summaries)
    -> V2 durable backend tables/services
      -> New Supabase project
```

The frontend contract is intentionally V1-shaped, while the stored data is V2-shaped. Supabase is durable persistence only. Runtime market data, open candles, indicators, loop traces, heartbeat spam, and debug payloads must stay outside durable tables.

## Compatibility contracts implemented

### Views

- `public.symbols` -> `public.v2_symbols`
- `public.signals` -> `public.v2_approved_signals`
- `public.signal_updates` -> `public.v2_signal_events`
- `public.scanner_runs` -> `public.v2_scanner_runs`
- `public.scanner_config` -> `public.v2_scanner_config`
- `public.provider_status` -> latest rows from `public.v2_provider_health_history`
- `public.strategy_candidates` -> empty compatibility surface; V2 does not persist rejected scanner candidates by default
- `public.telegram_deliveries` -> `public.telegram_delivery_logs` plus queue/channel context
- `public.audit_logs` -> `public.audit_log`

### RPCs

- `public.v1_compat_scanner_summary()` returns compact scanner proof, active symbol count, and 24-hour signal/run counts.
- `public.v1_compat_monitoring_summary()` returns compact scanner, execution, Telegram, provider, runtime, queue, trade, and health summaries.
- `public.v1_compat_table_size_report()` returns approximate row counts and retention policies.
- `public.v2_recovery_cleanup(p_dry_run boolean)` archives and deletes rows by the recovery retention windows.

## Cleanup jobs

- `v2_recovery_cleanup(true)` performs retention dry-runs and records cleanup audit history.
- `v2_record_operational_report('table_size')` records compact table-size reports.
- `v2_record_operational_report('storage')` records storage policy reports proving runtime market storage remains disabled.
- `v2_record_operational_report('egress')` records dashboard egress policy reports.
- `v2_record_operational_report('weekly_archive')` records weekly archive dry-runs.
- `v2_install_recovery_cron_jobs()` installs dry-run/reporting cron schedules only; production deletion stays disabled until cutover approval.

## Retention policies

| Data class | Retention | Archive before delete |
|---|---:|---|
| Scanner runs | 30 days | Yes |
| Telegram queue/logs | 14 days | Yes |
| Runtime compact events | 30 days | Yes |
| Provider health history | 30 days | Yes |
| Execution command events | 90 days | Yes |
| Audit logs | 180 days | Yes |
| Research runs | 180 days | Yes |

## V1 table classification

| V1 table/surface | Class | Decision |
|---|---|---|
| `profiles` | Must migrate | Required for auth/profile compatibility; map to V2 profiles/customers. |
| `user_access` | Must migrate | Convert active access into V2 subscriptions/package entitlement. |
| `packages` | Seed fresh | Packages are small config and should be seeded cleanly. |
| `customer_subscriptions` | Must migrate active only | Move active/current subscriptions; archive expired historical noise. |
| `access_requests` | Archive | Keep for audit; do not make it runtime state. |
| `customer_bot_setups` | Must migrate active only | Move current approved setup metadata only. |
| `telegram_links` | Must migrate active only | Move active Telegram identity/preferences; archive old rejected links. |
| `symbols` | Seed fresh | Use clean V2 symbol universe. |
| `candles` | Archive | Never migrate into production runtime tables. |
| `indicator_snapshots` | Delete/archive | Runtime indicators must stay in memory. |
| `scanner_config` | Seed fresh | Start disabled in staging/new Supabase. |
| `scanner_runs` | Archive | Keep compact recent proof only if needed; do not migrate history. |
| `strategy_candidates` | Archive | Rejected/raw candidates are scanner noise. |
| `signals` | Must migrate active/recent approved only | Approved customer-visible signals move to `v2_approved_signals`. |
| `signal_updates` | Must migrate recent customer-visible only | Move meaningful lifecycle events only. |
| `provider_status` | Seed fresh | New provider health starts clean. |
| `telegram_deliveries` | Archive/recent migrate | Keep only recent customer-visible delivery proof if needed. |
| `audit_logs` | Must migrate required window | Move compliance/customer-impacting audit facts. |
| `execution_orders` | Must migrate open only | Convert to `v2_trade_truth` and command history where needed. |
| `execution_event_logs` | Archive | Move meaningful 90-day lifecycle events only; archive debug noise. |
| `operator_runtime_events` | Archive | Replace with compact summaries. |
| `intelligence_events` | Archive summaries | Move only report/analytics summaries. |
| `replay_datasets` | Archive externally | Do not store raw research payloads in production runtime DB. |

## SQL execution order

1. Apply all migrations in `v2/supabase/migrations` in timestamp order.
2. Apply `20260706090000_v1_frontend_compat_backend_foundation.sql` after the platform, Telegram, execution, research, and retention migrations.
3. Run `v2/supabase/seed-docs/recovery_phase2_seed.sql`.
4. Run `select public.v1_compat_monitoring_summary();`.
5. Run `select * from public.v1_compat_table_size_report();`.
6. Run `select public.v2_recovery_cleanup(true);` as dry-run proof.
7. Run `select public.v2_install_recovery_cron_jobs();` in staging only to install dry-run/reporting jobs.
8. Only after validation, convert cleanup dry-runs to approved cleanup/archive operations.

## Environment switch order

1. Keep production V1 environment unchanged.
2. Create staging env vars for the new Supabase URL and anon key.
3. Configure service-role secrets only in Supabase Edge Function secrets.
4. Validate V1 frontend against staging compatibility contracts.
5. Disable old staging cron jobs before enabling new staging cron jobs.
6. After sign-off, schedule production cutover window.
7. Switch production env vars to the new Supabase only during cutover.
8. Keep old Supabase read-only for rollback.

## Rollback plan

1. Keep old V1 Supabase untouched and read-only during cutover.
2. Keep old production env var values documented in the deployment vault.
3. If auth, signals, subscriptions, Telegram, scanner proof, or execution verification fails, revert env vars to old V1 Supabase.
4. Disable new cron jobs immediately after rollback.
5. Archive failed cutover audit facts in `platform_cleanup_runs`/`audit_log`.

## Remaining blockers

- Live Supabase table sizes/egress must be measured in the dashboard before final migration sizing.
- V1 frontend still contains direct table calls; compatibility views cover the core names, but high-risk admin pages should move to RPC summaries before production cutover.
- Live execution must remain disabled until command queue, reconciliation, and provider adapters pass testnet validation.
- Actual owner/customer bootstrap requires real auth user IDs and must be run manually in staging/production.


## Phase 3 staging compatibility verification matrix

| Area | Status | Compatibility contract |
|---|---|---|
| Login/auth | Pass by contract | `profiles`, `no_admin_exists()` |
| Admin dashboard | Pass by contract | `v1_compat_monitoring_summary()`, `scanner_runs`, `scanner_config`, `provider_status` |
| Customer dashboard | Pass by contract | `customer_subscriptions`, `access_requests`, `telegram_links`, `customer_bot_setups`, `signals` |
| Packages | Pass by contract | V1 package columns added to `packages` |
| Subscriptions/access | Pass by contract | `customer_subscriptions`, `user_access` |
| Signals | Pass by contract | `signals`, `signal_updates` |
| Scanner config | Pass by contract | `scanner_config`; scanner remains disabled by seed/default |
| Provider status | Pass by contract | `provider_status` latest compact provider health |
| Telegram pages | Pass by contract | `telegram_links`, `telegram_deliveries` |
| Monitoring summaries | Pass by contract | `v1_compat_monitoring_summary()`, `v1_compat_page_matrix()` |
| Staging deployment | Blocked in this workspace | No Supabase staging URL/service-role credentials are present in the environment. |
| Browser verification | Blocked in this workspace | Cannot point a staging V1 copy at the new project without staging credentials. |

Phase 3 adds `20260706110000_v1_frontend_staging_compatibility_expansion.sql`, which closes the static V1 query gaps found in customer package/access/Telegram pages while keeping scanner and execution disabled.
