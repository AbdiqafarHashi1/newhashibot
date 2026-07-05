# 19 V2 Build Recommendations

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Recommended next build sequence
1. Create /v2 skeleton only after this audit is accepted: workspaces, apps, services, packages, docs.
2. Define event contracts, immutable signal schema, state machines, command queue schema, and runtime cache interfaces before UI implementation.
3. Build market data -> candle -> indicator pipeline with fake/replay feeds first.
4. Build strategy framework and certified MVP strategies against shared indicators.
5. Build arbitrator/risk/capital/signal engine and signal-only Telegram dispatch.
6. Build execution planner and command queue before any adapter can place orders.
7. Implement Binance/Bybit adapters with certification harness.
8. Implement HashiBridge desktop app and Agent EA after MT5 protocol/contracts are frozen.
9. Rebuild Supabase from a clean baseline with retention policies and summary snapshots.
10. Modernize frontend screens only after stable APIs/snapshots exist.

## Recommended next prompt
“Create the /v2 standalone skeleton and architecture contracts only: workspace layout, event contracts, immutable signal types, state machine definitions, command queue interfaces, runtime cache interfaces, and placeholder apps/services. Do not implement trading logic yet.”
