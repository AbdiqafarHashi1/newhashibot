# 03 Backend Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 backend is mostly Supabase Edge Functions plus SQL tables, not a long-running HashiCore service. Classification: REWRITE for V2 runtime.
- Edge Functions own scanning, strategy evaluation, execution, monitoring, Telegram, and admin actions. This violates V2 event bus/cache/runtime separation.
- Some helper modules provide good references: internal auth, telegram routing, intelligence engine, exchange provider contracts. Classification: MODERNIZE/MOVE.

## Target direction
- Create long-running market-data/candle/indicator/strategy/arbitrator/execution services in /v2/services.
- Keep Edge Functions for auth-gated admin/customer actions, webhook ingress, billing callbacks, and durable event writes.
- Do not use Supabase as runtime memory/message bus.
