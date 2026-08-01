variable "project_id" { type = string }
variable "region" { type = string  default = "us-central1" }
variable "deployment_enabled" {
  type = bool
  default = false
  validation {
    condition = var.deployment_enabled == false
    error_message = "Phase 10 deployment must remain disabled."
  }
}
