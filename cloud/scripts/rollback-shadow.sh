#!/usr/bin/env bash
set -euo pipefail; source "$(dirname "$0")/common-demo.sh"; revision="${1:?known-good revision required}"; for s in "${SERVICES[@]}"; do gcloud run services update-traffic "hashibot-$s" --project "$PROJECT_ID" --region "$REGION" --to-revisions "$revision=100"; done
