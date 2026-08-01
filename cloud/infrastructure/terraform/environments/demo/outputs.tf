output "artifact_repository_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}
output "service_urls" {
  value = { for k, v in google_cloud_run_v2_service.runtime : k => v.uri }
}
output "secret_containers" {
  value       = sort(keys(google_secret_manager_secret.container))
  description = "Names only; values and versions are never managed by Terraform."
}
