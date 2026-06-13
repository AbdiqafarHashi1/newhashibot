# HashiBot Telegram Product Layer — Router, Channels, Intelligence Foundation

Date: 2026-06-12

## Executive Summary

This change builds the Telegram product layer around the existing crypto engine without changing strategy scoring, strategy tuning, execution logic, monitor logic, Binance truth logic, Portfolio Governor, Capital Management, Forex, or MT5.

HashiBot now has the foundation for one product:

- **AI Market Intelligence Platform**
- **Premium Signal Room**

The existing Telegram destination remains the **VIP Signal Room**. The router adds support for optional **Admin** and **Free** channels that can be enabled later by adding channel IDs only.

## Architecture

Required flow is now centralized:

```text
Source Module
→ Telegram Event
→ Telegram Router
→ Channel Resolution
→ Telegram Delivery
→ Delivery Log
```

The server-side router lives in `supabase/functions/_shared/telegram-router.ts` and is the only code path that calls Telegram `sendMessage`.

## Channel Configuration

Supported secrets:

- `TELEGRAM_CHAT_ID` = VIP Signal Room (existing Telegram destination)
- `TELEGRAM_ADMIN_CHAT_ID` = Admin Channel
- `TELEGRAM_FREE_CHAT_ID` = Free Channel

Backward compatibility is preserved because the router falls back to `TELEGRAM_DEFAULT_CHANNEL_ID` when `TELEGRAM_CHAT_ID` is not present.

## Routing Rules

| Event family | Destination |
| --- | --- |
| Scanner/API/Binance/protection/watchdog/monitor/sync/cron/cleanup/orphan/execution truth/intelligence/delivery failures | Admin |
| Morning Brief | Free + VIP |
| News Digest | Free + VIP |
| Watchlist + Pattern Update | Free + VIP |
| Market Wrap | Free + VIP |
| Highest Confidence Setup | Free |
| Qualified Signal | VIP |
| Entry / filled / execution lifecycle | VIP |
| TP1 / TP2 / SL / expiry outcomes | VIP |

## Delivery Logging

`telegram_deliveries` is expanded with:

- `event_id`
- `event_type`
- `destination_channel`
- `destination_chat_id`
- `sent_at`
- `delivery_status`
- `retry_count`
- `error_message`

Compatibility columns remain intact:

- `delivery_type`
- `chat_id`
- `status`
- `telegram_message_id`

The Control Room and Telegram Logs can display successful deliveries, failures, skipped deliveries, retries, and channel-level delivery health.

## Content Orchestration Design

Scheduled product content is staged through `telegram-orchestrator`:

| EAT Time | UTC Cron | Content |
| --- | --- | --- |
| 08:00 EAT | 05:00 UTC | Morning Brief |
| 12:00 EAT | 09:00 UTC | News Digest |
| 16:00 EAT | 13:00 UTC | Watchlist + Pattern Update |
| 20:00 EAT | 17:00 UTC | Market Wrap |

Real-time content remains limited to:

- VIP signals
- VIP execution updates
- critical Admin alerts

Free trade policy remains guarded at the product layer: public content is intelligence-first and never forces trades.

## Intelligence Engine Foundation

A single Intelligence Engine foundation is introduced using `intelligence_events` plus the `telegram-orchestrator` entrypoint.

Initial module families:

- News Module: ETF, regulatory, exchange, ecosystem news digest hooks
- Sentiment Module: Fear & Greed, funding, OI, liquidations, BTC dominance hooks
- Pattern Module: bull flags, bear flags, triangles, BOS, CHOCH, liquidity sweeps hooks
- Watchlist Module: bullish, bearish, high-volatility watchlist hooks
- Volatility Module: expansion, compression, breakout condition hooks
- Brief Generator: morning brief, market wrap, weekly, monthly summary hooks

This is a framework/foundation only; no strategy scoring or scanner tuning was modified.

## Control Room Changes

Control Room now includes Telegram Router Health with channel cards for:

- Admin Channel
- Free Channel
- VIP Signal Room

It displays channel readiness and delivery health from `telegram_delivery_health`.

Telegram Logs now show:

- channel
- event/signal
- destination chat
- delivery status
- retry count
- reason/error

## Files Changed

- `supabase/functions/_shared/telegram-router.ts`
- `supabase/functions/telegram-send/index.ts`
- `supabase/functions/telegram-test/index.ts`
- `supabase/functions/telegram-orchestrator/index.ts`
- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/migrations/20260612170000_063_telegram_product_layer_router_intelligence.sql`
- `src/hooks/useAdminLiveState.ts`
- `src/lib/types.ts`
- `src/pages/admin/ControlRoom.tsx`
- `src/pages/admin/TelegramLogs.tsx`
- `src/pages/admin/TelegramTest.tsx`
- `reports/product/telegram-product-layer.md`

## Tests Run

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Remaining Risks

1. `TELEGRAM_ADMIN_CHAT_ID` and `TELEGRAM_FREE_CHAT_ID` are optional until the operator creates those channels.
2. Rich intelligence content requires future adapters for live news/sentiment/pattern inputs.
3. Cron execution depends on deployed Supabase settings and pg_cron/net configuration.
4. The SQL migration schedules orchestration jobs defensively; production may still require operator verification inside Supabase.
