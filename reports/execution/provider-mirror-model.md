# Provider Mirror Execution Model

Approved provider-neutral signals create independent Binance, Bybit, and MT5 lifecycles. Each provider owns execution, monitoring, protection, recovery, and lifecycle state. A provider failure must be recorded as provider-local and must never mutate other provider lifecycles. Future providers inherit the same signal payload contract.
