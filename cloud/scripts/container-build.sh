#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
SERVICE="${1:-health}"
docker build -f cloud/Dockerfile --build-arg "SERVICE=$SERVICE" --build-arg "BUILD_ID=local" --build-arg "REVISION=$(git rev-parse --short HEAD)" -t "hashibot-$SERVICE:local" .
