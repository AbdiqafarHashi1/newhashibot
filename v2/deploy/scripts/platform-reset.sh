#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-soft}"
HASHIBOT_ENV="${HASHIBOT_ENV:-production}"
ALLOW="${PLATFORM_RESET_ALLOW_DESTRUCTIVE:-false}"
if [[ "$MODE" == "factory" || "$MODE" == "trade-truth" ]]; then
  if [[ "$HASHIBOT_ENV" != "development" || "$ALLOW" != "true" ]]; then
    echo "Refusing destructive reset outside explicit development mode." >&2
    exit 2
  fi
fi
echo "Running ${MODE} reset plan. Apply SQL from reset-initialization.md using a privileged maintenance session."
echo "Reinitialize packages, roles, Telegram templates/routes, monitoring summaries, caches, registries, HashiCore, scanner, and first scan."
