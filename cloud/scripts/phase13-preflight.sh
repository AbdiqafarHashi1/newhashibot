#!/usr/bin/env bash
set -euo pipefail
missing=()
for name in HASHIBOT_DEMO_PROJECT_ID HASHIBOT_DEMO_REGION HASHIBOT_BILLING_ACCOUNT; do test -n "${!name:-}" || missing+=("$name"); done
test "${HASHIBOT_PROMO_CREDIT_CONFIRMED:-false}" = true || missing+=(HASHIBOT_PROMO_CREDIT_CONFIRMED)
test "${HASHIBOT_PHASE13_APPLY_APPROVED:-false}" = true || missing+=(HASHIBOT_PHASE13_APPLY_APPROVED)
command -v gcloud >/dev/null || missing+=(gcloud)
(command -v terraform >/dev/null || command -v tofu >/dev/null) || missing+=(terraform_or_tofu)
command -v docker >/dev/null || missing+=(docker)
test -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)" || missing+=(active_google_account)
if ((${#missing[@]})); then printf 'PHASE13_BLOCKED missing=%s\n' "$(IFS=,; echo "${missing[*]}")"; exit 13; fi
configured="$(gcloud config get-value project 2>/dev/null)"
test "$configured" = "$HASHIBOT_DEMO_PROJECT_ID" || { echo "Configured project does not match approved project"; exit 14; }
echo "PHASE13_PREFLIGHT_READY project=$HASHIBOT_DEMO_PROJECT_ID region=$HASHIBOT_DEMO_REGION"
