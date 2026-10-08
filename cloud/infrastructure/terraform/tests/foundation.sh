#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../.."
node cloud/scripts/check-manifests.mjs
echo 'Terraform source references checked; resource schema validation is a separate check.'
