#!/usr/bin/env bash
set -euo pipefail
test "${HASHIBOT_IAC_PREVIEW_APPROVED:-false}" = true || { echo "Set HASHIBOT_IAC_PREVIEW_APPROVED=true for a non-mutating plan preview." >&2; exit 3; }
ENVIRONMENT="${1:-dev}"; case "$ENVIRONMENT" in dev|beta|prod);; *) exit 2;; esac
test -n "${TF_VAR_project_id:-}" || { echo "TF_VAR_project_id placeholder must be supplied" >&2; exit 4; }
cd "$(dirname "$0")/../infrastructure/terraform/environments/$ENVIRONMENT"
BIN="$(command -v tofu || command -v terraform)"; "$BIN" init -backend=false; "$BIN" plan -refresh=false -lock=false
