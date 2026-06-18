# Trade Management Runtime Proof

This report is intentionally runtime-only. Counts must be refreshed by `sync_all_positions_now`, `prove_binance_trade_management`, or `prove_bybit_trade_management`; missing exchange confirmation stays a blocker and is not treated as readiness.

| Runtime item | Binance testnet | Bybit demo |
| --- | ---: | ---: |
| Open positions found | Runtime action required | Runtime action required |
| Protected count | Runtime action required | Runtime action required |
| Unsafe count | Runtime action required | Runtime action required |
| Repair attempts | Runtime action required | Runtime action required |
| Repair successes | Runtime action required | Runtime action required |
| Telegram messages sent by provider | Runtime action required | Runtime action required |

## Exact remaining blockers

- No live trading is enabled or required for this proof.
- If exchange credentials, provider restrictions, or order endpoints fail, the admin action returns the exact exchange error in `blocker`/`latest_error` and does not mark the trade protected.
- `trade_management_truth` is exchange-truth-first; DB rows are closed/stale only after sync sees the position missing from the exchange.
