#!/usr/bin/env bash
set -euo pipefail; source "$(dirname "$0")/common-demo.sh"; : "${REGISTRY:?REGISTRY required}"; SHA="${1:?commit SHA required}"
for service in "${SERVICES[@]}"; do image="$REGISTRY/hashibot-$service"; for tag in "$SHA" "${BUILD_ID:?BUILD_ID required}" shadow; do docker push "$image:$tag"; done; docker inspect --format='{{index .RepoDigests 0}}' "$image:$SHA"; done
