# Google Cloud Demo Runtime Flow

```text
fixture prices -> canonical EMA -> scanner receipt -> strategy candidate
-> canonical arbitrator -> immutable approved signal event -> exact brain route
-> risk receipt -> capital calculation (exactly once) -> provider validation
-> mutation-disabled execution command -> explicit deterministic adapter
-> normalized fill/unknown receipt -> append-first lifecycle
-> protection -> TP1 -> break-even -> TP2/closed -> Telegram receipts
-> operations receipts/events
```

Every receipt contains stage, correlation ID, time, outcome, evidence and duration. Every event contains event/aggregate identity, monotonic aggregate version, correlation, timestamp and payload. Derived results are projections; Supabase remains future durable authority.

Four routes are locally certified: Binance personal demo/testnet, Bybit personal demo, MT5 personal demo and MT5 prop demo. Rejection paths cover no-trade, account lock, risk rejection and insufficient margin. Recovery paths cover unknown provider result and missing protection. Duplicate event/command/provider/Telegram identities return prior acknowledgement rather than repeating a side effect.
