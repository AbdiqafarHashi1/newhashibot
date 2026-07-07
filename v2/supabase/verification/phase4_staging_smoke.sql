-- HashiBot Recovery Phase 4 staging smoke checks.
-- Run in the NEW Supabase staging SQL editor after Phase 2/3 migrations and seed.
-- This script is read-only except for no-op transaction metadata; it does not enable scanner or execution.

begin;

-- 1) Required V1 compatibility relations/views.
select 'relation_exists' as check_name, relname as object_name, relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and relname in (
    'symbols','signals','signal_updates','scanner_runs','scanner_config','provider_status',
    'strategy_candidates','telegram_deliveries','audit_logs','customer_subscriptions',
    'access_requests','telegram_links','customer_bot_setups','user_access','packages'
  )
order by relname;

-- 2) Required RPCs.
select 'rpc_exists' as check_name, p.proname as object_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'v1_compat_scanner_summary','v1_compat_monitoring_summary','v1_compat_table_size_report',
    'v2_recovery_cleanup','v2_record_operational_report','v2_install_recovery_cron_jobs',
    'no_admin_exists','v1_compat_page_matrix'
  )
order by p.proname;

-- 3) Scanner/execution must remain disabled for staging verification.
select 'scanner_disabled' as check_name, id, is_enabled, schedule_enabled, auto_send_telegram, cron_job_active
from public.v2_scanner_config
where id = 1;

select 'execution_disabled_setting' as check_name,
       coalesce((value->>'execution_enabled')::boolean, false) as execution_enabled
from public.system_settings
where key = 'customer_bootstrap';

-- 4) Compact monitoring functions should execute.
select 'monitoring_summary' as check_name, public.v1_compat_monitoring_summary() as result;
select 'page_matrix' as check_name, jsonb_agg(to_jsonb(m)) as result from public.v1_compat_page_matrix() m;
select 'table_size_report' as check_name, jsonb_agg(to_jsonb(r)) as result from public.v1_compat_table_size_report() r;
select 'cleanup_dry_run' as check_name, public.v2_recovery_cleanup(true) as result;

rollback;
