#!/usr/bin/env bash
set -euo pipefail
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${BOOTSTRAP_OWNER_EMAIL:?BOOTSTRAP_OWNER_EMAIL is required}"
: "${BOOTSTRAP_OWNER_PASSWORD:?BOOTSTRAP_OWNER_PASSWORD is required}"
echo "Bootstrap owner request prepared for ${BOOTSTRAP_OWNER_EMAIL}. Use Supabase Auth Admin API or platform-api bootstrap endpoint in the production operator session."
echo "Verify: owner user exists, owner role assigned, admin permissions effective, packages seeded, platform-api health healthy."
