# 15 Security and Secrets Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Secret inventory
Values were not reproduced. Configure V2 secrets in the new Supabase project, deployment platform, and bridge installer/secure customer vault as appropriate.

| Secret name | Purpose | Used by | Surface | V1 discovered | V2 required | Configure in V2 |
|---|---|---|---|---:|---:|---|
| VITE_HASHIBOT_SUPABASE_URL / VITE_SUPABASE_URL / VITE_PUBLIC_SUPABASE_URL | Public Supabase URL | Web app | frontend | yes | yes | web deployment env |
| VITE_HASHIBOT_SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY / VITE_PUBLIC_SUPABASE_ANON_KEY / publishable variants | Public anon/publishable key | Web app | frontend | yes | yes | web deployment env |
| SUPABASE_URL | Internal Supabase URL | Edge/scripts/services | backend/edge | yes | yes | Supabase Edge secrets and service env |
| SUPABASE_SERVICE_ROLE_KEY | Privileged DB access | Edge/scripts/services | backend/edge | yes | yes | secure server/Edge secrets only |
| SCANNER_CRON_SECRET / HASHIBOT_CRON_TOKEN / INTERNAL_CRON_TOKEN | Cron/internal auth | scheduled functions/scripts | backend/edge | yes | likely | service secret manager |
| TELEGRAM_BOT_TOKEN | Telegram bot API | Telegram functions | edge/backend | yes | yes | Supabase/deployment secrets |
| TELEGRAM_CHAT_ID / TELEGRAM_DEFAULT_CHANNEL_ID | VIP/default channel | Telegram | edge/backend | yes | yes | Telegram platform settings/secrets |
| TELEGRAM_ADMIN_CHAT_ID / TELEGRAM_FREE_CHAT_ID | Admin/free channels | Telegram | edge/backend | yes | yes | Telegram platform settings/secrets |
| TWELVEDATA_API_KEY / FOREX_DATA_API_KEY | Forex HTTP data | scanner/outcome | edge/backend | yes | optional | research or fallback provider env |
| FINNHUB_API_KEY | Diagnostics/fallback | scanner diagnostics | edge/backend | yes | optional | diagnostics env if retained |
| BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_API_SECRET | V1 testnet execution | execution/monitor/scripts | backend | yes | no for production; yes lab | lab secret vault |
| BINANCE_TESTNET_BASE_URL | Testnet endpoint guard | execution/scripts | backend | yes | lab only | lab env |
| BYBIT_API_KEY / BYBIT_API_SECRET / BYBIT_TESTNET_API_KEY / BYBIT_TESTNET_API_SECRET | Bybit demo/testnet/live keys | execution/monitor | backend | yes | customer-vault per account | encrypted customer account vault |
| BYBIT_BASE_URL / BYBIT_TESTNET_BASE_URL / BYBIT_ENVIRONMENT / BYBIT_MODE | Bybit endpoint/mode | execution/monitor | backend | yes | yes | service env per environment |
| MT5_BRIDGE_BASE_URL / MT5_BRIDGE_SECRET | MT5 bridge diagnostics | provider health | backend/bridge | referenced | yes redesigned | bridge identity/vault, not frontend |
| EXECUTION_MODE / EXCHANGE / TESTNET_ENABLED / LIVE_TRADING_ENABLED / BINANCE_LIVE_TRADING / BYBIT_LIVE_TRADING | Execution safety toggles | execution | backend | yes | yes redesigned | feature flags/runtime config |

## Findings
- A production env file containing public Supabase URL/anon key is present. Anon keys are public by design, but V2 should avoid committing environment-specific files and should document rotation/allowed origins.
- Customer exchange keys must not be global deployment secrets in V2; store encrypted per customer/account with adapter-scoped access.
