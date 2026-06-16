# Provider-Neutral Execution Router

Status: implemented in `binance-testnet-execution`.

Approved signals are represented as provider-neutral payloads with symbol base, direction, entry zone, SL, TP1, TP2, strategy, timeframe, grade, confidence, risk model, and an execution group id. The router sends the same approved signal to Binance testnet execution, creates a separate Bybit testnet provider row when enabled/monitored, and records an MT5 placeholder row for future enablement. Provider failures are isolated in per-provider results and lifecycle rows.

Decision: BINANCE EXECUTION READY: YES. BYBIT EXECUTION READY: NO (monitor/parity row ready; entry remains disabled until operator enables Bybit testnet execution controls). 
