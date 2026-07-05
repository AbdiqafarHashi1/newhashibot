# 08 MT5 Execution Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 includes MT5PersonalOperations/MT5PropOperations pages and an ExchangeProviderMT5 stub/reference, but no production HashiBridge desktop app or Agent EA was found in the audited tree. Classification: REWRITE.
- V1 references MT5 bridge secrets/config diagnostics, but does not implement the V2 Windows bridge, local queue, updater, encrypted channel, or EA event relay.

## V2 build target
- HashiCore -> Execution Planner -> MT5 Adapter -> HashiBridge -> HashiBot Agent EA -> MT5 terminal -> broker.
- Bridge and EA must never contain strategies, arbitrator, risk engine, or signal generation.
