#!/usr/bin/env bash
set -euo pipefail; source "$(dirname "$0")/common-demo.sh"
for c in gcloud docker terraform curl node; do command -v "$c" >/dev/null || { echo "missing:$c" >&2; exit 1; }; done
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . || { echo no-active-google-account >&2; exit 1; }
[[ "$(gcloud config get-value project 2>/dev/null)" == "$PROJECT_ID" ]] || { echo wrong-gcloud-project >&2; exit 1; }
gcloud beta billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' | grep -qx True || { echo billing-not-enabled >&2; exit 1; }
required=(run.googleapis.com artifactregistry.googleapis.com pubsub.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com monitoring.googleapis.com logging.googleapis.com cloudbuild.googleapis.com)
enabled=$(gcloud services list --enabled --project "$PROJECT_ID" --format='value(config.name)'); for api in "${required[@]}"; do grep -qx "$api" <<<"$enabled" || { echo "missing-api:$api" >&2; exit 1; }; done
for secret in supabase-url supabase-server-credential binance-testnet-api-key binance-testnet-secret bybit-demo-api-key bybit-demo-secret telegram-test-bot-token telegram-private-test-chat-id forex-market-data-api-key mt5-bridge-authentication-secret internal-runtime-authentication-secret; do gcloud secrets versions list "$secret" --project "$PROJECT_ID" --filter='state=ENABLED' --format='value(name)' | grep -q . || { echo "missing-enabled-secret-version:$secret" >&2; exit 1; }; done
echo 'Phase 13B preflight passed; credentials were not read or printed.'
