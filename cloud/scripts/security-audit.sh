#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; POLICY="${AUDIT_ALLOWLIST:-$ROOT/cloud/security/audit-allowlist.json}"; REPORT="${AUDIT_REPORT:-$(mktemp)}"
trap '[[ "${AUDIT_REPORT:-}" ]] || rm -f "$REPORT"' EXIT
cd "$ROOT"
npm audit --omit=dev --json >"$REPORT" 2>/dev/null || status=$?
node cloud/scripts/security-audit-policy.mjs "$REPORT" "$POLICY" "${AUDIT_NOW:-$(date -u +%F)}"
