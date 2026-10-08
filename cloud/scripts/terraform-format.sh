#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v terraform >/dev/null || { echo 'TERRAFORM_FORMAT: NOT_RUN (terraform unavailable)'; exit 0; }
terraform fmt -check cloud/infrastructure/terraform/portable-worker
