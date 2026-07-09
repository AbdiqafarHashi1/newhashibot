# HASHIBOT PHASE 4.9B — EXECUTE OPERATOR TRUTH AUDIT FIXES
**Purposed-Based Implementation Checklist & Audit Resolution Trail**

---

## 1. REMOVE / ISOLATE SIMULATED RUNTIME TRUTH
- [ ] Audit `src/lib/supabase.ts` and `src/lib/hashibotBackend.ts` to ensure development mocks are isolated behind `import.meta.env.DEV` or `isSupabaseMocked` flags.
- [ ] Disable dynamic mock trade row injections in non-development modes.
- [ ] Ensure `DEMO_MODE` defaults to `false` in production.
- [ ] Prevent client-side `localStorage` from being treated as the runtime source-of-truth for exchange positions or provider statuses.
- [ ] Ensure that if real Supabase/Binance/Bybit connections are unavailable, pages output `UNKNOWN`, `NO DATA`, `NOT CONFIGURED`, or `ACTION REQUIRED` rather than default static "healthy" messages.

## 2. CUSTOMER SAAS FLOW AUTOMATION
- [ ] Verify that approval of packages executes a unified multi-table transaction or sequential SQL/RPC logic updating:
  - `access_requests` (status = 'approved')
  - `customer_subscriptions` (upserting user subscription)
  - `user_access` (ensuring access)
- [ ] Verify customer-facing and admin-facing code fetches active access from a unified canonical source (`customer_subscriptions` or `get_customer_access_state`).
- [ ] Wire approve/reject/revoke actions to real RPCs or database updates without relying on client-side state memory.

## 3. REAL CRYPTO PROTECTION VISIBILITY IN TESTING COCKPIT
- [ ] Bind Binance / Bybit position queries directly to database rows in `trade_management_truth`.
- [ ] Bind protected and unsafe counts directly to columns in `trade_management_truth`.
- [ ] Expose missing SL, missing TP1, missing TP2, orphan count, and recovery_required counters based on actual backend data.
- [ ] Ensure "last action taken", "repair attempts", and "latest error" are queried directly from real tables or the execution heartbeats.

## 4. BUTTON WIRING AND DIAGNOSTICS CONTROL
- [ ] Wire "Run Scanner", "Run Binance Monitor", "Run Bybit Monitor" to real Edge Function triggers.
- [ ] Ensure buttons display a loading spinner, catch errors gracefully, and do not fake success if the backend execution fails.
- [ ] Wire the "Execute Retention Batch" button to call the correct 3-arg PostgreSQL RPC `hashibot_cleanup_noncritical`.

## 5. UI PURPOSE CLEANUP & REDUNDANCY REMOVAL
- [ ] Modify `src/components/layout/AdminLayout.tsx` to hide duplicate and stale links (`Scanner Logs`, `Scanner Config`, `Provider Health`, `Candidate Setups`, `Rejected Setups`, `Signals Manager`) from the sidebar.
- [ ] Direct routing focus towards `OperatorPanel` section views.
- [ ] Update and verify app building via `npm run build` and related lint/test processes.
