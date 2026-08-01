#!/usr/bin/env bash
set -euo pipefail; source "$(dirname "$0")/common-demo.sh"; [[ "${TF_VAR_deploy_approved:-false}" == true ]] || { echo explicit-approval-required >&2; exit 2; }; plan="${1:?reviewed plan required}"; terraform -chdir=cloud/infrastructure/terraform/environments/demo apply -input=false "$(realpath "$plan")"
