# Owner / Admin Bootstrap

1. Confirm SQL #1-#9 and Edge Functions are deployed.
2. Export `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` locally.
3. Run `v2/deploy/scripts/bootstrap-owner.sh` to create or verify the first owner.
4. Verify owner role, admin permissions, package seed, customer approval workflow, and system health with Platform API health.
5. Remove local bootstrap environment variables from shell history/session.
