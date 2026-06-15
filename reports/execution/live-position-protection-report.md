# OPEN POSITION PROTECTION REPORT

Generated: 2026-06-15T16:14:37.017Z

## Scope and safety

- Read-only audit only. No Binance orders and no Bybit orders were placed.
- Position classification is based on exchange positions and exchange open orders first; database rows are used only to detect orphan/stale monitor or execution state.
- Any position missing SL is CRITICAL. Any position missing TP1 or TP2 is WARNING unless a critical condition is also present.

## Binance exchange fetch status

- Status: FAILED — BINANCE_TESTNET_API_KEY/BINANCE_TESTNET_API_SECRET not set in this environment
- Exchange positions fetched: 0
- Exchange open orders fetched: 0
- Execution database available: NO — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment

## Bybit auth retest

- Enabled: NO
- auth_ok: NO
- response_code: 0
- retCode: n/a
- retMsg: BYBIT_TESTNET_API_KEY/BYBIT_TESTNET_API_SECRET not set in this environment
- key_length: 0
- secret_length: 0
- signature_length: 0
- query_string: accountType=UNIFIED

## Summary

- total positions: 0
- safe positions: 0
- warning positions: 0
- critical positions: 0
- orphan protection orders: 0

## Position details

No position details are available because Binance exchange fetch failed.

## Orphan order details

No reduce-only orphan protection orders were detected from exchange truth.

## Conclusion

Protection truth is NOT proven in this workspace because Binance exchange truth could not be fetched. Run this script in the deployed/secret-bearing environment and attach the regenerated report.

