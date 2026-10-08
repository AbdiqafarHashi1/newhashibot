#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname "$0")/container-build.sh" portable-worker
