# 09 Trade Management, Protection, Recovery Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 has tradeManagement helpers, trade supervisor migrations, monitors, and execution hardening scripts. Classification: MODERNIZE concepts, REWRITE lifecycle core.
- V2 requires explicit Trade, Command, Executor, and Protection state machines. V1 stores statuses but lifecycle truth is spread across Edge Functions, tables, monitors, and UI.
- Protection repair/safe-close concepts exist but need adapter certification and command queue semantics.

## V2 rebuilds
- Trade management engine, protection engine, recovery engine, command queue, position sync, manual modification detection, duplicate prevention, and safe close certification.
