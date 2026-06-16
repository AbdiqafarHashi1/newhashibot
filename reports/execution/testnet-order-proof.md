# Testnet order proof

## Manual proof action

Admin action added:

```json
{ "action": "execute_latest_approved_signal" }
```

UI button label:

> Execute Latest Approved Signal on Enabled Testnet Providers

## Safety contract

- Uses latest approved A/A+ crypto signal.
- Calls the same provider router as automatic execution.
- Respects all safety gates.
- Forces `live_trading_enabled=false` and throws on any live-trading guard violation.
- Submits Binance testnet orders only through `https://demo-fapi.binance.com`.
- Submits Bybit orders only through a base URL containing `testnet`.
- Provider failures are isolated and stored as failed/skipped provider execution rows.
