# HASHIBOT PHASE 1: PLATFORM HARDENING & STORAGE COST CONTROL
## DEPLOYMENT, RECOVERY, & VERIFICATION PLAN

This document contains the comprehensive catalog, migration procedures, rollback scripts, and verification checklists for the HashiBot Phase 1 platform hardening deployment.

---

## 1. Environment Variables Catalog

To control database storage, egress fees, and API call limits, ensure the following environment variables are configured.

| Variable Name | Description | Default Value | Target Environment | Importance |
| :--- | :--- | :--- | :--- | :--- |
| `HASHIBOT_DISABLE_CANDLE_PERSISTENCE` | Gates saving raw OHLCV candles to the database. | `"true"` | Supabase Edge Functions | **Critical Cost Control** (Reduces write volume by ~90%) |
| `HASHIBOT_DISABLE_INDICATOR_SNAPSHOTS`| Gates saving raw indicator snapshots to the database. | `"true"` | Supabase Edge Functions | **Critical Cost Control** (Reduces write volume by ~90%) |
| `HASHIBOT_COMPACT_SCANNER_LOGS` | Gates retaining rejected candidate setups in storage. | `"true"` | Supabase Edge Functions | **Critical Cost Control** (Deletes unsuccessful candidates at the end of runs) |
| `SCANNER_MAX_SYMBOLS_PER_SCAN` | Caps the number of symbols scanned dynamically in a single run. | `15` | Supabase Edge Functions | **API Rate-Limit / Egress Control** |

---

## 2. Safe Database Migration Process (089 to 090)

The database schema updates use migrations `089` (retention & storage cleanup) and `090` (symbol universe configuration & execution lifecycle events).

### Phase 1 Pre-migration Checklist:
1. Confirm Supabase production credentials are saved in a secure repository.
2. Ensure there are no active executions or critical open trades that rely on unmigrated schema states.
3. Apply migration `089` first to establish storage retention RPC routines, followed by `090`.

### Applying Migrations via CLI:
```bash
# Connect using the Supabase CLI and apply pending migrations
supabase db push
```

---

## 3. Database Recovery & Storage Rollback Procedures

### Rollback SQL Script
If you encounter any operational regressions, run the following SQL statements in the Supabase SQL Editor to clean up or rollback the Phase 1 schema changes.

```sql
-- ROLLBACK FOR MIGRATION 090
DROP FUNCTION IF EXISTS hashibot_execution_summary() CASCADE;
DROP TABLE IF EXISTS hashibot_execution_lifecycle_events CASCADE;
DROP TABLE IF EXISTS hashibot_symbol_universes CASCADE;

-- ROLLBACK FOR MIGRATION 089
DROP FUNCTION IF EXISTS hashibot_cleanup_noncritical(boolean, boolean) CASCADE;
DROP FUNCTION IF EXISTS hashibot_retention_report() CASCADE;
DROP TABLE IF EXISTS hashibot_retention_archive CASCADE;
DROP TABLE IF EXISTS hashibot_retention_policies CASCADE;

-- RE-ENABLE TRADITIONAL COMPATIBILITY IF REQUIRED
-- UPDATE symbols SET is_active = true WHERE market_type = 'crypto';
```

### Recovery from Storage Table Corruption
If any non-critical storage tables (`candles`, `indicator_snapshots`, or `strategy_candidates`) suffer from indexing bloating or corrupted states:
1. Run the safe, business-protected retention RPC with `execute` mode to prune stale data:
   ```sql
   SELECT hashibot_cleanup_noncritical(p_execute := true, p_archive := false);
   ```
2. If necessary, safely truncate the non-critical tables. **Never truncate profiles, packages, signals, or subscriptions.**
   ```sql
   TRUNCATE TABLE candles;
   TRUNCATE TABLE indicator_snapshots;
   TRUNCATE TABLE strategy_candidates;
   ```

---

## 4. Verification & Testing Checklists

### A. Verify Scanner Cost & Egress Reductions
- [ ] **Symbols Count Check**: Verify that when the scanner runs, it scans exactly 15 symbols (as configured by the capped `max_symbols_per_scan`) instead of the traditional ~80.
- [ ] **Candle Storage Verification**: Check the `candles` table after a scanner run. If `HASHIBOT_DISABLE_CANDLE_PERSISTENCE` is `"true"`, no new rows should have been added.
- [ ] **Indicator Storage Verification**: Check the `indicator_snapshots` table. Under default settings, no new indicator states should persist.
- [ ] **Compact Setup Log Verification**: Check the `strategy_candidates` table. Only candidates with status `converted_to_signal` should be stored permanently. Rejected candidates should be deleted instantly at the end of the run.

### B. Verify Admin Dashboard Performance
- [ ] **Page Queries Audit**: Load the **Audit Logs** and **Telegram Logs** pages. Confirm that pagination is active (limited to 50 records) and loads instantly.
- [ ] **Network Egress Verification**: Use the Browser DevTools Network tab to verify that the returned JSON payload from `/rest/v1/strategy_candidates` or `/rest/v1/audit_logs` contains only requested column values instead of full `select('*')` responses.
- [ ] **Retention Page Integrations**: Open the **Platform Retention** admin panel. Verify that clicking **Dry run** calculates potential prunes accurately, and that the page loads the compact runtime summary without errors.
