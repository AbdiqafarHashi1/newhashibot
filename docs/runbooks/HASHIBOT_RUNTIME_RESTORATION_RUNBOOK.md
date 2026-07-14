# HashiBot Runtime Restoration Runbook

Do not skip stages. Stop immediately if a stop condition is met.

| Stage | Enablement step | Stop conditions |
|---|---|---|
| 1 | Auth and read-only pages | unexpected logout, admin role downgrade, infinite loader, page-triggered runtime mutation |
| 2 | One manual scanner cycle | duplicate candidate writes, provider error storm, unexpected Telegram send |
| 3 | Scanner schedule | cron not explicitly approved, overlapping scanner run, stale lease not recovered |
| 4 | Outcome evaluator | duplicate outcome event, lifecycle mutation outside reporting/outcome path |
| 5 | Binance monitor | overlapping monitor run, direct trade truth write outside adapter, missing heartbeat |
| 6 | Binance demo/test execution | duplicate execution, unsupported execution status, missing idempotency key |
| 7 | Binance protection | missing SL/TP after verified, protection writes execution status |
| 8 | Bybit monitor | overlapping run, side/direction mismatch, stale truth storm |
| 9 | Bybit demo execution | duplicate execution, provider account mismatch, unsupported status |
| 10 | Bybit protection | missing SL/TP after verified, repair loop repeats structural failures |
| 11 | Recovery | non-retryable contract failure retried, stale lease blocks new worker |
| 12 | Runtime proof | certification failure, conflicting truth, orphan position |
| 13 | Telegram | duplicate delivery idempotency key, lifecycle truth mutated by delivery failure |
| 14 | Content jobs | runtime worker overlap, operational page mutation, unexpected provider request |
| 15 | Cleanup | deletes active truth, removes audit proof, disables rollback path |

## Final Cron Activation Addendum

All cron jobs installed by `20260714003000_final_cron_consolidation.sql` start disabled. Activate them manually, one at a time, only after the corresponding restoration stage passes.

| Activation order | Job | Gate | Stop conditions |
|---:|---|---|---|
| 1 | `hashibot_prod_scanner_5m` | Manual scanner cycle succeeds without duplicate candidates or Telegram sends. | duplicate candidates, provider storm, invalid scheduler idempotency, lease busy forever |
| 2 | `hashibot_prod_outcome_evaluator_5m` | Outcome evaluator dry run confirms no lifecycle drift. | unexpected signal status mutation, retry storm, stale truth mismatch |
| 3 | `hashibot_prod_binance_testnet_monitor_1m` | Binance monitor certification passes. | missing SL/TP, orphan positions, direct trade truth write, lease overlap |
| 4 | `hashibot_prod_bybit_demo_monitor_1m` | Bybit monitor certification passes. | provider parity mismatch, direct repair write, lease overlap |
| 5 | Optional content jobs | Content pipeline and Telegram delivery idempotency certified. | duplicate Telegram delivery, unauthorized response, lifecycle truth mutation |
| 6 | `hashibot_prod_runtime_cleanup_daily` | Runtime stable and cleanup dry run reviewed. | cleanup touches active runtime truth, unbounded batch, archive failure |

No legacy supervisor, repair, test, duplicate scanner, or runtime-proof cron should be re-enabled during restoration.
