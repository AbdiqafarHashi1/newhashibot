#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run typecheck:cloud
npm run lint:cloud
npm run test:cloud
bash cloud/scripts/build.sh
HASHIBOT_WORKER_MODE=check node work/phase-p/cloud-build/worker.mjs
git diff --check
bash cloud/scripts/terraform-format.sh
bash cloud/scripts/terraform-validate.sh
bash cloud/infrastructure/terraform/tests/foundation.sh
