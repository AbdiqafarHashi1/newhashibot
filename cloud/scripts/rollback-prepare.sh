#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-.tmp/cloud-rollback-preparation.txt}"; mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<EOF
ROLLBACK PREPARATION ONLY — no runtime changes performed
generated_at=$(date -u +%FT%TZ)
revision=$(git rev-parse HEAD)
required_checks=stop_publication,park_queue,reconcile_supabase_provider,verify_no_inflight_mutation,transfer_ownership_lease,restore_edge_owner
EOF
echo "$OUT"
