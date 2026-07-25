# HashiBot Production Runtime, Customer Security & Execution Audit

## Executive Summary
This audit and completion record certifies the HashiBot customer portal authorization framework, RLS data isolation, and always-on production runtime scheduling, scanning, execution, protection, reconciliation, and cleanup.

---

## 1. Customer Entitlement, Payment & Portal Audit

### Security & Authorization Defect Corrected
- **Issue**: `public.get_customer_entitlements(p_user_id uuid)` previously evaluated arbitrary `p_user_id` inputs via `SECURITY DEFINER` without verifying if the caller was the target user or an administrator.
- **Fix**: Updated `get_customer_entitlements` in migration `20260725120000_customer_security_and_runtime_hardening.sql`. For non-administrator callers, `v_target_user_id` is strictly locked to `auth.uid()`. Customer A cannot inspect Customer B's subscription, payment status, package, or expiry date.

### Row Level Security (RLS) Isolation
Applied and verified RLS policies enforcing `customer_id = auth.uid()` or `user_id = auth.uid()` across all customer tables:
- `public.customer_subscriptions`
- `public.access_requests`
- `public.customer_bot_setups`
- `public.connected_execution_accounts`
- `public.execution_orders`
- `public.trade_management_truth`
- `public.mt5_accounts`
- `public.execution_event_logs`

### Entitlement Capabilities Mapping
| Package Slug | Signal Access | Crypto Automation | MT5 Personal | MT5 Prop | Bot Setup |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `free_preview` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `crypto_signal_room` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `crypto_personal_bot` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `forex_mt5_personal_bot` | ✅ | ❌ | ✅ | ❌ | ✅ |
| `forex_mt5_prop_bot` | ✅ | ❌ | ❌ | ✅ | ✅ |

### Pre-Certification UI States
Portals reflect honest pre-connection and certification states:
- `configured`: Customer setup submitted.
- `awaiting_bridge`: MT5 bridge agent pending connection.
- `awaiting_account_sync`: Initial account snapshot sync pending.
- `certification_pending`: Verification checks running.
- `active`: Live automated protection enabled.

---

## 2. Production Cron Jobs Audit

The 9 canonical `pg_cron` jobs installed in disabled state:

| Job Name | Schedule | Target | Lease Key | Activation Gate |
| :--- | :--- | :--- | :--- | :--- |
| `hashibot_prod_scanner_5m` | `*/5 * * * *` | Edge Function: `scheduled-market-scanner` | `scanner:global` | `scanner_manual_cycle_certified` |
| `hashibot_prod_outcome_evaluator_5m` | `2-59/5 * * * *` | Edge Function: `evaluate-signal-outcomes` | `outcome-evaluator:global` | `outcome_evaluator_certified` |
| `hashibot_prod_binance_testnet_monitor_1m` | `* * * * *` | Edge Function: `binance-testnet-monitor` | `monitor:binance:testnet` | `binance_monitor_certified` |
| `hashibot_prod_bybit_demo_monitor_1m` | `* * * * *` | Edge Function: `bybit-testnet-monitor` | `monitor:bybit:demo` | `bybit_monitor_certified` |
| `hashibot_prod_content_morning_brief_0800_eat` | `0 5 * * *` | Edge Function: `telegram-orchestrator` | `content:morning-brief` | `content_pipeline_certified` |
| `hashibot_prod_content_news_digest_1200_eat` | `0 9 * * *` | Edge Function: `telegram-orchestrator` | `content:news-digest` | `content_pipeline_certified` |
| `hashibot_prod_content_watchlist_1600_eat` | `0 13 * * *` | Edge Function: `telegram-orchestrator` | `content:watchlist-patterns` | `content_pipeline_certified` |
| `hashibot_prod_content_market_wrap_2000_eat` | `0 17 * * *` | Edge Function: `telegram-orchestrator` | `content:market-wrap` | `content_pipeline_certified` |
| `hashibot_prod_runtime_cleanup_daily` | `30 2 * * *` | RPC: `hashibot_cleanup_noncritical` | `cleanup:runtime` | `retention_cleanup_certified_after_runtime_stable` |

---

## 3. Responsibility Matrix

