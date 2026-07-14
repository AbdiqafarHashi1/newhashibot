# HASHIBOT all prepared migrations preflight reconciliation

Date: 2026-07-14. Scope: repository-only reconciliation of the four prepared migrations. No SQL was executed.

## Migration 1 — execution order status reconciliation

Canonical execution statuses remain: `created`, `submitted`, `accepted`, `partially_filled`, `filled`, `cancel_requested`, `cancelled`, `rejected`, `expired`, `failed`, `unknown_provider_state`.

| Legacy status | Source file | Source function/context | Meaning | Classification | Canonical replacement | Automatic migration safe? | Reason |
|---|---|---|---|---|---|---|---|
| `pending` | `src/lib/runtime/executionOrders/index.ts` | `LEGACY_EXECUTION_STATUS_MAP` | pre-submit execution row | execution lifecycle | `created` | YES | execution-only pre-provider state |
| `entry_pending` | repository migrations/reports | legacy entry request pending | entry not submitted | execution lifecycle | `created` | YES | equivalent to created request |
| `new` | prepared helper | `safe_legacy` | new order | execution lifecycle | `created` | YES | execution-only alias |
| `placed` | prepared helper | `safe_legacy` | provider request placed/submitted | execution lifecycle | `submitted` | YES | execution submit alias |
| `entry_submitted` | `src/lib/runtime/executionOrders/index.ts` | `LEGACY_EXECUTION_STATUS_MAP` | entry submitted to provider | execution lifecycle | `submitted` | YES | execution-only submit state |
| `submitted` | `src/lib/runtime/executionOrders/index.ts` | canonical/legacy adapter | submitted | execution lifecycle | `submitted` | YES | already canonical |
| `open` | prepared helper | `safe_legacy` | provider accepted/working order | execution lifecycle | `accepted` | YES | open order means provider accepted |
| `working` | prepared helper | `safe_legacy` | provider working order | execution lifecycle | `accepted` | YES | active provider order |
| `entry_accepted` | `src/lib/runtime/executionOrders/index.ts` | `LEGACY_EXECUTION_STATUS_MAP` | provider accepted entry | execution lifecycle | `accepted` | YES | execution-only acceptance |
| `partial` | prepared helper | `safe_legacy` | partial fill | execution lifecycle | `partially_filled` | YES | exact canonical equivalent |
| `partially_filled` | canonical | canonical status | partial fill | execution lifecycle | `partially_filled` | YES | already canonical |
| `complete` | prepared helper | `safe_legacy` | filled/completed | execution lifecycle | `filled` | YES | execution completion alias |
| `completed` | prepared helper | `safe_legacy` | filled/completed | execution lifecycle | `filled` | YES | execution completion alias |
| `entry_filled` | `src/lib/runtime/executionOrders/index.ts` | `LEGACY_EXECUTION_STATUS_MAP` | entry filled | execution lifecycle | `filled` | YES | execution-only fill state |
| `filled` | canonical | canonical status | filled | execution lifecycle | `filled` | YES | already canonical |
| `entry_timeout_cancelled` | `src/lib/runtime/executionOrders/index.ts` | `LEGACY_EXECUTION_STATUS_MAP` | timed-out entry cancelled | execution lifecycle | `cancelled` | YES | cancellation outcome for unfilled entry |
| `canceled` | prepared helper | `safe_legacy` | US spelling cancelled | execution lifecycle | `cancelled` | YES | spelling alias |
| `cancelled` | canonical | canonical status | cancelled | execution lifecycle | `cancelled` | YES | already canonical |
| `rejected` | canonical | canonical status | provider rejected | execution lifecycle | `rejected` | YES | already canonical |
| `expired` | canonical | canonical status | provider expired | execution lifecycle | `expired` | YES | already canonical |
| `entry_missing_no_position` | `src/lib/runtime/executionOrders/index.ts` | `LEGACY_EXECUTION_STATUS_MAP` | no position found for expected entry | recovery | `expired` | YES | safely terminal for entry execution; no protection/outcome meaning retained |
| `failed` | canonical | canonical status | execution failed | execution lifecycle | `failed` | YES | already canonical |
| `error` | prepared helper | `safe_legacy` | execution error | execution lifecycle | `failed` | YES | terminal failure alias |
| `unknown` | prepared helper | `safe_legacy` | unknown provider state | monitoring | `unknown_provider_state` | YES | preserves uncertainty in canonical execution bucket |
| `skipped` | provider execution proof reports and Edge Function responses | setup/auto-disabled skip paths | provider execution intentionally skipped | obsolete/reporting | none | NO | skip reason is not provider execution lifecycle |
| `closed_synced` | `supabase/functions/binance-testnet-execution/index.ts` | strict reconciliation update | DB row synced closed from exchange truth | monitoring/trade lifecycle | none | NO | mixes monitor sync and closed trade outcome |
| `protected_native` | `src/lib/runtime/executionOrders/index.ts`; `binance-testnet-execution` | protection verification | native SL/TP protected | protection | none | NO | protection state, not execution status |
| `protected_managed` | repository reports/functions | managed fallback protection | protection | protection | none | NO | protection mode, not execution lifecycle |
| `pending_protection` | reports/functions | protection awaiting placement | protection | none | NO | protection lifecycle |
| `protection_pending` | `binance-testnet-execution` active statuses | protection awaiting placement | protection | none | NO | protection lifecycle |
| `pending_managed_protection` | reports/functions | managed protection pending | protection | none | NO | protection lifecycle |
| `protection_failed` | reports/functions | protection failed | protection | none | NO | safety-critical failure must be manually classified |
| `protection_recovered` | `binance-testnet-execution` active statuses | protection repaired | recovery | none | NO | recovery/protection state |
| `partially_closed` | `src/lib/runtime/executionOrders/index.ts` | ambiguous legacy adapter | trade partially exited | trade lifecycle | none | NO | exit/trade lifecycle, not order execution |
| `closed_tp` | `telegram-test` and reports | take-profit close | trade lifecycle | none | NO | trade outcome |
| `closed_tp2` | reports/tests | final TP2 close | trade lifecycle | none | NO | trade outcome |
| `closed_sl` | reports/tests | stop-loss close | trade lifecycle | none | NO | trade outcome |
| `closed_profit_lock` | reports/tests | profit-lock close | trade lifecycle | none | NO | trade outcome |
| `closed_timeout` | reports/tests | timeout close | trade lifecycle | none | NO | trade outcome |
| `closed_expired` | reports/tests | expired trade close | trade lifecycle | none | NO | trade outcome |
| `closed_manual` | reports/tests | manual close | trade lifecycle | none | NO | trade outcome |
| `stale_closed` | reports/tests | stale DB row closed | monitoring/recovery | none | NO | reconciliation state |
| `repair_succeeded` | docs/contracts and function recovery status | repair successful | recovery | none | NO | recovery status belongs outside execution order status |
| `monitor_synced` | docs/contracts | monitor synchronized | monitoring | none | NO | monitor state belongs outside execution order status |

