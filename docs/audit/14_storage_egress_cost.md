# 14 Storage, Egress, and Cost Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 contains candles, scanner_runs, signal_updates, telegram_deliveries, intelligence_events, execution_event_logs, runtime_events and many dashboard reads. These can become high-volume and high-egress tables. Classification: REWRITE retention and dashboard access.
- The scanner model risks writing noisy loop/runtime data and using Supabase as operational memory.
- Several admin pages select recent raw rows from large tables; acceptable for V1 operations, not V2 scale.

## V2 rules
- Candles/indicators in runtime cache only unless research/certification dataset explicitly stores them.
- Write only meaningful state changes.
- Every high-volume table needs owner, retention, cleanup mechanism, reason, and summary/snapshot reader.
