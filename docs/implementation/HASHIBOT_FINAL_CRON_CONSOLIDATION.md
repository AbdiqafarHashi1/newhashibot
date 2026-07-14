# HashiBot Final Cron Consolidation

## 1. Summary

This document defines the final disabled production scheduler that replaces legacy scanner, evaluator, provider monitor, supervisor, test, repair, and content cron definitions. No SQL is executed by this repository change, and all installed jobs in the prepared migration are explicitly disabled until certification.

Repository inventory found **19 distinct HashiBot cron job names** declared across migrations and admin guidance. The final scheduler proposes **9 canonical disabled jobs**: scanner, outcome evaluator, Binance monitor, Bybit monitor, four optional content jobs, and daily runtime cleanup.

## 2. Existing Cron Inventory and Classification

| Old job | Source evidence | Classification | Action | Replacement job | Final schedule | Target | Lease key | Certification gate | Activation order | Reason / risk if retained |
|---|---|---:|---|---|---|---|---|---|---:|---|
| `hashibot_scheduled_market_scanner_5m` | scanner migrations 012/014/035/036 | REBUILD | Unschedule and rebuild disabled | `hashibot_prod_scanner_5m` | `*/5 * * * *` | `scheduled-market-scanner` | `scanner:global` | `scanner_manual_cycle_certified` | 1 | Valid responsibility but legacy auth/header patterns and duplicate rebuilds exist. |
| `hashibot_evaluate_signal_outcomes_5m` | migration 035/036 | REBUILD | Unschedule and rebuild disabled | `hashibot_prod_outcome_evaluator_5m` | `2-59/5 * * * *` | `evaluate-signal-outcomes` | `outcome-evaluator:global` | `outcome_evaluator_certified` | 2 | Valid responsibility but must be offset from scanner and use canonical scheduler identity. |
| `hashibot_binance_testnet_monitor_1m` | migrations 039/044/045/067 | REBUILD | Unschedule and rebuild disabled | `hashibot_prod_binance_testnet_monitor_1m` | `* * * * *` | `binance-testnet-monitor` | `monitor:binance:testnet` | `binance_monitor_certified` | 3 | Valid provider monitor but legacy definitions use inconsistent auth and overlap with supervisor jobs. |
| `hashibot_bybit_testnet_monitor_1m` | migrations 050/060 | DELETE | Unschedule/delete | `hashibot_prod_bybit_demo_monitor_1m` | `* * * * *` | `bybit-testnet-monitor` | `monitor:bybit:demo` | `bybit_monitor_certified` | 4 | Testnet/demo naming drift creates duplicate Bybit monitor ownership. |
| `hashibot_bybit_demo_monitor_1m` | migration 079 | REBUILD | Unschedule and rebuild disabled | `hashibot_prod_bybit_demo_monitor_1m` | `* * * * *` | `bybit-testnet-monitor` | `monitor:bybit:demo` | `bybit_monitor_certified` | 4 | Valid provider monitor but must be canonical and disabled. |
| `hashibot_trade_supervisor_1m_binance` | migration 080 | DELETE | Unschedule/delete | none | n/a | n/a | n/a | n/a | n/a | Duplicate supervisor ownership; RuntimeMonitor + RecoveryService own observations/repairs. |
| `hashibot_trade_supervisor_1m_bybit` | migration 080 | DELETE | Unschedule/delete | none | n/a | n/a | n/a | n/a | n/a | Duplicate supervisor ownership; RuntimeMonitor + RecoveryService own observations/repairs. |
| `hashibot_morning_brief_0800_eat` | migration 063 | DELETE | Unschedule/delete | `hashibot_prod_content_morning_brief_0800_eat` | `0 5 * * *` | `telegram-orchestrator` | `content:morning-brief` | `content_pipeline_certified` | 8 | Legacy EAT suffix duplicate of later production job. |
| `hashibot_news_digest_1200_eat` | migration 063 | DELETE | Unschedule/delete | `hashibot_prod_content_news_digest_1200_eat` | `0 9 * * *` | `telegram-orchestrator` | `content:news-digest` | `content_pipeline_certified` | 9 | Legacy EAT suffix duplicate of later production job. |
| `hashibot_watchlist_patterns_1600_eat` | migration 063 | DELETE | Unschedule/delete | `hashibot_prod_content_watchlist_1600_eat` | `0 13 * * *` | `telegram-orchestrator` | `content:watchlist-patterns` | `content_pipeline_certified` | 10 | Legacy EAT suffix duplicate of later production job. |
| `hashibot_market_wrap_2000_eat` | migration 063 | DELETE | Unschedule/delete | `hashibot_prod_content_market_wrap_2000_eat` | `0 17 * * *` | `telegram-orchestrator` | `content:market-wrap` | `content_pipeline_certified` | 11 | Legacy EAT suffix duplicate of later production job. |
| `hashibot_morning_brief_0800` | migrations 064/066/067 | KEEP DISABLED | Rebuild disabled as optional content | `hashibot_prod_content_morning_brief_0800_eat` | `0 5 * * *` | `telegram-orchestrator` | `content:morning-brief` | `content_pipeline_certified` | 8 | Optional content; keep disabled until product/certification approval. |
| `hashibot_news_digest_1200` | migrations 064/066/067 | KEEP DISABLED | Rebuild disabled as optional content | `hashibot_prod_content_news_digest_1200_eat` | `0 9 * * *` | `telegram-orchestrator` | `content:news-digest` | `content_pipeline_certified` | 9 | Optional content; keep disabled until product/certification approval. |
| `hashibot_watchlist_patterns_1600` | migrations 064/066/067 | KEEP DISABLED | Rebuild disabled as optional content | `hashibot_prod_content_watchlist_1600_eat` | `0 13 * * *` | `telegram-orchestrator` | `content:watchlist-patterns` | `content_pipeline_certified` | 10 | Optional content; keep disabled until product/certification approval. |
| `hashibot_market_wrap_2000` | migrations 064/066/067 | KEEP DISABLED | Rebuild disabled as optional content | `hashibot_prod_content_market_wrap_2000_eat` | `0 17 * * *` | `telegram-orchestrator` | `content:market-wrap` | `content_pipeline_certified` | 11 | Optional content; keep disabled until product/certification approval. |
| `hashibot_test_morning_brief_1m` | migrations 064/066/067/068 | DELETE | Unschedule/delete | none | n/a | n/a | n/a | n/a | n/a | Test-only one-minute content spam risk. |
| `hashibot_test_news_digest_1m` | migrations 064/066/067/068 | DELETE | Unschedule/delete | none | n/a | n/a | n/a | n/a | n/a | Test-only one-minute content spam risk. |
| `hashibot_test_watchlist_patterns_1m` | migrations 064/066/067/068 | DELETE | Unschedule/delete | none | n/a | n/a | n/a | n/a | n/a | Test-only one-minute content spam risk. |
| `hashibot_test_market_wrap_1m` | migrations 064/066/067/068 | DELETE | Unschedule/delete | none | n/a | n/a | n/a | n/a | n/a | Test-only one-minute content spam risk. |

