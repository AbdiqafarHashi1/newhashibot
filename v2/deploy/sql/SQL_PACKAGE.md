# SQL Execution Package

Run every migration against a fresh Supabase project in the listed order. Do not merge unrelated steps; stop and verify after each SQL.

| SQL | File | Purpose | Dependencies | Expected result | Verification query | Rollback guidance |
|---:|---|---|---|---|---|---|
| 1 | `20260705080000_v2_platform_base_fresh_project.sql` | Base schemas, extensions, core tables, initial RLS foundation | Empty Supabase project | Core V2 schema exists | `select to_regclass('public.v2_customers');` | Drop newly created V2 tables only if no production data exists |
| 2 | `20260705090000_v2_trade_truth_store.sql` | Trade Truth immutable ledger | SQL #1 | Trade truth tables/RPCs exist | `select to_regprocedure('public.record_trade_truth(jsonb)');` | Development only: drop trade truth objects before onboarding |
| 3 | `20260705100000_v2_command_queue_idempotency.sql` | Idempotent command queue | SQL #1-2 | Queue tables and idempotency constraints exist | `select to_regclass('public.v2_command_queue');` | Drain queue, then rollback constraints in reverse order |
| 4 | `20260705120000_platform_foundation.sql` | Roles, packages, approvals, platform API backing tables | SQL #1 | Foundation tables seeded | `select count(*) from public.v2_platform_packages;` | Remove seeded packages only before customers exist |
| 5 | `20260705130000_telegram_platform.sql` | Telegram routes, templates, queue | SQL #4 | Telegram routing operational | `select count(*) from public.v2_telegram_templates;` | Disable routes, drain queue, then rollback |
| 6 | `20260705180000_executor_manager_monitoring.sql` | Executor state and monitoring summaries | SQL #3-4 | Executor manager tables exist | `select to_regclass('public.v2_executor_instances');` | Stop executors, archive state, then rollback |
| 7 | `20260705200000_mt5_hashibridge.sql` | MT5/HashiBridge registration and heartbeat tables | SQL #6 | Bridge tables/RPCs exist | `select to_regclass('public.v2_hashibridge_devices');` | Unregister devices before rollback |
| 8 | `20260705210000_research_lab.sql` | Research Lab jobs/results | SQL #4 | Research Lab tables exist | `select to_regclass('public.v2_research_jobs');` | Archive research artifacts, then rollback |
| 9 | `20260705230000_production_hardening_retention.sql` | Retention, cleanup, archive, RLS hardening | SQL #1-8 | Production hardening policies installed | `select count(*) from pg_policies where schemaname='public' and tablename like 'v2_%';` | Roll back only with maintenance approval |

## Global RLS verification

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'v2_%'
order by tablename;
```

## RPC verification

```sql
select n.nspname, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'v2_%' or p.proname in ('record_trade_truth')
order by 1, 2;
```

## Seed verification

```sql
select 'packages' as seed, count(*) from public.v2_platform_packages
union all
select 'telegram_templates', count(*) from public.v2_telegram_templates;
```

## Health SQL

```sql
select now() as checked_at,
  (select count(*) from public.v2_command_queue where status = 'pending') as pending_commands,
  (select count(*) from public.v2_executor_instances where status in ('running','paused')) as executors,
  (select count(*) from public.v2_telegram_queue where status = 'pending') as pending_telegram;
```

## Monitoring SQL

```sql
select * from public.v2_monitoring_summaries order by created_at desc limit 20;
```
