# Phase 13 Demo Infrastructure

## Current state: BLOCKED — not provisioned

The execution environment has no `gcloud`, Terraform/OpenTofu, Docker, active Google account, approved demo project/region, billing account, promotional-credit confirmation, or explicit apply approval. Provisioning without these facts would violate Phase 13. `cloud/scripts/phase13-preflight.sh` fails closed and verifies that the configured project equals the approved project.

The intended lean demo inventory is five scale-to-zero Cloud Run services, regional Artifact Registry, nine shadow Pub/Sub topics with per-consumer subscriptions/DLQs, disabled-by-default OIDC Scheduler jobs, service-scoped Secret Manager references, dedicated identities, logging/monitoring/budget alerts, and one smallest-practical Windows VM plus persistent disk. No load balancer, Armor, NAT, Cloud SQL, Linux VM, multi-region or customer resources are justified. Cost cannot be credibly estimated until project, region, Windows machine type and credit applicability are confirmed.