## 3. Final Canonical Job Set

| Canonical job | Responsibility | Schedule | Target | Lease key | Max runtime | Retry behavior | Idempotency key | Initially disabled | Gate |
|---|---|---|---|---|---:|---|---|---|---|
| `hashibot_prod_scanner_5m` | Market scanner | `*/5 * * * *` | Edge: `scheduled-market-scanner` | `scanner:global` | 240s | No pg_cron retry; worker/service bounded retries only | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | manual scanner cycle certified |
| `hashibot_prod_outcome_evaluator_5m` | Outcome evaluator | `2-59/5 * * * *` | Edge: `evaluate-signal-outcomes` | `outcome-evaluator:global` | 180s | Structural errors non-retryable | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | evaluator certified |
| `hashibot_prod_binance_testnet_monitor_1m` | Binance RuntimeMonitor adapter | `* * * * *` | Edge: `binance-testnet-monitor` | `monitor:binance:testnet` | 55s | Monitor/recovery classify retries | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | Binance provider certification |
| `hashibot_prod_bybit_demo_monitor_1m` | Bybit RuntimeMonitor adapter | `* * * * *` | Edge: `bybit-testnet-monitor` | `monitor:bybit:demo` | 55s | Monitor/recovery classify retries | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | Bybit provider certification |
| `hashibot_prod_content_morning_brief_0800_eat` | Optional content | `0 5 * * *` | Edge: `telegram-orchestrator` | `content:morning-brief` | 120s | Telegram pipeline dedupes delivery | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | content pipeline certified |
| `hashibot_prod_content_news_digest_1200_eat` | Optional content | `0 9 * * *` | Edge: `telegram-orchestrator` | `content:news-digest` | 120s | Telegram pipeline dedupes delivery | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | content pipeline certified |
| `hashibot_prod_content_watchlist_1600_eat` | Optional content | `0 13 * * *` | Edge: `telegram-orchestrator` | `content:watchlist-patterns` | 120s | Telegram pipeline dedupes delivery | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | content pipeline certified |
| `hashibot_prod_content_market_wrap_2000_eat` | Optional content | `0 17 * * *` | Edge: `telegram-orchestrator` | `content:market-wrap` | 120s | Telegram pipeline dedupes delivery | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | content pipeline certified |
| `hashibot_prod_runtime_cleanup_daily` | Data retention / cleanup | `30 2 * * *` | RPC: `hashibot_cleanup_noncritical` | `cleanup:runtime` | 300s | Bounded batch; no pg_cron retry loop | `scheduler:<job>:<YYYYMMDDHH24MI>` | yes | cleanup certified after runtime stable |

