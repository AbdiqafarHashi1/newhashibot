#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
SERVICE="${1:-health}"
test -f "cloud/services/$SERVICE/index.ts"
mkdir -p .tmp/cloud-build
npx esbuild "cloud/services/$SERVICE/index.ts" --bundle --platform=node --format=esm --target=node20 --outfile=".tmp/cloud-build/$SERVICE.mjs"
