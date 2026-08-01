# Google Cloud Foundation — Local Development

## Prerequisites

Node 20, npm, and optionally Docker plus Terraform/OpenTofu >=1.6. No Google or production credentials are required or permitted for the test adapter.

1. Copy `cloud/environments/dev/.env.example` outside Git if customization is needed. Keep placeholder Supabase and Secret Manager references.
2. Run `npm ci`, `npm run typecheck:cloud`, and `npm run test:cloud`.
3. Run `bash cloud/scripts/local-start.sh health` and query `/health/live`, `/health/ready`, and `/health/version`.
4. Build a bundle with `bash cloud/scripts/build.sh scanner` or an image with `bash cloud/scripts/container-build.sh health`.

All service skeletons expose only health routes. Readiness means configuration parsed and registered dependencies initialized; it does not call providers, scan markets, write Supabase, or repair trades. Stop with SIGINT/SIGTERM to exercise graceful shutdown.

Never place tokens in example files, logs, events, build arguments, images, or command history. The local in-memory adapters disappear on process exit and are not truth stores.
