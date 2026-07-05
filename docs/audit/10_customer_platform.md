# 10 Customer Platform Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- Customer pages cover dashboard, account, active signals, history, watchlist, package request, and Telegram setup. Classification: MODERNIZE.
- Signup and package approval concepts exist through packages/subscriptions/access requests/customer bot setups. Classification: MODERNIZE data model.
- Missing for V2: multi-account crypto/MT5 management UX depth, executor lifecycle controls per account, HashiBridge onboarding, richer risk presets, billing lifecycle, affiliate verification.

## Recommendation
Use V1 customer UI as low-fidelity product reference while designing V2 around customer_account, executor, subscription, approval, and command-state APIs.
