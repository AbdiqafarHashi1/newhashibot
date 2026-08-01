#!/usr/bin/env bash
set -euo pipefail; source "$(dirname "$0")/common-demo.sh"; mkdir -p artifacts; root=cloud/infrastructure/terraform/environments/demo; terraform -chdir="$root" init -input=false; terraform -chdir="$root" plan -input=false -var-file=demo.tfvars -out="$(pwd)/artifacts/demo.tfplan"
