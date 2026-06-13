# HashiBot Intelligence Engine MVP

Date: 2026-06-12

## 1. Architecture

The Intelligence Engine MVP uses one engine, not multiple scanners:

```text
Stored Market Data + Scanner Candidates + Signal State + Optional Providers
→ Intelligence Engine
→ Intelligence Events
→ Brief Generator
→ Telegram Router
→ Admin / Free / VIP
```

The engine is implemented in `supabase/functions/_shared/intelligence-engine.ts` and is exposed through `supabase/functions/intelligence-engine/index.ts`. The existing `telegram-orchestrator` now delegates to the same engine so scheduled content and manual intelligence runs use one source of truth.

No intelligence module sends directly to Telegram. All delivery goes through the Telegram Router.

## 2. Modules Built

### Market Context Module

Tracks from stored crypto candles:

- BTC trend
- ETH trend
- available crypto symbol trend
- volatility state
- market regime: `risk_on`, `risk_off`, `neutral`, `volatile`, `compressed`, `breakout_watch`

Output: Market Context Summary embedded into Morning Brief and Market Wrap.

### Sentiment Module

Supports optional `FEAR_GREED_API_URL`.

If unavailable, the engine marks sentiment fields as `Data unavailable` and uses only stored market data as fallback context.

Tracked fields are staged for:

- Fear & Greed
- funding bias
- open interest
- liquidations
- BTC dominance
- stablecoin/risk appetite proxy

### News Intelligence Module

Provides a provider interface using `CRYPTO_NEWS_API_URL` and/or `NEWS_API_KEY` detection.

If no provider is configured, the engine reports:

- `data_source = unavailable`
- no ETF news
- no regulatory news
- no exchange news
- no ecosystem news
- no macro headlines

No fake news is generated.

### Pattern Intelligence Module

Uses stored candles to detect MVP conditions:

- compression
- expansion / high volatility
- breakout watch
- trend continuation
- pullback / downside continuation risk

Advanced SMC is intentionally not included in this MVP.

### Watchlist Module

Generates from scanner candidates + candle context:

- Bullish Watchlist
- Bearish Watchlist
- High Volatility Watchlist
- Breakout Watchlist

### Brief Generator

Generates:

- 08:00 EAT Morning Brief
- 12:00 EAT News Digest
- 16:00 EAT Watchlist + Pattern Update
- 20:00 EAT Market Wrap

## 3. Data Sources Used

- `candles` for crypto trend, BTC/ETH context, volatility and pattern state
- `strategy_candidates` for bullish/bearish watchlists and current setup quality context
- `signals` for active/recent signal summary
- optional `FEAR_GREED_API_URL` for sentiment
- optional `CRYPTO_NEWS_API_URL` / `NEWS_API_KEY` for future news provider integration detection

## 4. Missing Providers

The following data is truthfully marked unavailable unless a provider is configured:

- ETF headline feed
- regulatory headline feed
- exchange headline feed
- macro headline feed
- funding rates
- open interest
- liquidation bias
- BTC dominance
- stablecoin/risk appetite proxy

The MVP does not invent values when these feeds are missing.

## 5. Telegram Routing

Scheduled intelligence outputs route through `routeTelegramEvent` only.

Destinations:

- Morning Brief → Admin + Free + VIP
- News Digest → Admin + Free + VIP
- Watchlist + Pattern Update → Admin + Free + VIP
- Market Wrap → Admin + Free + VIP

VIP signal and execution lifecycle routing remains unchanged and continues to use the router with the VIP channel.

## 6. Channel Delivery Behavior

- **Admin** receives scheduled intelligence summaries so the operator can monitor customer-facing output.
- **Free** receives public market intelligence content for audience growth.
- **VIP** receives everything Free receives plus all qualified signals and lifecycle messages.
- Critical intelligence failures route to Admin only.

## 7. Admin UI Changes

Control Room now displays an Intelligence Engine MVP section with:

- last Morning Brief status
- last News Digest status
- last Watchlist + Pattern status
- last Market Wrap status
- latest intelligence run
- provider health summary
- failed intelligence event count
- channel delivery behavior note

## 8. Files Changed

- `supabase/functions/_shared/intelligence-engine.ts`
- `supabase/functions/intelligence-engine/index.ts`
- `supabase/functions/telegram-orchestrator/index.ts`
- `supabase/functions/_shared/telegram-router.ts`
- `supabase/migrations/20260612183000_064_intelligence_engine_mvp_fields.sql`
- `src/hooks/useAdminLiveState.ts`
- `src/pages/admin/ControlRoom.tsx`
- `reports/product/intelligence-engine-mvp.md`

## 9. Tests Run

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

## 10. Remaining Risks

1. Rich news is pending a live news provider integration.
2. Advanced derivatives sentiment needs funding/OI/liquidation provider adapters.
3. BTC dominance and stablecoin appetite are marked unavailable until data sources are configured.
4. Cron delivery depends on Supabase pg_cron/net settings and deployed Edge Function secrets.
5. Pattern detection is intentionally MVP-level and should not be treated as a strategy signal.
