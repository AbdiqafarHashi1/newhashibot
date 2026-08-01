# Secret rotation

Create a new enabled Secret Manager version through an approved secure terminal, never Terraform or Cloud Build substitutions. Restart affected demo revisions, verify readiness, then disable (do not immediately destroy) the prior version. Never echo values. If latest is absent, runtime readiness must fail closed.
