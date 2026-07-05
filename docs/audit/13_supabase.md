# 13 Supabase Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 has a large incremental migration history with core tables, scanner config, telegram links, execution orders, packages/subscriptions, provider status, runtime events, trade management, cron jobs, RLS/security fixes. Classification: REWRITE fresh baseline.
- V1 relies on pg_cron/net and Edge Functions for scheduled scanner/monitor execution. Classification: REWRITE for V2 services; use Supabase schedules only for maintenance/cleanup/light jobs.
- Direct frontend queries to operational tables increase coupling. V2 should use purpose-built views/RPCs/API endpoints and RLS by customer/role.

## V2 schema guidance
Keep durable events and snapshots: signals, signal_events, trades, trade_events, commands, command_events, customer_accounts, executors, subscriptions, approvals, audit_logs, certification_records, telegram_deliveries.
