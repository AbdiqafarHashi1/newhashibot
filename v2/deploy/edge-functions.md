# Edge Function Deployment Package

Deploy with `supabase functions deploy <name> --project-ref <ref>`. Verify every function with an authenticated test request before proceeding.

| Function | Purpose | Required secrets | Required tables/RPCs | Verification request | Expected response | Failure modes | Retry guidance |
|---|---|---|---|---|---|---|---|
| `runtime-health` | Runtime health | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | monitoring tables | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" $FN/runtime-health` | JSON status healthy | Missing secret, DB unavailable | Fix secret/DB then retry |
| `queue-health` | Command queue health | Supabase secrets | `v2_command_queue` | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" $FN/queue-health` | queue metrics | Missing table | Run SQL #3 |
| `provider-health` | Provider connectivity | provider keys | provider registry | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" $FN/provider-health` | testnet statuses | Bad provider keys | Rotate keys and retry |
| `monitoring-summary` | Monitoring rollup | Supabase secrets | `v2_monitoring_summaries` | POST `{}` | summary id | RLS/RPC failure | Verify SQL #6/#9 |
| `platform-api` | Platform API | `PLATFORM_API_TOKEN` | foundation tables/RPCs | `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" $FN/platform-api/health` | API healthy | Unauthorized | Verify token |
| `telegram-platform` | Telegram delivery | Telegram tokens/chat IDs | telegram routes/templates/queue | POST `{"action":"health"}` | delivery subsystem healthy | Invalid token/chat | Rebind bots |
| `executor-heartbeat` | Executor heartbeat | Supabase secrets | executor tables | POST heartbeat JSON | accepted | Unknown executor | Bootstrap executor |
| `executor-start` | Start executor | Supabase secrets | executor and command queue | POST executor id | command queued | Duplicate command | Reuse idempotency key |
| `executor-pause` | Pause executor | Supabase secrets | executor tables | POST executor id | paused/queued | Invalid state | Refresh state |
| `executor-resume` | Resume executor | Supabase secrets | executor tables | POST executor id | resumed/queued | Invalid state | Refresh state |
| `executor-stop` | Stop executor | Supabase secrets | executor tables | POST executor id | stopped/queued | Active protection | Wait or force via ops |
| `executor-restart` | Restart executor | Supabase secrets | executor tables | POST executor id | restart queued | Queue unavailable | Retry after queue health |
| `executor-recovery` | Recovery orchestration | Supabase secrets | executor/monitoring | POST executor id | recovery plan | State mismatch | Re-run diagnostics |
| `bridge-register` | Register HashiBridge | `HASHIBRIDGE_SHARED_SECRET` | bridge tables | POST signed device | registered | Bad signature | Resign request |
| `bridge-heartbeat` | Bridge heartbeat | bridge secret | bridge device table | POST signed heartbeat | accepted | Clock drift | Sync clock/retry |
| `bridge-sync` | Bridge command sync | bridge secret | command queue | POST signed sync | command batch | Queue empty | Normal; poll later |
| `mt5-account-register` | Register MT5 demo | MT5 metadata | MT5 tables | POST account metadata | registered | Duplicate account | Verify existing record |
| `mt5-terminal-health` | MT5 terminal health | Supabase secrets | MT5 heartbeat tables | POST terminal heartbeat | accepted | Terminal unknown | Register account first |
| `mt5-recovery` | MT5 recovery | Supabase secrets | MT5/bridge/executor | POST account id | recovery action | Bridge offline | Restore bridge first |
| `research-lab` | Research Lab jobs | `RESEARCH_LAB_ENABLED` | research tables/storage | POST health/job | accepted | Disabled/storage missing | Enable and create bucket |

Use exponential backoff for transient 429/5xx responses: 1s, 2s, 4s, then stop and inspect logs.
