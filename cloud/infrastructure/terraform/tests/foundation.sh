#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
expected=(project_services service_accounts iam artifact_registry secret_manager pubsub_topics pubsub_subscriptions dead_letter_topics cloud_run cloud_scheduler cloud_logging cloud_monitoring vpc nat_static_egress load_balancer cloud_armor budgets)
for module in "${expected[@]}"; do
  test -f "modules/$module/main.tf"
  grep -q 'condition     = var.enabled == false' "modules/$module/variables.tf"
  if grep -Eq '^resource |^data ' "modules/$module"/*.tf; then echo "Phase 10 module $module unexpectedly declares live resources" >&2; exit 1; fi
done
for environment in dev beta prod; do
  grep -q 'deployment_enabled = false' "environments/$environment/terraform.tfvars.example"
  grep -q 'condition = var.deployment_enabled == false' "environments/$environment/variables.tf"
done
echo "Terraform foundation is complete and dormant"
