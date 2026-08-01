terraform {
  required_version = ">= 1.6.0"
  # Future remote state: dedicated state project, versioned GCS bucket,
  # uniform access, retention, CMEK if required, and per-environment prefix.
  # backend "gcs" is intentionally not activated in Phase 10.
}
