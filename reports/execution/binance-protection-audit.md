# Binance Protection Audit

Binance account and protection truth must be exchange-derived. Unsafe positions without SL are classified CRITICAL. Missing TP, stale monitoring, duplicate/orphan protection, or recovery pending are WARNING. The monitor audit loop is documented as fetch positions, fetch open orders, cross-check SL/TP1/TP2/orphans/duplicates, repair when enabled, verify, and write truth.

USDC protection remains keyed by executed symbol so monitor, recovery, protection, and TP logic do not confuse original signal symbol with routed execution symbol.
