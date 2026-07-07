# HashiBot Recovery Phase 4 — Staging Verification Runbook

## Workspace result

Phase 4 requires access to the NEW Supabase staging project and a staging frontend host. This workspace does not contain a Supabase access token, staging project ref, staging database URL, service-role key, or hosting credentials. Production `.env.production` exists but must not be used for this task.

Because those staging credentials are absent, the backend was **not** deployed, no users were created remotely, no frontend was deployed, and production was not touched.

## Required inputs before running Phase 4

- `SUPABASE_ACCESS_TOKEN` for the staging project, or direct SQL editor access.
- New Supabase staging project ref / URL.
- New Supabase staging database connection string for migration application, or permission to paste SQL into SQL editor.
- Staging anon key for V1 frontend.
- Staging service-role key for admin-only bootstrap scripts; never expose it to the browser.
- Staging frontend host credentials, such as Netlify/Vercel project access.

## SQL application order

1. Apply every migration in `v2/supabase/migrations` in timestamp order.
2. Apply `v2/supabase/migrations/20260706090000_v1_frontend_compat_backend_foundation.sql`.
3. Apply `v2/supabase/migrations/20260706110000_v1_frontend_staging_compatibility_expansion.sql`.
4. Run `v2/supabase/seed-docs/recovery_phase2_seed.sql`.
5. Run `v2/supabase/verification/phase4_staging_smoke.sql`.

## Bootstrap records to create in staging

Create these only in the new staging Supabase project:

1. Owner/admin auth user.
2. Matching `profiles` row with `platform_role = 'owner'` or `role = 'admin'`.
3. One test customer auth user.
4. One test package row, or use seeded `vip_signals`.
5. One `customer_subscriptions` row for the test customer.
6. One `user_access` row with `product_slug = 'signal_mode'` and `status = 'active'`.
7. Optional `telegram_links` row for Telegram page verification.
8. Optional `v2_approved_signals` row for signal page verification.

Scanner and execution must remain disabled: `v2_scanner_config.is_enabled = false`, `schedule_enabled = false`, `auto_send_telegram = false`, and `cron_job_active = false`.

## Page-by-page verification matrix

| Page / Area | Expected staging result | Verification source |
|---|---|---|
| Login | Admin and test customer can sign in | Browser |
| Admin dashboard | Loads compact summary data without raw polling errors | Browser + `v1_compat_monitoring_summary()` |
| Packages | Shows seeded packages with V1 fields | Browser + `packages` |
| Subscriptions | Shows test customer subscription/access | Browser + `customer_subscriptions`, `user_access` |
| Access requests | Reads/writes request rows in compatibility surface | Browser + `access_requests` |
| Customer dashboard | Shows access, package, Telegram, and signal state | Browser |
| Telegram pages | Reads/writes Telegram link rows | Browser + `telegram_links` |
| Signals pages | Shows seeded approved signal and details | Browser + `signals`, `signal_updates` |
| Scanner config/status | Shows disabled scanner state | Browser + `scanner_config`, `scanner_runs` |
| Provider status | Loads latest compact provider health if seeded | Browser + `provider_status` |
| Monitoring summaries | RPC returns scanner/execution/Telegram/provider/runtime health | `v1_compat_monitoring_summary()` |

## Remaining blockers before production cutover

- Phase 4 must be rerun with actual staging Supabase and hosting credentials.
- Browser verification must be completed against a staging V1 frontend URL.
- Any PostgREST insert/update issues found in staging should be fixed in compatibility views/RPCs only.
- Scanner and execution must remain disabled until separate testnet validation is complete.
- Production env vars and `hashibot.app` must remain untouched until a signed cutover window.
