# HashiBot Phase 3 End-to-End Runtime Repair

Status: bounded implementation, no deployment  
Date: 2026-07-14

## Files changed

- `supabase/functions/_shared/trade-truth/index.ts`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/bybit-testnet-monitor/index.ts`
- `src/lib/runtime/executionOrders/index.ts`
- `src/lib/runtime/monitor/index.ts`
- `src/lib/runtime/worker/index.ts`
- `src/lib/runtime/reporting/index.ts`
- `src/contexts/AuthContext.tsx`
- `src/hooks/useAdminLiveState.ts`
- `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract.sql`
- `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models.sql`
- `tests/runtime/phase3Static.test.ts`
- `docs/runbooks/HASHIBOT_RUNTIME_RESTORATION_RUNBOOK.md`

## Services created

- Edge-compatible Trade Truth adapter for Deno Edge Functions.
- Execution order contract normalizer/repository vocabulary.
- Runtime monitor observation engine.
- Worker lease/retry/fingerprint primitives.
- Reporting/Telegram idempotency helpers.

## Writers migrated

| Writer | Before | After |
|---|---|---|
| Binance execution Edge Function | direct `rpc("upsert_trade_management_truth")`, direct `from("trade_management_truth").upsert/update` | shared `_shared/trade-truth` adapter |
| Binance monitor Edge Function | direct `rpc("upsert_trade_management_truth")` | shared `_shared/trade-truth` adapter |
| Bybit monitor Edge Function | direct `rpc("upsert_trade_management_truth")` | shared `_shared/trade-truth` adapter |

Static tests assert the three high-risk Edge writers contain no direct trade truth RPC or table mutation outside the adapter.

## Duplicate owners removed or deprecated

- Provider-specific Edge Functions remain entrypoints, but their trade truth writes are routed through one adapter.
- Runtime verification primitives are centralized in `RuntimeMonitorEngine`.
- Worker overlap prevention is centralized in the lease abstraction.
- Reporting/Telegram idempotency is centralized in `ReportingPipeline` helpers.

## SQL migrations prepared

Prepared only; not executed:

- `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract.sql`
- `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models.sql`

The execution migration includes safe legacy status mapping, ambiguous-status reporting/blocking, a new execution-only check constraint, postflight checks, and rollback notes.

## Auth changes

- Temporary null sessions during refresh no longer immediately clear auth state.
- Last confirmed profile/admin role is preserved during transient session refresh interruption.
- Explicit sign-out still clears authentication immediately.
- A delayed confirmation check verifies whether a null session is persistent before clearing state.

## Page/query changes

- Admin live state no longer invokes the `market-scanner` Edge Function on page mount for runtime config inspection.
- Runtime config inspection is deferred to explicit operator action in a future command path.

## Reporting changes

- Added canonical runtime event and Telegram delivery idempotency helpers.
- Provider-specific metadata can feed events, but lifecycle truth is not mutated by reporting/Telegram delivery failure.

## Tests

- `npm run test:trade-truth`
- `npm run test:phase3-runtime`
- `npm run build`
- `npm run lint`
- `npm run typecheck` baseline/post comparison
- `git diff --check`

## Remaining risks

- Edge functions are not invoked in this phase; runtime parity must be proven in controlled restoration.
- Prepared SQL migrations require operator approval before execution.
- Repository-wide typecheck still has pre-existing unrelated failures.
- Full page consolidation remains a follow-up UI refactor; Phase 3 only removed the page-mount Edge Function call.
- Persistent distributed locks/idempotency require database-backed leases and event tables in a later migration.
