# 11 Admin Platform Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 admin surface is extensive: customer/access management, scanner, strategy config, signal manager, performance, provider operations, Telegram, audit logs, execution, control room. Classification: MODERNIZE.
- Admin UI is valuable for product shape but too tightly coupled to V1 raw tables and scanner/execution implementation details.
- Missing: full protection center, recovery center, billing/subscription operations, affiliate manager, feature flags as first-class subsystem, executor creation only after approval/configuration.

## V2 approach
Rebuild admin APIs and summary views first; port selected screen layouts after stable V2 contracts exist.
