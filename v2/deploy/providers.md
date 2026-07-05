# Provider Bootstrap

Use testnet/demo only. Do not configure live trading keys in this package.

1. Create Binance testnet key without withdrawal permission and verify provider health.
2. Create Bybit testnet key without withdrawal permission and verify provider health.
3. Create MT5 demo account, install HashiAgentEA, and register via `mt5-account-register`.
4. Install HashiBridge desktop agent, set `HASHIBRIDGE_DEVICE_ID` and `HASHIBRIDGE_SHARED_SECRET`, register bridge, and verify heartbeat.
5. Verify queue sync, protection commands, testnet execution, recovery, and no-live-trading guard.
