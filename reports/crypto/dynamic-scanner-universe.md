# Dynamic Scanner Universe

Status: implemented in `market-scanner`.

The scanner now builds a Binance USDT perpetual universe dynamically from exchange info and 24h ticker data. It ranks liquid symbols by quote volume, absolute 24h move, and volatility proxy, while honoring configured max symbols, minimum 24h volume, include symbols, exclude symbols, and stablecoin/base exclusions. If Binance universe discovery fails, the existing configured symbol table remains the fallback.

Decision: DYNAMIC SCANNER READY: YES.
