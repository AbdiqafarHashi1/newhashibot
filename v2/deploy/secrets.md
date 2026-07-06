# Secret Provisioning Order

1. Generate `HASHIBOT_ENCRYPTION_KEY`, `PLATFORM_API_TOKEN`, and `HASHIBRIDGE_SHARED_SECRET` with a cryptographic random generator.
2. Create Supabase project and copy `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Set Supabase Edge secrets:
   ```bash
   supabase secrets set --project-ref <ref> SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... HASHIBOT_ENV=production PLATFORM_API_TOKEN=... HASHIBOT_ENCRYPTION_KEY=...
   ```
4. Create Telegram bots with BotFather and set `TELEGRAM_FREE_BOT_TOKEN`, `TELEGRAM_VIP_BOT_TOKEN`, and `TELEGRAM_ADMIN_OPS_BOT_TOKEN`.
5. Add bot tokens and chat IDs to Supabase secrets after channel binding.
6. Create Binance and Bybit testnet API keys with trading permission only, no withdrawal permission.
7. Add provider keys to Supabase secrets.
8. Create MT5 demo credentials and store account metadata in Supabase secrets; keep login password only in the desktop agent secret store unless an Edge Function explicitly needs it.
9. Configure Netlify variables from `environment.md`.
10. Configure local bootstrap variables only for the bootstrap session.

## Verification

- `supabase secrets list --project-ref <ref>` must show all required names without printing secret values.
- `curl -H "Authorization: Bearer $PLATFORM_API_TOKEN" "$SUPABASE_FUNCTIONS_URL/runtime-health"` must return healthy JSON.
- Netlify deploy logs must show required `VITE_*` variables present without leaking values.

## HashiBridge signing secret

`HASHIBRIDGE_SHARED_SECRET` is used only to verify HMAC-SHA256 signed bridge/agent requests. Rotate it by updating Supabase secrets and the desktop agent secret store together. Do not log the secret, generated signatures, MT5 passwords, or credential values. Signed requests must include `x-hashibridge-device-id`, `x-hashibridge-timestamp`, `x-hashibridge-nonce`, and `x-hashibridge-signature`.
