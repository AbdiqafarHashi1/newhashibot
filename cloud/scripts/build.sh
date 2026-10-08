#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "${1:-portable-worker}" == portable-worker ]] || { echo 'Only portable-worker is implemented' >&2; exit 2; }
mkdir -p work/phase-p/cloud-build
./node_modules/.bin/esbuild cloud/worker/index.ts --bundle --platform=node --format=esm --target=node24 --packages=external --outfile=work/phase-p/cloud-build/worker.mjs
