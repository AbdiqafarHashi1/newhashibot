#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
SERVICE="${1:-health}"
set -a; source "${HASHIBOT_ENV_FILE:-cloud/environments/dev/.env.example}"; set +a
export HASHIBOT_SERVICE="$SERVICE"
cloud/scripts/build.sh "$SERVICE"
exec node ".tmp/cloud-build/$SERVICE.mjs"
