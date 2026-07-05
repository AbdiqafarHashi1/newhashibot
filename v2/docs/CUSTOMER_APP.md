# CUSTOMER_APP

The V2 customer shell is implemented in `/v2/apps/web-customer`.

## Pages created
Landing, pricing, performance/results, FAQ, Exness affiliate placeholder, login, register, pending approval, dashboard, signals, accounts, executors, risk profile, strategies, billing, Telegram, support, and settings.

## Data strategy
Customer pages use `createMockApiClient()` from `/v2/packages/mock-data` for profile, subscription, accounts, executors, signals, trades, Telegram channels, and protection status. No production Supabase project is wired.
