# HashiBot SQL Deploy and Restore Runbook

This runbook covers only the prepared SQL migrations under `supabase/migrations/prepared/`. It is a review and execution guide; the repository changes do **not** execute SQL, deploy Edge Functions, enable cron, or change environments.

## 1. Scope and Execution Order

Run the migrations in this exact order after SQL review and backup completion:

1. `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract.sql`
2. `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models.sql`
3. `supabase/migrations/prepared/20260714002000_final_runtime_safety.sql`

Each file is split into four labelled sections:

1. Read-only preflight.
2. Forward migration.
3. Postflight verification.
4. Rollback / down procedure.

## 2. Maintenance Window and Locking Notes

* Schedule a maintenance window before running the forward sections.
* Keep cron, scanners, monitors, supervisors, recovery workers, Telegram delivery workers, and Edge runtime restoration disabled until postflight passes.
* The execution-order migration takes a `SHARE UPDATE EXCLUSIVE` lock on `public.execution_orders` while replacing status constraints and mapping safe statuses.
* `NOT VALID` constraints are used where appropriate before validation to reduce lock risk, but `VALIDATE CONSTRAINT` still requires planning for production load.
* Runtime-safety table creation and function replacement should be brief, but must still be executed when backend workers are stopped to avoid mixed contracts.

## 3. Backup / Export Requirements

Before any forward migration:

* Export `public.execution_orders`, including `id`, `status`, and `updated_at`.
* Export `public.trade_management_truth` and the definitions of any existing admin read-model views.
* Export any existing `runtime_worker_leases`, `runtime_event_idempotency`, and `runtime_incidents` tables if present.
* Export `pg_constraint` rows for `public.execution_orders` where `pg_get_constraintdef(oid, true) ILIKE '%status%'`.
* Save the read-only preflight outputs with the deployment record.

## 4. Read-Only Preflight First

Run only Section 1 from all three SQL files first. Do not run any `BEGIN` / forward sections until every stop condition below is cleared.

### 4.1 Execution Orders Stop Conditions

Stop if any of the following is true:

* `public.execution_orders` is missing.
* `id`, `status`, or `updated_at` is missing.
* Any `status` row is `NULL`.
* Any status is not already canonical and not listed in the safe legacy mapping table.
* The ambiguous-row preflight query returns `NULL_STATUS` or `AMBIGUOUS_UNMAPPED_STATUS`.
* The discovered constraints are not understood, including but not limited to `execution_orders_status_xf4_check`.

The migration discovers actual constraints through `pg_constraint` and preserves every status-related check definition before replacement.

### 4.2 Runtime Read Models Stop Conditions

Stop if any of the following is true:

* `public.trade_management_truth` or `public.execution_orders` is missing.
* Required `id` or `status` columns are missing from either table.
* Existing admin views have definitions that cannot be safely replaced or restored.
* Telegram delivery schema does not support the selected idempotency index and no fallback health index is acceptable.

Active trades are defined by canonical or legacy lifecycle state plus confirmed closure fields, not by `protection_status != 'closed'`.

### 4.3 Runtime Safety Stop Conditions

Stop if any of the following is true:

* Existing runtime safety tables contain incompatible column types.
* Existing functions have incompatible signatures that callers still depend on.
* The backend role that should call RPCs is not `service_role` or is not explicitly approved.
* Security review rejects `SECURITY DEFINER` RPCs even with `SET search_path = public, pg_temp`.

## 5. Forward Execution Procedure

For each migration, run Section 2 only after its preflight passes.

1. Execute the execution-order forward migration.
2. Run its postflight and confirm unsupported status rows = `0` and exactly one status check is active.
3. Execute the runtime read-model forward migration.
4. Run its postflight and confirm views return bounded results and grants exclude `PUBLIC` and `anon`.
5. Execute the final runtime-safety forward migration.
6. Run its postflight and confirm tables, constraints, policies, RPC security, and grants are correct.

## 6. Postflight Queries

Use each SQL file’s Section 3. Minimum pass requirements:

* `execution_orders.status` has no `NULL` or unsupported values.
* `execution_orders.status` is `NOT NULL` and guarded by the canonical execution-only check constraint.
* Read-model views use `security_invoker=true`, preserve RLS semantics, and expose only intended grants.
* Runtime safety tables have RLS enabled and service-role-only policies.
* Runtime safety RPCs are `SECURITY DEFINER`, use `SET search_path = public, pg_temp`, and grant execute only to `service_role`.
* Optional staging concurrency examples prove two different runs cannot hold the same lease simultaneously.