Safe mappings added to Migration 1 helpers: `entry_pending→created`, `entry_submitted→submitted`, `submitted→submitted`, `entry_accepted→accepted`, `entry_filled→filled`, `entry_timeout_cancelled→cancelled`, and `entry_missing_no_position→expired`. Ambiguous protection, monitoring, recovery, reporting, and trade-lifecycle statuses continue to block preflight/apply.

## Migration 2 — compatibility matrix

| Object | Required? | Compatibility handling | Stop condition |
|---|---:|---|---|
| `trade_management_truth` | YES | views and active index require `id`, `status`, `provider`, `environment`, `symbol`, `latest_sync_at` | missing table or required columns |
| `execution_orders` | YES | execution read model and recent-status index require `id`, `status`, `updated_at` | missing table or required columns |
| Optional lifecycle fields | NO | accessed through `to_jsonb(row)->>'field'` so missing optional fields do not break views | none |
| `telegram_deliveries` | NO | delivery health view/index created only if table exists; idempotency unique index selected by available key column | none for absence; required only when operator expects delivery health view |
| `runtime_incidents` | NO for Migration 2 | discovered for operator visibility; runtime safety migration owns creation | none |
| Admin read-model grants | least privilege | helper now grants read models to `service_role` only and revokes `PUBLIC`, `anon`, `authenticated` | authenticated/admin access requires separate reviewed policy |

## Migration 3 — compatibility matrix

| Object | Classification | Compatibility handling | Stop condition |
|---|---|---|---|
| `runtime_worker_leases` absent | SAFE TO CREATE | creates table, indexes, constraints, RLS, service-role policy | none |
| `runtime_worker_leases` compatible | SAFE TO REUSE | additive columns/indexes only | invalid existing rows fail constraint validation |
| `runtime_worker_leases` populated with incompatible key column types | INCOMPATIBLE | hard guard raises before additive upgrade | incompatible populated object |
| `runtime_event_idempotency` absent | SAFE TO CREATE | creates table, indexes, constraints, RLS, service-role policy | none |
| `runtime_event_idempotency` compatible | SAFE TO REUSE | additive columns/indexes only | invalid existing rows fail constraint validation |
| `runtime_event_idempotency` populated with incompatible key column types | INCOMPATIBLE | hard guard raises before additive upgrade | incompatible populated object |
| `runtime_incidents` absent | SAFE TO CREATE | creates table, indexes, constraints, RLS, service-role policy | none |
| `runtime_incidents` compatible | SAFE TO REUSE | additive columns/indexes only | invalid severity/status rows fail validation |
| `runtime_incidents` populated with incompatible key column types | INCOMPATIBLE | hard guard raises before additive upgrade | incompatible populated object |
| Existing runtime RPCs | REQUIRES OPERATOR REVIEW | `CREATE OR REPLACE FUNCTION` updates implementations after table compatibility gate | review signatures/ownership in preflight output |

