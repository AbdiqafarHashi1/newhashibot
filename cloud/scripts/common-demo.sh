#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-hashibot-demo}"; REGION="${REGION:-us-central1}"; SERVICES=(decision-runtime execution-runtime trade-runtime communications-runtime operations-runtime)
[[ "$PROJECT_ID" == hashibot-demo ]] || { echo 'Refusing non-demo project' >&2; exit 2; }; [[ "$REGION" == us-central1 ]] || { echo 'Refusing non-demo region' >&2; exit 2; }