Telegram lifecycle/reporting delivery is event-driven where possible and is not scheduled as a recurring lifecycle cron. Runtime proof is manual or low-frequency certification and is not scheduled every minute. MT5 monitor jobs are future-only and are not created because active MT5 monitor implementations are not present.

## 4. Authorization Design

The prepared SQL requires two Vault secrets before installation:

- `HASHIBOT_PROJECT_URL`
- `HASHIBOT_SERVICE_ROLE_KEY`

The canonical cron command stores only `SELECT public.hashibot_scheduler_dispatch('<job_name>');`. The dispatcher reads secrets from `vault.decrypted_secrets` at runtime, sends `Content-Type: application/json`, `apikey: <service role key>`, and `Authorization: Bearer <service role key>`, and applies a bounded `timeout_milliseconds` based on each job's maximum runtime. Raw keys are not embedded in `cron.job.command`.

## 5. Installation Order

1. Run read-only preflight in `20260714003000_final_cron_consolidation.sql`.
2. Confirm Vault secrets and runtime safety RPCs exist.
3. Confirm all legacy jobs are disabled or acceptable to unschedule.
4. Run forward consolidation.
5. Run postflight verification.
6. Do not enable any job until the activation gate for that job passes.

## 6. Activation Order

1. Enable `hashibot_prod_scanner_5m` only after manual scanner certification.
2. Enable `hashibot_prod_outcome_evaluator_5m` after scanner proof and evaluator certification.
3. Enable `hashibot_prod_binance_testnet_monitor_1m` after Binance monitor certification.
4. Enable `hashibot_prod_bybit_demo_monitor_1m` after Bybit monitor certification.
5. Keep Telegram/reporting lifecycle event-driven; no lifecycle cron is enabled.
6. Enable optional content jobs only after content product certification.
7. Enable `hashibot_prod_runtime_cleanup_daily` last, after runtime has remained stable and retention cleanup dry run passes.

## 7. Stop Conditions

Stop before forward migration if any of these conditions exist:

- `pg_cron`, `pg_net`, or Vault is unavailable.
- `HASHIBOT_PROJECT_URL` or `HASHIBOT_SERVICE_ROLE_KEY` is missing from Vault.
- Runtime safety RPCs are not installed.
- Active legacy jobs are still intentionally running for a controlled observation window.
- Any cron job command uses a target that is not classified in this document.
- SQL reviewer rejects service-role HTTP invocation from the scheduler dispatcher.

Stop after forward migration if postflight finds:

- duplicate HashiBot job names,
- any canonical job active,
- legacy supervisor/test jobs still present,
- canonical jobs missing lease keys,
- raw secrets or malformed authorization in `cron.job.command`, or
- duplicate non-content canonical targets.

## 8. Rollback Procedure

The rollback section of the prepared SQL unschedules the new canonical jobs through `cron.unschedule`, removes their scheduler metadata, restores backed-up legacy definitions through `cron.schedule`, and disables each restored job through `cron.alter_job` after a read-only `cron.job` lookup. It never reactivates legacy jobs. Any later enablement requires explicit operator approval.
