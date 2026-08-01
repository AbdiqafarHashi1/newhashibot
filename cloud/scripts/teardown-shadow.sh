#!/usr/bin/env bash
set -euo pipefail; source "$(dirname "$0")/common-demo.sh"; [[ "${TEARDOWN_APPROVED:-false}" == true ]] || { echo TEARDOWN_APPROVED=true-required >&2; exit 2; }; terraform -chdir=cloud/infrastructure/terraform/environments/demo destroy -var-file=demo.tfvars -var deploy_approved=true
