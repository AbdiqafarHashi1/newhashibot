# Intelligence Real Feeds Completion + Edge Deploy Import Fix

## Feeds added
- Fear & Greed: uses `FEAR_GREED_API_URL` when configured and otherwise uses the keyless Alternative.me public Fear & Greed endpoint.
- BTC Dominance: uses CoinGecko global market data as a keyless public provider.
- Funding: uses Binance USD-M Futures public `premiumIndex` data for `BTCUSDT`, `ETHUSDT`, and `SOLUSDT`.
- Open Interest: uses Binance USD-M Futures public `openInterest` plus `openInterestHist` data for `BTCUSDT`, `ETHUSDT`, and `SOLUSDT`.
- Liquidations: supports `LIQUIDATIONS_API_URL`; missing provider is marked unavailable and never fabricated.
- News: supports `CRYPTO_NEWS_API_URL` and `NEWS_API_KEY`, including CryptoPanic-style `results` payloads and NewsAPI-style `articles` payloads.
- Market Breadth: calculates tracked bullish/bearish counts and percent above short trend from stored 1h crypto candles.
- Sector Rotation: adds a truthful unavailable result until symbol category data exists.
- Stablecoin Flow: supports `STABLECOIN_FLOW_API_URL`; missing provider is marked unavailable.

## Providers used
- Alternative.me Fear & Greed API when no `FEAR_GREED_API_URL` is configured.
- CoinGecko global API for BTC dominance.
- Binance USD-M Futures public endpoints for funding and open interest.
- Configured news/liquidation/stablecoin providers only when env URLs exist.
- Supabase `candles`, `strategy_candidates`, and `signals` tables for market structure context.

## Missing providers
- `LIQUIDATIONS_API_URL` is optional and required for real liquidations.
- `CRYPTO_NEWS_API_URL` is required for real news; `NEWS_API_KEY` is appended as `auth_token` when present and the URL does not already include auth parameters.
- `STABLECOIN_FLOW_API_URL` is optional and required for real stablecoin/risk-appetite flow.
- Sector categories are not present in the current tracked-symbol data model, so sector rotation stays unavailable.

## Data truth rules
- Feed results are stored with `feed_type`, `value`, `classification`, `source`, `freshness`, `status`, `error_message`, and `created_at`.
- Unconfigured optional providers are marked `unavailable`.
- Provider exceptions are marked `failed` with the real error message.
- News output only renders provider-returned headlines and explicitly says the provider is unavailable when missing.
- Liquidations and stablecoin flow are never faked.

## Edge deploy/import fixes
- Shared modules remain under `supabase/functions/_shared` and are imported with explicit `.ts` extensions.
- No deployable function imports `_shared/intelligence-feed`, `telegram-router/index.ts`, or `intelligence-feed/index.ts`.
- The package deploy script deploys only real Edge Function directories and does not deploy shared modules as standalone functions.
- The required functions continue to import shared router/intelligence code from `../_shared/*.ts`.

## UI changes
- Admin Control Room now shows feed health for Fear & Greed, BTC Dominance, Funding, Open Interest, Liquidations, News, Market Breadth, Sector Rotation, and Stablecoin Flow.
- Each feed card shows status, source, freshness, last update, and error message when present.

## Telegram output changes
- Morning Brief now includes BTC/ETH context, Fear & Greed, BTC dominance, Binance funding, Binance open-interest bias, breadth, market regime, watchlist, and risks.
- News Digest uses real provider headlines only or states that the news provider is unavailable.
- Watchlist + Pattern includes breadth, bullish/bearish lists, volatility, breakout watch, and pattern alerts.
- Market Wrap includes regime, sentiment/dominance changes, strongest/weakest symbols, signal summary, and next-session focus.
- All intelligence messages still route through the Telegram Router.

## Files changed
- `supabase/functions/_shared/intelligence-engine.ts`
- `supabase/migrations/20260613120000_065_intelligence_real_feed_results.sql`
- `src/hooks/useAdminLiveState.ts`
- `src/pages/admin/ControlRoom.tsx`
- `reports/product/intelligence-real-feeds-completion.md`

## Tests run
- `npm run typecheck` — passed.
- `npm run lint` — passed with pre-existing React Fast Refresh warnings.
- `npm run build` — passed with Vite chunk-size warning.
- `git diff --check` — passed.
- Edge import/bundle check attempted with `deno check`, but Deno is not installed in this container.

## Remaining risks
- Public providers can rate-limit or temporarily fail; failures are now stored truthfully.
- CoinGecko and Alternative.me defaults are keyless and may need replacement with paid/configured providers for production reliability.
- News parsing is intentionally generic and may need provider-specific mapping once the exact provider URL is chosen.
- Sector rotation needs symbol category metadata before it can become available.
