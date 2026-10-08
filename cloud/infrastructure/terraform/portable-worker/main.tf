terraform {
  required_version = ">= 1.6, < 2.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}
provider "google" {
  project = var.project_id
  region  = var.region
}
variable "deployment_enabled" {
  type    = bool
  default = false
}
variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-central1"
}
variable "image_digest" {
  type = string
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.image_digest))
    error_message = "Use an immutable Artifact Registry image digest."
  }
}
variable "revision" { type = string }
variable "supabase_url_secret" { type = string }
variable "supabase_server_secret" { type = string }
variable "worker_enabled" {
  type    = bool
  default = false
}
resource "google_artifact_registry_repository" "worker" {
  count         = var.deployment_enabled ? 1 : 0
  location      = var.region
  repository_id = "hashibot-portable-workers"
  format        = "DOCKER"
}
resource "google_service_account" "worker" {
  count      = var.deployment_enabled ? 1 : 0
  account_id = "hashibot-portable-worker"
}
resource "google_service_account" "invoker" {
  count      = var.deployment_enabled ? 1 : 0
  account_id = "hashibot-worker-invoker"
}
resource "google_secret_manager_secret_iam_member" "references" {
  for_each  = var.deployment_enabled ? toset([var.supabase_url_secret, var.supabase_server_secret]) : toset([])
  project   = var.project_id
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker[0].email}"
}
resource "google_cloud_run_v2_job" "worker" {
  count    = var.deployment_enabled ? 1 : 0
  name     = "hashibot-portable-worker"
  location = var.region
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.worker[0].email
      timeout         = "60s"
      max_retries     = 0 # durable application retry is the only retry authority
      containers {
        image = var.image_digest
        resources {
          limits = { cpu = "1", memory = "512Mi" }
        }
        env {
          name  = "HASHIBOT_WORKER_MODE"
          value = "once"
        }
        env {
          name  = "HASHIBOT_WORKER_ENABLED"
          value = tostring(var.worker_enabled)
        }
        env {
          name  = "HASHIBOT_REVISION"
          value = var.revision
        }
        env {
          name = "SUPABASE_URL"
          value_source {
            secret_key_ref {
              secret  = var.supabase_url_secret
              version = "latest"
            }
          }
        }
        env {
          name = "SUPABASE_SERVICE_ROLE_KEY"
          value_source {
            secret_key_ref {
              secret  = var.supabase_server_secret
              version = "latest"
            }
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.references]
}
resource "google_cloud_run_v2_job_iam_member" "invoke" {
  count    = var.deployment_enabled ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.worker[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.invoker[0].email}"
}
# No public invoker, Scheduler, API enablement, billing changes or execution identity.
# A separately authorized deployment must enable required APIs and bind the owner
# to the invoker identity. This file cannot activate a schedule.
