# 02 Frontend Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 has public, auth, customer, and admin routes with many screens already matching product vocabulary. Classification: MODERNIZE.
- Layout components and basic UI primitives can seed V2, but must be separated into customer/admin apps with shared UI package.
- Frontend currently reads many Supabase tables directly, including large operational tables. V2 dashboards must read snapshots/summaries, not raw scanner/trade/event tables. Classification: REWRITE data-access pattern.

## Reuse opportunities
- Public pages: Home, Pricing, FAQ, Results, SignalMode, PropEA, PersonalEA: MODERNIZE copy and route structure.
- AuthContext/RequireAuth: MODERNIZE around V2 roles, approvals, package status, and multi-account ownership.
- Admin pages: MODERNIZE as UX prototypes, not as direct data contracts.
- UI components Badge, StatCard, RiskGuidance: KEEP/MODERNIZE in shared UI.
