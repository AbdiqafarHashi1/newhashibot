#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
bash cloud/scripts/build.sh "${1:-portable-worker}"
# Environment is supplied by the caller; never source an absent file or execute
# arbitrary shell from a credentials file. Default mode only checks configuration.
exec node work/phase-p/cloud-build/worker.mjs
