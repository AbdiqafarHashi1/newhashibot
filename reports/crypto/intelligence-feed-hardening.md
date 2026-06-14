# HashiBot Phase X-A.5 — Intelligence Feed Hardening Final Report

This phase hardens intelligence feed quality only. Scanner scoring, strategy entries, execution logic, Binance protection placement, Telegram routing, Forex, and MT5 were not changed.

## Working Feeds
- Fear & Greed: Alternative.me/default configured provider, ranking eligible only when healthy.
- Funding: Binance USD-M futures premium index, ranking eligible when healthy.
- Open Interest: Binance USD-M open interest and 1h history, ranking eligible when healthy.
- BTC Dominance: CoinGecko global endpoint, ranking eligible when healthy.
- Market Breadth: real tracked crypto 1h candles, now produces a Breadth Score from the tracked candle universe.
- News: configured provider or CryptoCompare public fallback, with explicit HTTP/auth diagnostics.

## Broken / Unavailable Feeds
- Liquidations: unavailable when `LIQUIDATIONS_API_URL` is missing. No fake data is generated.
- Sector Rotation: research-only. It becomes available only when at least two sector groups have real tracked candle members.
- Stablecoin Flow: research-only derived proxy. It becomes available only when at least three supporting proxy feeds are healthy.

## Fixed / Hardened
- News failures now include exact HTTP class: auth failure / missing key on 401, forbidden/quota on 403, rate limit on 429, or provider HTTP error.
- Liquidations now clearly reports missing provider configuration and remains ranking-ineligible until configured.
- Market breadth now uses real tracked crypto candles and emits `breadthScore`, participation, bullish, bearish, and flat counts.
- Sector rotation now has research-only sector groups: Layer 1, DeFi, AI, Infrastructure, Meme, Gaming, and RWA.
- Stablecoin flow now uses only supported real proxy feeds and refuses to fabricate values.
- `intelligence_feed_quality` exposes quality status, score, ranking eligibility, provider, endpoint, freshness, reason, frequency, fallback, and historical coverage.

## Ranking Readiness
- Healthy direct feeds may influence Symbol Quality, Strategy Survival, Opportunity Ranking, and Regime Detection.
- Degraded feeds have zero or reduced weight depending on downstream consumer policy.
- Fallback/research-only feeds are visible for operator context but are not trusted as final ranking signals.
- Unavailable feeds contribute zero weight.

## Remaining Risks
- Direct liquidation provider is still required for liquidation cascade confidence.
- Direct stablecoin flow provider or a validated on-chain/market proxy is still required before stablecoin flow can affect ranking materially.
- Sector groups are static research groups and should be validated against the approved symbol universe before enforcement.
- Historical feed reliability and failure rate are now represented in schema/view metadata, but long-horizon reliability needs accumulated `intelligence_feed_results` rows.

## Recommended Next Phase
- Persist feed quality history and compute rolling failure rate per feed.
- Add a direct liquidations provider.
- Add a validated stablecoin-flow data source or explicitly approve the proxy formula.
- Wire only `ranking_eligible=true` feeds into the Opportunity Ranking Engine with documented weights.