## 7. Safe Rollback Decision Points

Rollback should be considered only before runtime restoration or immediately after a failed postflight.

### 7.1 Execution Orders Rollback

Use Section 4 of `20260714000000_phase3_execution_orders_contract.sql` only if:

* postflight shows unsupported statuses,
* the new constraint blocks known-good application writes, or
* application code is not ready for execution-only status values.

The rollback restores prior constraint definitions from `public.phase3_execution_orders_status_constraint_backup` and reverses row mappings from `public.phase3_execution_orders_status_mapping_audit`.

### 7.2 Runtime Read Models Rollback

Use Section 4 of `20260714001000_phase3_runtime_read_models.sql` if:

* admin views fail to compile,
* grants are incorrect,
* RLS behavior differs from expectations, or
* query plans are unacceptable.

The rollback restores prior view definitions from `public.phase3_read_model_view_backup` where they existed and drops only the indexes/views created by the prepared migration.

### 7.3 Runtime Safety Rollback

Use Section 4 of `20260714002000_final_runtime_safety.sql` if:

* RPC grants or RLS policies fail review,
* lease acquisition behavior is incorrect,
* idempotency collision handling is incorrect, or
* incident grouping produces unexpected results.

The rollback is non-destructive: it drops safety RPCs, revokes grants, and archives populated runtime safety tables by renaming them. Permanent deletion requires a separate operator confirmation and data-loss approval.

## 8. Runtime Restoration Gate

Do not proceed to controlled runtime restoration until all SQL postflight checks pass and the application build matching these migrations has been reviewed. Runtime restoration must then follow `docs/runbooks/HASHIBOT_RUNTIME_RESTORATION_RUNBOOK.md`.

## 9. Explicit Non-Actions

This runbook does not deploy application code, invoke live Edge Functions, enable cron, modify provider credentials, change strategy logic, change risk logic, or execute production SQL automatically.

## 10. Final Cron Consolidation SQL

After the execution-order, read-model, and runtime-safety migrations pass postflight, review `supabase/migrations/prepared/20260714003000_final_cron_consolidation.sql`.

### 10.1 Read-Only Preflight

Run only Section 1 first. Stop if:

* `pg_cron`, `pg_net`, or Vault is unavailable.
* `HASHIBOT_PROJECT_URL` or `HASHIBOT_SERVICE_ROLE_KEY` is absent from `vault.decrypted_secrets`.
* Runtime safety RPCs are missing.
* Unknown HashiBot cron jobs appear that are not classified in `docs/implementation/HASHIBOT_FINAL_CRON_CONSOLIDATION.md`.
* Legacy jobs are still intentionally active for an observation window.

### 10.2 Forward Consolidation

Run Section 2 only after preflight passes. The forward procedure backs up all existing HashiBot cron rows, unschedules legacy/test/supervisor jobs, installs canonical scheduler metadata, creates the backend-only scheduler dispatcher, and installs canonical cron rows with `active = false`.

### 10.3 Postflight

Run Section 3 and confirm:

* no duplicate HashiBot job names,
* every canonical job exists exactly once,
* every canonical job is disabled,
* no legacy supervisor/test jobs remain,
* no `cron.job.command` embeds raw Authorization, anon keys, cron tokens, or direct `net.http_post`, and
* every canonical runtime job has a lease key.

### 10.4 Rollback

Use Section 4 only if postflight fails or SQL review rejects the new scheduler. Rollback unschedules canonical jobs and restores backed-up legacy definitions as disabled. It must not be followed by enabling restored jobs without explicit operator approval.

## 11. Operator-Safe SQL Execution Files

Do not execute the full prepared migration files directly during production rollout. Use the two-file helper workflow documented in `docs/runbooks/HASHIBOT_SQL_EXECUTION_SEQUENCE.md`:

1. Run each migration's `01_preflight.sql` helper.
2. Stop and review output.
3. Run that migration's `02_apply_and_verify.sql` helper only after approval.
4. Use rollback sections only from the original full prepared migration files and only for emergencies.

The original prepared migration files remain the complete references. The helper files exist only to reduce operator error during production execution.
