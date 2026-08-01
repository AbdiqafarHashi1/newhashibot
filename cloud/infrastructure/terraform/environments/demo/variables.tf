variable "project_id" {
  type    = string
  default = "hashibot-demo"
  validation {
    condition     = var.project_id == "hashibot-demo"
    error_message = "Only hashibot-demo is permitted."
  }
}
variable "region" {
  type    = string
  default = "us-central1"
  validation {
    condition     = var.region == "us-central1"
    error_message = "Only us-central1 is permitted."
  }
}
variable "environment" {
  type    = string
  default = "demo"
  validation {
    condition     = var.environment == "demo"
    error_message = "No production root exists."
  }
}
variable "deploy_approved" {
  type    = bool
  default = false
}
variable "image_tag" {
  type    = string
  default = "bootstrap"
}
variable "billing_account" {
  type      = string
  sensitive = true
}
variable "monthly_budget_usd" {
  type    = number
  default = 75
}
variable "scheduler_enabled" {
  type    = bool
  default = false
}
