# USDT/USDC Margin Fallback

## Behavior
- Prefer USDT margin first for Binance USD-M testnet execution.
- If USDT available margin is insufficient, evaluate one USDC backup path only when config allows it.
- Map `BASEUSDT` to `BASEUSDC` and require that mapped contract to appear in the fetched Binance testnet exchange-info USDC symbol list.
- If neither asset can fund requested margin, do not place an order and do not cancel existing valid trades.

## Config defaults
- `enable_usdc_margin_backup = false` by default unless explicitly enabled for testnet.
- `prefer_margin_asset = USDT`.
- `allow_margin_assets = USDT,USDC`.
- `max_retry_assets = 2`.

## Event reasons
- `insufficient_usdt_margin`
- `usdc_backup_used`
- `usdc_market_unavailable`
- `insufficient_total_margin`
- `symbol_not_supported_for_usdc`
- `exchange_rejected`
- `usdc_backup_disabled`

## Diagnostics captured
Execution diagnostics include symbol, side, strategy, requested margin, requested notional, leverage, risk %, account equity, available USDT, available USDC, selected margin asset, exchange error code/message, retry decision, backup attempt/result, and final status.

## Supported symbol verification
Implementation expects runtime exchange-info verification from Binance testnet:
- supported USDT symbols: symbols ending in `USDT` from exchange info.
- supported USDC symbols: symbols ending in `USDC` from exchange info.
- valid mapping: `BTCUSDT -> BTCUSDC` only when `BTCUSDC` exists in supported USDC symbols.

No hard-coded assumption makes an unavailable USDC market tradable.
