# Telegram Bootstrap

1. Create `FREE`, `VIP`, and `ADMIN_OPS` bots in BotFather.
2. Add bots to the correct channels/groups and collect chat IDs.
3. Set Supabase secrets for all tokens and chat IDs.
4. Deploy `telegram-platform` Edge Function.
5. Configure webhooks to `$SUPABASE_FUNCTIONS_URL/telegram-platform/webhook/<tier>` or use polling only for local diagnostics.
6. Verify templates, routes, delivery, retry, and failure handling by sending one test message per tier.
