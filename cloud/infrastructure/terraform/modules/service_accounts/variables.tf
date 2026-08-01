variable "enabled" {
  description = "Phase gate. Must remain false during Phase 10."
  type        = bool
  default     = false

  validation {
    condition     = var.enabled == false
    error_message = "Resource creation is disabled during Phase 10."
  }
}

variable "project_id" {
  description = "Future target project ID; no default is permitted."
  type        = string
}

variable "region" {
  description = "Future regional placement."
  type        = string
}

variable "owners" {
  description = "Explicit service ownership metadata."
  type        = map(string)
  default     = {}
}
