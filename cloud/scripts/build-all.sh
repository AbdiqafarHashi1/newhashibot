#!/usr/bin/env bash
set -euo pipefail; source "$(dirname "$0")/common-demo.sh"; SHA="${1:-local}"; REGISTRY="${REGISTRY:-local}"
for service in "${SERVICES[@]}"; do image="$REGISTRY/hashibot-$service"; docker build -f cloud/Dockerfile --build-arg SERVICE="$service" --build-arg REVISION="$SHA" --build-arg BUILD_ID="${BUILD_ID:-local}" -t "$image:$SHA" -t "$image:${BUILD_ID:-local}" -t "$image:shadow" .; done
