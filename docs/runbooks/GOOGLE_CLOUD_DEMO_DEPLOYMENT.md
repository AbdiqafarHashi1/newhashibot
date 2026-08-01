# Google Cloud Demo Deployment

Run `cloud/scripts/phase13-preflight.sh`; do not continue unless it reports READY. Review estimated cost and Terraform plan, obtain manual apply approval, bootstrap federated identities, apply demo-only infrastructure with the approved project/region, build immutable digests in Cloud Build, deploy five services with zero traffic ownership and mutation gates false, verify health and IAM, then enable one shadow-safe subscription/job at a time. Record every command, plan, revision and health result. This runbook was not executed in this environment.
