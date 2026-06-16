# Capital Allocation Engine

New flow: Scanner → Market Intelligence → Capital Allocation → Arbitrator → Signal.

Allocator inputs: opportunity score, strategy quality score, liquidity, volatility, expected move, recent performance, correlation, regime confidence.
Outputs: priority rank, signal weight, execution weight, customer visibility score.

Rules: prioritize highest-quality, de-cluster correlated symbols, suppress weak opportunities and repeated symbol spam. Allocation remains signal-only/testnet-safe; no live trading is enabled.
