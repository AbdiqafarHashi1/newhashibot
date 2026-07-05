# Complete Environment Inventory

Use this inventory before creating any Supabase, Netlify, Edge Function, bridge, or local operator secret. Required variables must be configured before production verification.

| Category | Name | Purpose | Required | Default | Example format | Where configured | When configured |
|---|---|---:|---:|---|---|---|---|
| Frontend | `VITE_SUPABASE_URL` | Browser Supabase project URL | Yes | None | `https://abc.supabase.co` | Netlify env | Before Netlify build |
| Frontend | `VITE_SUPABASE_ANON_KEY` | Browser anon key | Yes | None | `eyJ...` | Netlify env | Before Netlify build |
| Frontend | `VITE_PLATFORM_API_URL` | Edge Function API base | Yes | None | `https://abc.functions.supabase.co/platform-api` | Netlify env | Before Netlify build |
| Frontend | `VITE_APP_ENV` | Runtime environment label | Yes | `production` | `production` | Netlify env | Before Netlify build |
| Backend | `SUPABASE_URL` | Server Supabase URL | Yes | None | `https://abc.supabase.co` | Supabase secrets, local `.env` | Before Edge deploy |
| Backend | `SUPABASE_ANON_KEY` | Limited client key | Yes | None | `eyJ...` | Supabase secrets | Before Edge deploy |
| Backend | `SUPABASE_SERVICE_ROLE_KEY` | Admin database access | Yes | None | `eyJ...` | Supabase secrets only | Before Edge deploy |
| Supabase | `DATABASE_URL` | Direct maintenance connection | Yes | None | `postgresql://...` | Local CI/operator only | Before SQL package |
| Platform | `HASHIBOT_ENV` | Production guard | Yes | `production` | `production` | Supabase secrets, Netlify | Before all verification |
| Platform | `PLATFORM_PUBLIC_URL` | Netlify application URL | Yes | None | `https://hashibot.example.com` | Supabase secrets, Netlify | Before webhooks |
| Platform | `PLATFORM_API_TOKEN` | Internal API bearer token | Yes | None | 32+ random chars | Supabase secrets | Before Edge deploy |
| Platform | `PLATFORM_RESET_ALLOW_DESTRUCTIVE` | Enables dev-only destructive reset | No | `false` | `false` | Supabase secrets/local only | Never true in production |
| Telegram | `TELEGRAM_FREE_BOT_TOKEN` | FREE bot token | Yes | None | `123:ABC` | Supabase secrets | Before Telegram deploy |
| Telegram | `TELEGRAM_VIP_BOT_TOKEN` | VIP bot token | Yes | None | `123:ABC` | Supabase secrets | Before Telegram deploy |
| Telegram | `TELEGRAM_ADMIN_OPS_BOT_TOKEN` | Admin ops bot token | Yes | None | `123:ABC` | Supabase secrets | Before Telegram deploy |
| Telegram | `TELEGRAM_FREE_CHAT_ID` | FREE channel/group | Yes | None | `-1001234567890` | Supabase secrets/bootstrap | Before delivery test |
| Telegram | `TELEGRAM_VIP_CHAT_ID` | VIP channel/group | Yes | None | `-1001234567890` | Supabase secrets/bootstrap | Before delivery test |
| Telegram | `TELEGRAM_ADMIN_OPS_CHAT_ID` | Ops channel/group | Yes | None | `-1001234567890` | Supabase secrets/bootstrap | Before delivery test |
| Binance | `BINANCE_TESTNET_API_KEY` | Binance testnet execution | Yes | None | provider key | Supabase secrets | Before provider test |
| Binance | `BINANCE_TESTNET_API_SECRET` | Binance testnet signing | Yes | None | provider secret | Supabase secrets | Before provider test |
| Bybit | `BYBIT_TESTNET_API_KEY` | Bybit testnet execution | Yes | None | provider key | Supabase secrets | Before provider test |
| Bybit | `BYBIT_TESTNET_API_SECRET` | Bybit testnet signing | Yes | None | provider secret | Supabase secrets | Before provider test |
| MT5 | `MT5_DEMO_ACCOUNT_ID` | MT5 demo account id | Yes | None | `12345678` | Supabase secrets | Before MT5 registration |
| MT5 | `MT5_DEMO_SERVER` | Broker demo server | Yes | None | `Broker-Demo` | Supabase secrets | Before MT5 registration |
| MT5 | `MT5_DEMO_LOGIN` | MT5 demo login | Yes | None | `12345678` | Desktop agent secret store | Before desktop agent |
| MT5 | `MT5_DEMO_PASSWORD` | MT5 demo password | Yes | None | password | Desktop agent secret store | Before desktop agent |
| HashiBridge | `HASHIBRIDGE_DEVICE_ID` | Desktop agent identity | Yes | None | `hb-prod-001` | Desktop agent | Before bridge register |
| HashiBridge | `HASHIBRIDGE_SHARED_SECRET` | Bridge request signing | Yes | None | 32+ random chars | Supabase and desktop agent | Before bridge register |
| Research | `RESEARCH_LAB_ENABLED` | Enables research jobs | Yes | `true` | `true` | Supabase secrets | Before research verification |
| Monitoring | `MONITORING_ALERT_WEBHOOK_URL` | Optional alert sink | No | None | `https://...` | Supabase secrets | Before alert verification |
| Security | `HASHIBOT_ENCRYPTION_KEY` | Application encryption | Yes | None | base64 32 bytes | Supabase secrets | Before bootstrap |
| Security | `JWT_SECRET` | Optional custom JWT validation | No | Supabase managed | 32+ random chars | Supabase secrets if used | Before API verification |
| Admin Bootstrap | `BOOTSTRAP_OWNER_EMAIL` | First owner email | Yes | None | `owner@example.com` | Local operator env | During bootstrap |
| Admin Bootstrap | `BOOTSTRAP_OWNER_PASSWORD` | First owner password | Yes | None | strong password | Local operator env | During bootstrap |
| Future Optional | `OPENAI_API_KEY` | Future research assistants | No | None | `sk-...` | Supabase secrets | Only when feature enabled |
