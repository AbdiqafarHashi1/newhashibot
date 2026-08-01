output "foundation" {
  description = "Non-resource metadata proving this module is dormant."
  value = {
    module  = local.module_name
    phase   = local.phase
    enabled = var.enabled
    owners  = var.owners
  }
}
