# Trade-management demo handoff

Scope: code readiness for authorized demo/testnet integration testing, not proof of connected broker operation or live customer profitability.

The account Brain authorizes quantity using the customer's capital, stop distance, contract/tick/lot specification, current margin and exposure. The scanner/watch lifecycle owns the strategy's confirmation and levels. Routing preserves the approved quantity and stop/target prices; monitors reconcile actual provider positions and orders, protection, partial/final exits and durable outcomes. New entries require current account authorization and finite access. Existing positions must retain protection when new entries are paused.

A concrete handoff defect was corrected: equal TP1/TP2 values represent one full-position target and must not fail a two-distinct-target check. Crypto routes conserved portions to the same final target. MT5 can route one minimum-lot child when splitting would create invalid sub-minimum lots. Approved size is never increased to make a split fit. The added test verifies Binance, Bybit and MT5 instruction quantities and target prices.

The three current positive canonical reviews cover crypto 4h trend pullback and Gold 15m/1h momentum. They can be installed for signal analysis and demo execution through the admin launch workspace. Forward-demo release scope cannot authorize live execution. Unpassed Forex candidates are excluded from this installation.

Activation test: deploy the branch's migrations/functions, connect Telegram and authorized Binance testnet/Bybit demo/MT5 demo accounts, then verify conditional publication, confirmation, account-specific authorization, provider acknowledgement, native protection, monitoring and exits. Code tests are not a substitute for these real provider observations. Account entitlement expiry blocks entries; automatic closure of every owned position at subscription expiry has not been established by this audit and must not be claimed.

Further strategy experiment from the supplied screenshots: sweep a previously visible liquidity level, require a failed reclaim/retest on subsequent closed candles, stop beyond the sweep extreme with a volatility buffer, target the opposite visible liquidity boundary, and cancel stale/unfilled setups. Higher-timeframe bias should be evaluated as a ranking feature against a mandatory-veto alternative. Do not infer a one-minute path from the current five-minute archive. The claimed 96% win rate is not validation evidence for HashiBot.
