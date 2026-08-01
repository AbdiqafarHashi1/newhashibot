# Google Cloud Deployment Precheck

## Phase 10 stop condition

Deployment is prohibited. `cloud/scripts/deploy.sh` always exits nonzero; Terraform modules reject `enabled=true`; Cloud Build has no deploy step. A plan preview is non-mutating and requires an explicit preview flag plus a placeholder project variable.

No deployment is part of Phase 11 or Phase 12. Before any later **Phase 13 — Demo Infrastructure + Shadow Certification** deployment approval, require: approved demo project/region and billing budget; organization policy; federated build/deploy identities; least-privilege IAM review; Artifact Registry and vulnerability policy; reviewed secrets/rotation without secret values in code; Supabase non-production project and scoped RPC design; provider sandboxes; quotas/connection budget; logging retention/redaction; SLO/alerts/on-call; remote-state bucket controls; reviewed Terraform plan; image digest/SBOM/provenance; rollback drill; and written security/operator approval. Customer functionality remains outside current scope.

Validation commands are `cloud/scripts/validate.sh`, `cloud/scripts/terraform-validate.sh`, and `cloud/scripts/container-build.sh health`. A future deployment pipeline must remain environment-separated, approval-gated, digest-based, auditable, and incapable of applying production from a pull request.
