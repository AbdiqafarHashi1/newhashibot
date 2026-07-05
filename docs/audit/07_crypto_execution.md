# 07 Crypto Execution Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 has Binance and Bybit testnet/demo execution functions, monitors, provider pages, and tests. Classification: MODERNIZE as reference, REWRITE production adapter service.
- Execution logic is coupled to Supabase tables/functions and global provider credentials. V2 requires customer-provided API keys and per-customer execution planning.
- V1 has idempotency/proof concepts in tests and execution_orders, useful for V2 command queue design. Classification: MOVE/MODERNIZE.

## V2 requirements
- Binance and Bybit implement same adapter contract: receive command, execute, modify, close, report positions, heartbeat, reconnect, prevent duplicates, verify protection.
- Adapter cannot receive a trade until Execution Planner approves customer/account/symbol/risk/status limits.
