#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "${1:-portable-worker}" == portable-worker ]] || exit 2
args=()
if [[ -n "${CODEX_PROXY_CERT:-}" ]]; then args+=(--secret "id=proxy_ca,src=$CODEX_PROXY_CERT"); fi
docker build "${args[@]}" -f cloud/Dockerfile --build-arg "REVISION=$(git rev-parse HEAD)" -t hashibot-portable-worker:local .
