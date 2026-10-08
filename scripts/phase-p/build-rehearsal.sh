#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p work/phase-p/offline
curl -fsSL https://codeload.github.com/citusdata/pg_cron/tar.gz/refs/tags/v1.6.7 -o work/phase-p/offline/pg-cron.tar.gz
curl -fsSL https://codeload.github.com/supabase/pg_net/tar.gz/refs/tags/v0.14.0 -o work/phase-p/offline/pg-net.tar.gz
cp tests/phaseP/rehearsal.Dockerfile work/phase-p/offline/Dockerfile
args=()
if [[ -n "${CODEX_PROXY_CERT:-}" ]]; then args+=(--secret "id=proxy_ca,src=$CODEX_PROXY_CERT"); fi
docker --host=unix:///var/run/docker.sock build "${args[@]}" -t hashibot-migration-rehearsal:local work/phase-p/offline
