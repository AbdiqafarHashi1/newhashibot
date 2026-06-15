# Provider Safety Audit

## Requirement
If Bybit health is not connected:

- force Primary Provider to Binance
- show warning: `Bybit diagnostics incomplete`
- do not allow disconnected providers to become active execution providers

## Findings
Before this fix, the Primary Provider selector could display or attempt to submit a disconnected non-Binance provider. That created an unsafe operator path because a provider with incomplete diagnostics could be selected as active execution provider.

## Fix made

- The admin execution page computes an effective primary provider.
- If the requested primary provider is Bybit and Bybit diagnostics are not connected, the effective primary provider is forced to Binance.
- The selector disables Bybit until Bybit health is connected.
- The selector disables MT5 unless MT5 is connected.
- Attempts to update the global primary provider to a disconnected non-Binance provider are rejected, `live_trading_enabled` remains forced false, and the database global primary provider is written back to Binance.
- The page shows the exact warning text: `Bybit diagnostics incomplete`.

## Safety result

Disconnected providers cannot become active execution providers through the admin provider controls. Binance remains the primary provider whenever Bybit diagnostics are incomplete.
