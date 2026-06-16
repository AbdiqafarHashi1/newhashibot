# Bybit Always-On Monitor

Status: implemented as `supabase/functions/bybit-testnet-monitor` and scheduled by `hashibot_bybit_testnet_monitor_1m`.

The monitor is testnet-only, authenticates with internal cron/admin auth, syncs wallet balance, open linear USDT positions, open orders, provider control health, execution row lifecycle, protection status, recovery/profit-lock proof flags, last monitor run, health, and latest error. Debug buttons remain manual diagnostics only.

Decision: BYBIT MONITOR READY: YES, pending deployed secrets and cron availability in the target Supabase project.