## Migration 4 — compatibility matrix

| Job/responsibility | Schedule | Target | Auth/Vault | Lease | Dispatcher target | Classification |
|---|---|---|---|---|---|---|
| scanner | `*/5 * * * *` | `scheduled-market-scanner` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `scanner:global` | Edge HTTP via dispatcher | REBUILD disabled |
| outcome evaluator | `*/5 * * * *` | `evaluate-signal-outcomes` | same | `outcome-evaluator:global` | Edge HTTP via dispatcher | REBUILD disabled |
| Binance monitor | `* * * * *` | `binance-testnet-monitor` | same | `monitor:binance:testnet` | Edge HTTP via dispatcher | REBUILD disabled |
| Bybit monitor | `* * * * *` | `bybit-testnet-monitor` | same | `monitor:bybit:demo` | Edge HTTP via dispatcher | REBUILD disabled |
| content morning brief | `0 5 * * *` | `telegram-orchestrator` | same | content-specific dispatcher/idempotency | Edge HTTP via dispatcher | REBUILD disabled |
| content news digest | `0 9 * * *` | `telegram-orchestrator` | same | content-specific dispatcher/idempotency | Edge HTTP via dispatcher | REBUILD disabled |
| content watchlist | `0 13 * * *` | `telegram-orchestrator` | same | content-specific dispatcher/idempotency | Edge HTTP via dispatcher | REBUILD disabled |
| content market wrap | `0 17 * * *` | `telegram-orchestrator` | same | content-specific dispatcher/idempotency | Edge HTTP via dispatcher | REBUILD disabled |
| runtime cleanup | daily | `hashibot_cleanup_noncritical` | none beyond DB function | `cleanup:runtime` | DB function | REBUILD disabled |
| legacy trade supervisor jobs | legacy 1m | `run_trade_supervisor_cycle` | old patterns | none/legacy | deprecated | DELETE |
| test 1-minute content jobs | 1m | content test targets | old patterns | none/legacy | duplicate/test | DELETE |
| malformed cron-token/anon/scanner-secret jobs | any | any HashiBot target | invalid | varies | duplicate/unsafe | DELETE |

Forward migration must block if runtime safety RPCs, pg_cron/pg_net/vault extensions, Vault secrets, dispatcher, or lease/idempotency RPC prerequisites are missing. Canonical jobs are installed disabled; enabling remains an operator action outside this reconciliation.

## Remaining manual decisions and stop conditions

Manual decisions: all non-execution statuses listed with `Automatic migration safe? NO`, any missing required Migration 2 schema, any populated incompatible runtime safety object, and any cron prerequisite failure or unexpected duplicate responsibility not covered by the delete/rebuild list.

Stop conditions:
1. Migration 1 preflight/apply finds `NULL_STATUS` or `AMBIGUOUS_UNMAPPED_STATUS`.
2. Migration 2 apply finds missing required `trade_management_truth` or `execution_orders` columns.
3. Migration 3 apply finds populated runtime safety tables with incompatible key column types or invalid existing rows.
4. Migration 4 preflight/apply finds missing extensions, Vault secrets, dispatcher, runtime safety RPCs, or deprecated supervisor target after consolidation.

## Exact rerun order

1. `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/01_preflight.sql`
2. Resolve every unsafe status manually outside this prepared migration if the preflight returns blockers.
3. `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/02_apply_and_verify.sql`
4. `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models/01_preflight.sql`
5. Resolve required-schema blockers if any.
6. `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models/02_apply_and_verify.sql`
7. `supabase/migrations/prepared/20260714002000_final_runtime_safety/01_preflight.sql`
8. Resolve incompatible populated runtime object blockers if any.
9. `supabase/migrations/prepared/20260714002000_final_runtime_safety/02_apply_and_verify.sql`
10. `supabase/migrations/prepared/20260714003000_final_cron_consolidation/01_preflight.sql`
11. Resolve Vault/extension/dispatcher/RPC blockers if any.
12. `supabase/migrations/prepared/20260714003000_final_cron_consolidation/02_apply_and_verify.sql`