| Responsibility | Trigger Source | Writer | Canonical Owner | Cadence | Idempotency & Overlap Protection |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Market Scanner** | `pg_cron` dispatch | Edge Function | Shared Scanner | 5 min | Lease `scanner:global` + closed-candle deduplication |
| **Outcome Evaluator** | `pg_cron` dispatch | Edge Function | Outcome Evaluator | 5 min | Lease `outcome-evaluator:global` + terminal status locks |
| **Binance Protection** | `pg_cron` dispatch | Edge Function | Binance Testnet Monitor | 1 min | Lease `monitor:binance:testnet` + order/position truth locks |
| **Bybit Protection** | `pg_cron` dispatch | Edge Function | Bybit Demo Monitor | 1 min | Lease `monitor:bybit:demo` + position state locks |
| **MT5 Command Execution** | Polling | MT5 Windows Agent | Local MT5 Agent | 5-10 sec | `mt5_commands` queue with atomic claim (`claimed_at`) |
| **Telegram Events** | Event-driven | Edge Function | Telegram Orchestrator | Immediate | `runtime_record_event_idempotency` deduplication keys |
| **Runtime Cleanup** | `pg_cron` dispatch | RPC | `hashibot_cleanup_noncritical` | Daily | Lease `cleanup:runtime` + bounded batch size (500 rows) |

---

## 4. Locked Architecture & Canonical Owners

1. **Shared Scanner**: One shared scanner evaluates Crypto and Forex strategies. Forex closures are handled gracefully without stopping Crypto scans.
2. **Signal Truth**: Signals are immutable once written. Outcome evaluation is idempotent and preserves terminal states (`TP1`, `TP2`, `STOP_LOSS`, `EXPIRED`).
3. **Execution Routing**: Single-consumer atomic claiming for execution intents. MT5 execution enqueues commands in `mt5_commands`; the Windows MT5 Agent is the sole command consumer.
4. **Provider Protection**: Binance and Bybit monitors own position protection and reconciliation for their respective exchange environments.
5. **Customer Isolation**: All reads/writes strictly bound by `customer_id` or `user_id` matching `auth.uid()`.

---

## 5. Deployment & Activation Stages

```text
Stage 0 — Apply DB migrations & deploy Edge Functions code
Stage 1 — Verify Vault secrets and runtime truth RPCs
Stage 2 — Synchronize connected account metadata
Stage 3 — Activate Binance / Bybit monitors in observe-only mode
Stage 4 — Activate Outcome Evaluator
Stage 5 — Activate Shared Scanner in signal-only mode
Stage 6 — Enable Telegram & customer event dispatchers
Stage 7 — Enable Binance testnet automated execution
Stage 8 — Enable Bybit demo automated execution
Stage 9 — Install & connect Windows MT5 Agent bridge
Stage 10 — Certify Forex MT5 personal & prop execution
```

---

## 6. Activation & Rollback SQL

### Activation SQL (Manual Operator Execution)
```sql
-- Enable Market Scanner
SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname = 'hashibot_prod_scanner_5m';

-- Enable Outcome Evaluator
SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname = 'hashibot_prod_outcome_evaluator_5m';

-- Enable Binance Testnet Monitor
SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname = 'hashibot_prod_binance_testnet_monitor_1m';

-- Enable Bybit Demo Monitor
SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname = 'hashibot_prod_bybit_demo_monitor_1m';

-- Enable Daily Runtime Cleanup
SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname = 'hashibot_prod_runtime_cleanup_daily';
```

### Rollback SQL (Emergency Deactivation)
```sql
-- Disable all HashiBot cron jobs immediately
SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname ILIKE 'hashibot%';
```

---

## 7. Verification & Confirmation

- **Lint**: PASSED (`npm run lint` — 0 errors)
- **Compile**: PASSED (`compile_applet` build succeeded)
- **Customer Security & Entitlement Tests**: PASSED (`npm run test:customer-security`)
- **Cron Consolidation Tests**: PASSED (`npm run test:final-cron`)

### Operational Declarations
1. No cron job was enabled.
2. No SQL was executed against production.
3. No Edge Function was deployed.
4. No live or demo account was connected.
5. No order was placed.
6. Strategies were not retuned and profitability logic was left untouched.
