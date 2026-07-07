-- HashiBot Recovery Phase 2 seed pack. Run after all v2/supabase/migrations in a fresh staging project.
-- This file intentionally seeds configuration only; it does not migrate V1 historical scanner/candle/log noise.

insert into public.roles(role_key, name, description) values
  ('owner','Owner','Full platform ownership'),
  ('admin','Admin','Operational administration'),
  ('customer','Customer','Customer access'),
  ('service_role','Service Role','Trusted backend runtime'),
  ('anonymous','Anonymous','Public read-only visitor')
on conflict (role_key) do update set name=excluded.name, description=excluded.description, updated_at=now();

insert into public.packages(package_code, name, description, price, currency, billing_period, package_type, signal_access, execution_access, telegram_access, account_limit, executor_limit, provider_permissions, sort_order, active) values
  ('free','Free','Community education and public sample signals',0,'KES','free','signal_only',true,false,false,0,0,'["binance","bybit"]',10,true),
  ('vip_signals','VIP Signals','Premium signal dashboard and VIP Telegram delivery',5000,'KES','monthly','signal_only',true,false,true,1,0,'["binance","bybit"]',20,true),
  ('vip_execution','VIP Execution','Managed execution visibility after approval',15000,'KES','monthly','managed_execution',true,true,true,3,1,'["binance","bybit","mt5"]',30,true)
on conflict (package_code) do update set name=excluded.name, description=excluded.description, price=excluded.price, updated_at=now();

insert into public.system_settings(key, value, is_public) values
  ('environment','{"environment":"staging","allow_dev_reset":true,"production_cutover":false}', false),
  ('retention','{"scanner_runs":"30 days","telegram_deliveries":"14 days","runtime_events":"30 days","provider_health_history":"30 days","execution_events":"90 days","audit_logs":"180 days","research_runs":"180 days"}', false),
  ('telegram_defaults','{"bot_secret_ref":"TELEGRAM_BOT_TOKEN","free_chat_secret_ref":"TELEGRAM_FREE_CHAT_ID","vip_chat_secret_ref":"TELEGRAM_VIP_CHAT_ID","admin_chat_secret_ref":"TELEGRAM_ADMIN_OPS_CHAT_ID"}', false),
  ('owner_bootstrap','{"instructions":"Create owner profile by auth_user_id after first owner signup; do not store passwords or API keys here."}', false),
  ('customer_bootstrap','{"default_package":"free","requires_manual_approval":true,"execution_enabled":false}', false)
on conflict (key) do update set value=excluded.value, is_public=excluded.is_public, updated_at=now();

insert into public.v2_scanner_config(id, is_enabled, schedule_enabled, auto_send_telegram, cron_job_active, heartbeat_status)
values (1, false, false, false, false, 'inactive')
on conflict (id) do update set is_enabled=false, schedule_enabled=false, auto_send_telegram=false, cron_job_active=false, heartbeat_status='inactive', updated_at=now();
