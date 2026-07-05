# Step 16 — Telegram Platform

The V2 Telegram Platform is an event-driven communication subsystem under `/v2`. It routes existing platform and engine events into configurable Telegram channel categories without creating trades, mutating signals, bypassing risk controls, or calling exchanges.

## Default MVP channel categories

- `FREE`: public analysis, education, sample signals, and upgrade prompts.
- `VIP`: full signals, signal updates, trade-management updates, and results.
- `ADMIN_OPS`: system errors, provider health, queue issues, protection failures, customer/payment/admin alerts.

## Components

- Supabase migration: `telegram_bots`, `telegram_channels`, `telegram_templates`, `telegram_routes`, `telegram_delivery_queue`, `telegram_delivery_logs`, and `customer_telegram_preferences`.
- Edge Function: supports `send_message`, `send_test_message`, `retry_failed_message`, `route_event_to_channel`, and `log_delivery_result`.
- Service package: bot manager, channel router, template renderer, delivery queue, retry classifier, and message formatter.

## Boundary

Telegram consumes Immutable Signal Engine, HashiCore, Execution Worker, Protection Engine, Platform API, and subscription/customer events. It never owns trading decisions or execution.
