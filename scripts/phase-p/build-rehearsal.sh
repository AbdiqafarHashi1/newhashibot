#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p work/phase-p/offline
curl -fsSL https://codeload.github.com/citusdata/pg_cron/tar.gz/refs/tags/v1.6.7 -o work/phase-p/offline/pg-cron.tar.gz
curl -fsSL https://codeload.github.com/supabase/pg_net/tar.gz/refs/tags/v0.14.0 -o work/phase-p/offline/pg-net.tar.gz
curl -fsSL https://codeload.github.com/supabase/vault/tar.gz/refs/tags/v0.3.1 -o work/phase-p/offline/vault.tar.gz
cp tests/phaseP/rehearsal.Dockerfile work/phase-p/offline/Dockerfile
major="${HASHIBOT_REHEARSAL_PG_MAJOR:-15}"
case "$major" in
  15) base_image="debian:bookworm-slim" ;;
  17) base_image="postgres:17.6-bookworm" ;;
  *) echo "Unsupported rehearsal PostgreSQL major" >&2; exit 1 ;;
esac
args=(--build-arg "PG_MAJOR=$major" --build-arg "BASE_IMAGE=$base_image")
if [[ -n "${CODEX_PROXY_CERT:-}" ]]; then args+=(--secret "id=proxy_ca,src=$CODEX_PROXY_CERT"); fi
docker --host=unix:///var/run/docker.sock build "${args[@]}" -t hashibot-migration-rehearsal:local work/phase-p/offline

