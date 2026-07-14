# HashiBot SQL Execution Sequence

Use the operator-safe execution helper files, not the full prepared migration files.

## Non-Negotiable Rules

- Never execute the full prepared migration directly.
- Never skip `01_preflight.sql`.
- Review every preflight result and STOP condition before running `02_apply_and_verify.sql`.
- Rollback remains inside the original full prepared migration and is used only for emergencies.
- Do not run rollback unless an operator explicitly approves it after a failed postflight or emergency review.

## Production Execution Order

### 1. Execution Orders

1. Run `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/01_preflight.sql`.
2. STOP and review all discovery, validation, ambiguous-row, status-count, and constraint-discovery output.
3. Run `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/02_apply_and_verify.sql` only after preflight is approved.
4. If emergency rollback is required, use only the rollback section inside `supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract.sql`.

### 2. Runtime Read Models

1. Run `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models/01_preflight.sql`.
2. STOP and review referenced tables, referenced columns, prior view definitions, and all stated STOP conditions.
3. Run `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models/02_apply_and_verify.sql` only after preflight is approved.
4. If emergency rollback is required, use only the rollback section inside `supabase/migrations/prepared/20260714001000_phase3_runtime_read_models.sql`.

### 3. Runtime Safety

1. Run `supabase/migrations/prepared/20260714002000_final_runtime_safety/01_preflight.sql`.
2. STOP and review existing runtime safety tables, existing functions, schema compatibility, and all stated STOP conditions.
3. Run `supabase/migrations/prepared/20260714002000_final_runtime_safety/02_apply_and_verify.sql` only after preflight is approved.
4. If emergency rollback is required, use only the rollback section inside `supabase/migrations/prepared/20260714002000_final_runtime_safety.sql`.

### 4. Cron Consolidation

1. Run `supabase/migrations/prepared/20260714003000_final_cron_consolidation/01_preflight.sql`.
2. STOP and review extension availability, Vault secret presence, existing cron rows, last run results, duplicates, invalid authorization patterns, and deprecated targets.
3. Run `supabase/migrations/prepared/20260714003000_final_cron_consolidation/02_apply_and_verify.sql` only after preflight is approved.
4. If emergency rollback is required, use only the rollback section inside `supabase/migrations/prepared/20260714003000_final_cron_consolidation.sql`.

## Verification Expectations

- Every `01_preflight.sql` file is read-only and contains no `BEGIN`, `COMMIT`, `CREATE`, `ALTER`, `UPDATE`, `DELETE`, or `INSERT` statements.
- Every `02_apply_and_verify.sql` file contains the forward migration and postflight verification only.
- Rollback SQL exists only in the original full prepared migration files.
- The helper files are copied from the original prepared migrations for execution safety; they are not independent migrations.
