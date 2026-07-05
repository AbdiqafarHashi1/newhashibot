# HashiBot V2 Final Platform Hardening Audit

## Repository validation
All hardening work is contained under `/v2`. The root legacy application is not modified.

## Subsystem audit
| Subsystem | Classification | Why |
| --- | --- | --- |
| Platform Foundation | Needs hardening completed | Core tables, roles, packages, customers, subscriptions, settings, and audit helpers exist. Final pass adds compact monitoring, retention, dev reset, and least-privilege operational controls. |
| Telegram | Needs optimization completed | Event routing and delivery logs exist. Retention now limits queues/logs and archive keeps compact metadata only. Production UI must show empty states unless real queue/log rows exist. |
| Executor Manager | Needs security/performance hardening completed | Runtime/actions/health exist. Final pass adds compact summaries, reset guards, stale heartbeat summary, and retention for old actions/events. |
| Monitoring | Needs optimization completed | Monitoring tables exist. Final pass exposes compact summary RPC/API instead of large datasets and adds retention windows. |
| Trade Truth | Already production ready with retention guard | Immutable truth store exists; reset only applies to non-production/test data workflow and does not change trading logic. |
| Command Queue | Needs retention completed | Queue/idempotency tables exist; final pass adds cleanup/reset handling for old queue/idempotency records. |
| Platform API | Needs hardening completed | Action surface exists. Final pass adds monitoring summary, retention cleanup, and admin/owner dev reset actions. |
| Research Lab | Needs storage optimization completed | Research runs/reports/certifications exist. API rejects raw candle/tick traces and retention archives compact records. |
| HashiBridge / MT5 | Needs retention/monitoring completed | Bridge/terminal tables exist. Final pass includes compact MT5/bridge summary counts and bridge log retention. |
| Notifications | Needs retention completed | Notifications are persisted customer actions; final pass adds 180-day retention. |
| Audit Logs | Already production ready with archive | Audit is retained longest and archived compactly after retention. |
| Settings | Already production ready | System settings remain protected and are never deleted by default reset. |
| Engine Events | Needs storage optimization completed | Engine events are persisted only for signal/trade/customer/audit-relevant events; retention removes old operational events. |
| Runtime | Needs optimization completed | Runtime cache remains in memory; DB writes are limited to actions, heartbeats, health, and compact metrics. |
| Customer Accounts / Credentials | Needs security hardening completed | Credential references only; secret-shaped keys are sanitized from API logs/responses. Reset does not delete credential references. |
| Customer Preferences | Already production ready | Preferences persist customer choices only. |
| Subscriptions / Packages | Already production ready | Reset excludes active subscriptions and packages by default. |
| Roles / Permissions | Already production ready | Existing operator helpers enforce admin/owner/service access. |
| System Settings | Already production ready | Environment setting controls production reset guard. |

## Retention and archive windows
| Data | Window | Archive |
| --- | ---: | --- |
| Audit logs | 365 days | Compact archive after window |
| Notifications | 180 days | Compact archive after window |
| Engine events | 90 days | Compact archive after window |
| Runtime health/events | 30 days | Compact archive after window |
| Telegram queue | 14 days | Compact archive after window |
| Telegram delivery logs | 90 days | Compact archive after window |
| Runtime/provider/queue metrics | 30 days | Compact archive after window |
| Bridge logs | 30 days | Compact archive after window |
| Research runs | 180 days | Compact archive after window |
| Research reports | 365 days | Compact archive after window |
| Shadow summaries/results | 90 days | Compact archive after window |
| Executor events/runtime actions | 90 days | Compact archive after window |

## Storage and egress policy
Do not persist candles, indicators, websocket frames, scan-loop traces, repeated writes, duplicated events, duplicated logs, large JSON payloads, or massive dashboard datasets. Persist only signals/engine events, trade state/truth, subscriptions, customer actions, audit events, notifications, research summaries/reports, system settings, and certifications.

## Monitoring API summaries
The platform exposes a compact `monitoring_summary` action backed by `v2_compact_monitoring_summary()`. It returns runtime, executor, provider, queue, telegram, customer, subscription, MT5, research, health, and dashboard summary objects without large row arrays.

## UI wiring and empty-state rule
Production mode defaults to real Platform API calls and empty read models. Mock/demo data is available only when `mode: 'mock'` is explicitly configured. Professional empty states must render instead of fake activity when no backend rows exist.

## Dev reset safety
`dev_reset` requires admin/owner role, confirmation phrase `RESET HASHIBOT V2 NONPROD`, defaults to dry-run, refuses production unless explicitly allowed by `system_settings`, and blocks active runtime reset unless owner force is supplied. It does not delete users, customers, packages, roles, permissions, system settings, credential references, or active subscriptions by default.

## Remaining deployment gaps
Deployment still requires Supabase project creation, environment variables, secret provisioning, Telegram bot registration, exchange/MT5 certification, and live deployment planning.
