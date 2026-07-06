# Provider Bootstrap

Use testnet/demo only. Do not configure live trading keys in this package.

1. Create Binance testnet key without withdrawal permission and verify provider health.
2. Create Bybit testnet key without withdrawal permission and verify provider health.
3. Create MT5 demo account, install HashiAgentEA, and register via `mt5-account-register`.
4. Install HashiBridge desktop agent, set `HASHIBRIDGE_DEVICE_ID` and `HASHIBRIDGE_SHARED_SECRET`, register bridge, and verify heartbeat.
5. Verify queue sync, protection commands, testnet execution, recovery, and no-live-trading guard.

## HashiBridge / MT5 Edge handoff

HashiBridge must sign agent requests with `HASHIBRIDGE_SHARED_SECRET` and the headers documented in `edge-functions.md`. The desktop agent registers with `bridge-register`, sends runtime status to `bridge-heartbeat`, polls command transport through `bridge-sync`, and reports terminal/EA health through `mt5-terminal-health`. Edge Functions do not call MT5 directly, do not place orders, and do not bypass the command queue or execution worker.

MT5 account onboarding uses `mt5-account-register` with credential references only (`credential_ref` and optional `investor_credential_ref`). Plaintext passwords remain in the desktop agent secret store and must never be submitted to normal platform tables.
