# X-F.5 provider order routing proof

## Binance
Binance execution validates Binance USD-M testnet symbol support, creates a `pending_submit` execution row, configures symbol settings, then submits a Binance testnet LIMIT entry order only if all gates pass.

## Bybit
Bybit execution validates Bybit linear USDT symbol support, creates a skipped or `pending_submit` execution row, loads V5 instrument rules for category `linear` and `settleCoin=USDT`, and submits a Bybit testnet LIMIT entry order only if all gates pass.

## Isolation
The router builds independent provider tasks. Unsupported provider symbols become per-provider `missing_symbol_cache` results and do not crash or block the other provider.
