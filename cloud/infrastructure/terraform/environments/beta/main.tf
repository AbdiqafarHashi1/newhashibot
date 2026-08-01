module "project_services" {
  source     = "../../modules/project_services"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "service_accounts" {
  source     = "../../modules/service_accounts"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "iam" {
  source     = "../../modules/iam"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "artifact_registry" {
  source     = "../../modules/artifact_registry"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "secret_manager" {
  source     = "../../modules/secret_manager"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "pubsub_topics" {
  source     = "../../modules/pubsub_topics"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "pubsub_subscriptions" {
  source     = "../../modules/pubsub_subscriptions"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "dead_letter_topics" {
  source     = "../../modules/dead_letter_topics"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "cloud_run" {
  source     = "../../modules/cloud_run"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "cloud_scheduler" {
  source     = "../../modules/cloud_scheduler"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "cloud_logging" {
  source     = "../../modules/cloud_logging"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "cloud_monitoring" {
  source     = "../../modules/cloud_monitoring"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "vpc" {
  source     = "../../modules/vpc"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "nat_static_egress" {
  source     = "../../modules/nat_static_egress"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "load_balancer" {
  source     = "../../modules/load_balancer"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "cloud_armor" {
  source     = "../../modules/cloud_armor"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}

module "budgets" {
  source     = "../../modules/budgets"
  enabled    = var.deployment_enabled
  project_id = var.project_id
  region     = var.region
  owners     = { platform = "hashibot-cloud-platform", environment = "beta" }
}
