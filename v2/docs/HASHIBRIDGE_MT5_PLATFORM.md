# HashiBridge MT5 Platform

MT5 is an execution provider in V2. Flow: HashiCore → Execution Planner → Command Queue → Execution Worker → Provider Adapter → MT5 Provider → HashiBridge → Desktop Agent → MT5 Expert Advisor → MetaTrader 5.

The EA is execution-only and must not calculate indicators, scan markets, run strategies, generate signals, calculate risk, sizing, RR, or protection. Passwords are never exposed to UI; only credential references are stored.

## Production Edge Function contract

The production Edge Functions for HashiBridge and MT5 are transport/platform functions only:

- `bridge-register` registers or verifies a desktop bridge device and persists compact bridge events/logs.
- `bridge-heartbeat` records bridge health, reconnect, offline, queue, and terminal-count summaries.
- `bridge-sync` transports pending command queue records to the bridge and records acknowledgements/results.
- `mt5-account-register` stores MT5 account metadata and credential references only.
- `mt5-terminal-health` records terminal/EA/account sync health summaries.
- `mt5-recovery` creates recovery/runtime actions such as reconnect, replay queue, reconcile positions, repair protection, resync account, stop executor, or restart executor.

Agent-facing requests use HMAC-SHA256 over `<device-id>.<timestamp>.<nonce>.<raw-json-body>` with `HASHIBRIDGE_SHARED_SECRET` and headers `x-hashibridge-device-id`, `x-hashibridge-timestamp`, `x-hashibridge-nonce`, and `x-hashibridge-signature`. The replay window is five minutes. Edge Functions never place orders, calculate strategies, calculate risk, call Binance/Bybit, or call the MT5 terminal directly.
