locals {
  services         = toset(["decision-runtime", "execution-runtime", "trade-runtime", "communications-runtime", "operations-runtime"])
  runtime_accounts = setunion(local.services, toset(["scheduler", "mt5-agent"]))
  apis             = toset(["artifactregistry.googleapis.com", "run.googleapis.com", "pubsub.googleapis.com", "secretmanager.googleapis.com", "cloudscheduler.googleapis.com", "monitoring.googleapis.com", "logging.googleapis.com", "cloudbuild.googleapis.com", "iam.googleapis.com", "cloudbilling.googleapis.com"])
  topics           = toset(["shadow-scan-commands", "shadow-runtime-events", "shadow-provider-intents", "shadow-provider-results", "shadow-trade-events", "shadow-recovery-events", "shadow-telegram-previews", "shadow-certification-events", "runtime-incidents"])
  secrets          = toset(["supabase-url", "supabase-server-credential", "binance-testnet-api-key", "binance-testnet-secret", "bybit-demo-api-key", "bybit-demo-secret", "telegram-test-bot-token", "telegram-private-test-chat-id", "forex-market-data-api-key", "mt5-bridge-authentication-secret", "internal-runtime-authentication-secret"])
  schedulers = {
    scanner-evaluation = "*/5 * * * *", provider-state-reconciliation = "*/10 * * * *", trade-lifecycle-evaluation = "*/2 * * * *", mt5-heartbeat-verification = "*/5 * * * *", certification-summary = "0 * * * *"
  }
}
resource "terraform_data" "safety" {
  lifecycle {
    precondition {
      condition     = var.project_id == "hashibot-demo" && var.region == "us-central1" && var.environment == "demo"
      error_message = "Demo-only safety boundary violated."
    }
    precondition {
      condition     = var.deploy_approved
      error_message = "Explicit reviewed deployment approval is required."
    }
  }
}
resource "google_project_service" "required" {
  for_each           = local.apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
resource "google_service_account" "runtime" {
  for_each     = local.runtime_accounts
  project      = var.project_id
  account_id   = "hashibot-${each.value}"
  display_name = "HashiBot ${each.value} (demo shadow)"
  depends_on   = [google_project_service.required]
}
resource "google_artifact_registry_repository" "images" {
  provider       = google-beta
  project        = var.project_id
  location       = var.region
  repository_id  = "hashibot-demo"
  format         = "DOCKER"
  immutable_tags = true
  cleanup_policies {
    id     = "retain-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 25
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
      tag_state  = "ANY"
    }
  }
}
resource "google_artifact_registry_repository_iam_member" "build_push" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:hashibot-runtime@${var.project_id}.iam.gserviceaccount.com"
}
resource "google_artifact_registry_repository_iam_member" "runtime_pull" {
  for_each   = local.services
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.runtime[each.key].email}"
}
resource "google_secret_manager_secret" "container" {
  for_each  = local.secrets
  project   = var.project_id
  secret_id = each.value
  replication {
    auto {}
  }
}
resource "google_pubsub_topic" "topic" {
  for_each                   = local.topics
  project                    = var.project_id
  name                       = each.value
  message_retention_duration = "604800s"
  message_storage_policy {
    allowed_persistence_regions = [var.region]
  }
}
resource "google_pubsub_topic" "dlq" {
  for_each = local.topics
  project  = var.project_id
  name     = "${each.value}-dlq"
}
resource "google_pubsub_subscription" "runtime" {
  for_each                   = local.topics
  project                    = var.project_id
  name                       = "${each.value}-runtime"
  topic                      = google_pubsub_topic.topic[each.key].id
  ack_deadline_seconds       = 60
  message_retention_duration = "604800s"
  enable_message_ordering    = true
  filter                     = "attributes.environment = \"demo\" AND attributes.runtime_mode = \"shadow\" AND attributes.mutation_authorized = \"false\""
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dlq[each.key].id
    max_delivery_attempts = 5
  }
}
resource "google_cloud_run_v2_service" "runtime" {
  for_each            = local.services
  project             = var.project_id
  location            = var.region
  name                = "hashibot-${each.value}"
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false
  template {
    service_account = google_service_account.runtime[each.key].email
    timeout         = "60s"
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/hashibot-demo/hashibot-${each.value}:${var.image_tag}"
      resources {
        limits = { cpu = "1", memory = each.key == "trade-runtime" ? "1Gi" : "512Mi" }
      }
      env {
        name  = "HASHIBOT_ENVIRONMENT"
        value = "demo"
      }
      env {
        name  = "RUNTIME_MODE"
        value = "shadow"
      }
      env {
        name  = "MUTATION_AUTHORIZED"
        value = "false"
      }
      env {
        name  = "PROVIDER_MUTATION_ENABLED"
        value = "false"
      }
      env {
        name  = "PRODUCTION_EXECUTION_ENABLED"
        value = "false"
      }
      startup_probe {
        http_get {
          path = "/health/live"
        }
      }
      liveness_probe {
        http_get {
          path = "/health/live"
        }
      }
    }
  }
  lifecycle {
    precondition {
      condition     = var.environment == "demo"
      error_message = "Production is prohibited."
    }
  }
}
resource "google_cloud_scheduler_job" "shadow" {
  for_each = local.schedulers
  project  = var.project_id
  region   = var.region
  name     = "shadow-${each.key}"
  schedule = each.value
  paused   = !var.scheduler_enabled
  pubsub_target {
    topic_name = google_pubsub_topic.topic["shadow-scan-commands"].id
    data       = base64encode(jsonencode({ schema_version = 1, environment = "demo", runtime_mode = "shadow", mutation_authorized = false, command_type = each.key, shadow_runtime_id = "scheduler", timestamp = "$${scheduleTime}" }))
    attributes = { environment = "demo", runtime_mode = "shadow", mutation_authorized = "false" }
  }
}
resource "google_logging_metric" "mutation_attempt" {
  project = var.project_id
  name    = "hashibot/mutation_attempt"
  filter  = "resource.type=\"cloud_run_revision\" AND jsonPayload.event=\"PROVIDER_MUTATION_REJECTED\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}
resource "google_monitoring_alert_policy" "mutation" {
  project      = var.project_id
  display_name = "CRITICAL HashiBot shadow mutation attempt"
  combiner     = "OR"
  conditions {
    display_name = "Any mutation attempt"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/hashibot/mutation_attempt\" resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
}
resource "google_billing_budget" "demo" {
  provider        = google-beta
  billing_account = var.billing_account
  display_name    = "HashiBot demo trial budget"
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1
  }
  all_updates_rule {
    disable_default_iam_recipients = false
  }
}
