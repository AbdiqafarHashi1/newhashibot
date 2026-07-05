# NEXT_STEPS

Recommended next prompt: implement strategy layer consumers that read only `IndicatorCache` snapshots and produce strategy candidates without execution side effects.

Remaining gaps:
- Live Binance, Bybit, and MT5 adapters are intentionally not connected.
- Strategy implementations are intentionally not upgraded in this market intelligence hardening pass.
- Persistence migrations are intentionally not created.
