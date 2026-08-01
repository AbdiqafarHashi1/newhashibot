# HashiBot Google Cloud demo shadow platform (Phase 13B)

This directory is **deploy-ready, not evidence of provisioning or deployment**. It targets only `hashibot-demo` in `us-central1`. Supabase remains authoritative; all Google services run with `environment=demo`, `runtime_mode=shadow`, and `mutation_authorized=false`.

## Pipelines

* `cloudbuild.validate.yaml`: automatic `main` validation; never pushes, provisions, or deploys.
* `cloudbuild.shadow-deploy.yaml`: manually approved demo deployment; validates, builds five images, pushes three tags, resolves immutable digests, plans/applies the demo root, updates private Cloud Run services, and emits a certification artifact.
* `cloudbuild.yaml`: compatibility copy of validation.

Create second-generation regional triggers: `hashibot-main-validation`, repository `AbdiqafarHashi1-newhashibot`, branch `^main$`, file `/cloud/cloudbuild.validate.yaml`, automatic; and `hashibot-shadow-deploy`, same repository, file `/cloud/cloudbuild.shadow-deploy.yaml`, manual/protected and approval-required. Both use `hashibot-runtime@hashibot-demo.iam.gserviceaccount.com`. Replace the old `hashibot-main` trigger; never make deployment automatic on `main`.

## Safe deployment

1. Copy `environments/demo/demo.tfvars.example` to `demo.tfvars`; set only billing account and reviewed image SHA. Secret values never belong in tfvars.
2. Run `cloud/scripts/phase13-preflight.sh`.
3. Add enabled secret versions manually with `gcloud secrets versions add NAME --data-file=-`.
4. Run validation, then invoke the approval-protected deployment trigger with `_DEPLOY_APPROVED=true`.

Use a versioned, uniform-access GCS backend bucket with object versioning and retention. Terraform's GCS backend locks state automatically. Configure the backend outside source control before applying. Scheduler jobs start paused. The root does not provision VPC, NAT, load balancer, Cloud Armor, or a Windows VM.
