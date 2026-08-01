#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run typecheck:cloud
npm run lint:cloud
npm run test:cloud
git diff --check
"$PWD/cloud/scripts/terraform-format.sh"
"$PWD/cloud/infrastructure/terraform/tests/foundation.sh"
