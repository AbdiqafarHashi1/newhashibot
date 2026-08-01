#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../infrastructure/terraform"
BIN="$(command -v tofu || command -v terraform || true)"; test -n "$BIN" || { echo "terraform/tofu is required" >&2; exit 2; }
for env in environments/dev environments/beta environments/prod; do (cd "$env" && "$BIN" init -backend=false && "$BIN" validate); done
