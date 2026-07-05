# 12 Telegram Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 has telegram-send, telegram-test, telegram-orchestrator, shared telegram-router, Telegram logs/tests UI, and delivery tables. Classification: MODERNIZE/MOVE.
- Telegram is more mature than many subsystems, but V2 must consume lifecycle events and never own trade state.
- Existing channels/secrets cover VIP/default/admin/free partially; V2 needs Free Community, VIP Signals, VIP Execution, Announcements, Admin Alerts, Error Alerts, Marketing/Affiliate routing.

## V2 target
Create /v2/services/telegram-platform with template registry, channel routing, delivery outbox, retry, health, preview/test APIs, and event consumers.
