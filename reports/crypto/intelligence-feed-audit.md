# HashiBot Phase X-A.5 — Intelligence Feed Inventory Audit

This is a data-quality-only audit. It does not change scanner scoring, strategy entries, execution logic, Binance protection, Telegram routing, Forex, or MT5.

| Feed | Provider / Endpoint | Frequency | Freshness | Reliability | Failure / Fallback | Historical Coverage | Ranking Eligible |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fear & Greed | Alternative.me or `FEAR_GREED_API_URL` | Per intelligence run | Provider timestamp or live fetch | Healthy when HTTP 200 + value | Failed with explicit provider HTTP/auth reason | Latest index point | Yes when healthy |
| Open Interest | Binance USD-M `/fapi/v1/openInterest` + `/futures/data/openInterestHist` | Per intelligence run | Live fetch | Healthy when BTC/ETH/SOL all return | Failed with exact Binance HTTP reason | Latest plus 1h two-point change | Yes when healthy |
| Funding | Binance USD-M `/fapi/v1/premiumIndex` | Per intelligence run | Live fetch | Healthy when BTC/ETH/SOL funding return | Failed with exact Binance HTTP reason | Latest funding snapshot | Yes when healthy |
| BTC Dominance | CoinGecko `/api/v3/global` | Per intelligence run | Live fetch | Healthy when BTC market-cap percentage exists | Failed with exact CoinGecko HTTP reason | Latest global market snapshot | Yes when healthy |
| Market Breadth | Supabase tracked crypto 1h candles | Per intelligence run | Last stored 1h candles | Healthy when real tracked candles exist | Unavailable if no real candles | Last 48h tracked crypto candle window | Yes when healthy |
| Liquidations | `LIQUIDATIONS_API_URL` configured provider | Provider dependent | Live fetch if configured | Unavailable until provider configured | No fallback and no fake data | None until configured | No until healthy provider exists |
| News | `CRYPTO_NEWS_API_URL` + optional `NEWS_API_KEY`; CryptoCompare public fallback when no configured URL | Per intelligence run | Live fetch | Healthy when headlines parse | HTTP 401 now reports auth failure/missing/expired key; other HTTP failures are explicit | Latest provider headlines | Yes when healthy |
| Sector Rotation | Research-only sector groups from tracked crypto candles | Per intelligence run | Last stored 1h candles | Fallback/research quality only | Insufficient data unless at least two populated real-data sectors | Last 48h tracked candle window | Reduced/zero weight until validated |
| Stablecoin Flow | Derived proxy from BTC dominance, OI, funding, breadth | Per intelligence run | Latest healthy proxy feeds | Fallback/research proxy only | Unavailable unless at least three proxy feeds are healthy; no fabricated values | Derived latest snapshot only | Reduced/zero weight until direct provider exists |

## Feed Quality Rules
- `healthy`: real provider or real stored data, fresh enough for current intelligence run, ranking eligible when the feed is a direct signal.
- `degraded`: provider failed, HTTP/auth/quota failure is explicit, ranking contributes zero weight.
- `fallback`: real derived/research proxy, can be displayed but contributes reduced or zero ranking weight.
- `unavailable`: missing configuration or no real data, contributes zero ranking weight.
- `insufficient_data`: not enough real observations for classification, contributes zero ranking weight.
