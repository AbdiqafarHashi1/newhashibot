# 18 Gap Analysis

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Major gaps against frozen V2
1. No /v2 standalone app yet.
2. No canonical event bus contracts.
3. No immutable signal object enforced end-to-end.
4. No separated Execution Manager -> Planner -> Adapter pipeline.
5. No shared indicator engine as independent runtime service.
6. No candle engine normalizing Binance/Bybit/MT5 feeds.
7. Runtime truth is spread across Supabase tables/functions instead of runtime cache.
8. State machines are not first-class domain modules.
9. Command queue is incomplete relative to V2 idempotent replay requirements.
10. HashiBridge desktop app and Agent EA are absent.
11. Research Lab is not isolated from production runtime/storage.
12. Adapter certification is incomplete.
13. Billing/affiliate/customer onboarding are partial.
14. Storage/egress retention ownership needs full redesign.
15. Multi-account execution/customer vaulting is not mature.
