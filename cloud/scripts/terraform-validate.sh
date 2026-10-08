#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../infrastructure/terraform/portable-worker"
command -v terraform >/dev/null || { echo 'TERRAFORM_VALIDATE: NOT_RUN (terraform unavailable)'; exit 0; }
terraform init -backend=false -input=false
terraform validate
