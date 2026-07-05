# 16 Tests and Certification Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 has TypeScript tests for capital hardness, Binance truth execution, Binance monitor, SQL constraints, exchange providers, trade management core, and execution admin UI. Classification: MODERNIZE.
- Tests are script-based and focused on current implementation proof, not full V2 certification.
- V2 certification must cover adapters, strategies, state machines, command queue replay, protection repair, safe close, and research promotion gates.

## Required V2 suites
- Unit tests for event contracts/state machines/indicator engine/strategy framework/risk/planner.
- Integration tests for Binance, Bybit, MT5/HashiBridge.
- Certification scenarios listed in the V2 constitution for every adapter.
