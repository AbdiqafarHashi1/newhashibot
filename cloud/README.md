# HashiBot Google Cloud foundation (Phase 10)

This directory is a **dormant, local-only foundation** for the architecture in [`docs/architecture/GOOGLE_CLOUD_MIGRATION.md`](../docs/architecture/GOOGLE_CLOUD_MIGRATION.md). It does not deploy, subscribe to production, change Supabase, or register business workers.

Locked roadmap: **Phase 10 — Google Cloud Foundation (COMPLETE); Phase 11 — Portable HashiBot Core; Phase 12 — Google Cloud Runtime Services; Phase 13 — Demo Infrastructure + Shadow Certification; Phase 14 — Demo Cutover + Certification.** Work targets the HashiBot demo only; customer functionality is outside current scope. Logical service boundaries are ownership boundaries and need not become one-for-one deployment boundaries.

## Layout and ownership

- `services/`: compileable health-first boundaries for scanner, strategy, risk, capital, execution, protection, recovery, provider, Telegram, reporting, customer, operations, health, and certification.
- `shared/`: versioned contracts, strict configuration, structured logging, health, Pub/Sub, idempotency, execution safety, service runtime, and server-only Supabase integration.
- `infrastructure/terraform/`: interface-only modules and dev/beta/prod roots. Every root enforces `deployment_enabled = false`; no Google resources/providers are declared.
- `scripts/`: local validation/build/start, container build, safe IaC preview, disabled deployment, and rollback preparation.
- `tests/`: contract, safety, health, startup, shutdown, retry, logging, and idempotency tests.

Services share one multi-stage Dockerfile selected with `--build-arg SERVICE=<name>`. The final image runs as UID 10001 and receives configuration/secrets only at runtime. `cloud/cloudbuild.yaml` validates, tests, builds, audits, and emits metadata; it contains no deploy step.

## Safety and ownership

Supabase remains authoritative for Auth, database, customer, signal/trade truth, reporting, Realtime, and Storage. The in-memory Pub/Sub/idempotency adapters are tests only. All workers are unregistered and `RUNTIME_ENABLED`, `PROVIDER_MUTATION_ENABLED`, and `PRODUCTION_EXECUTION_ENABLED` default false. Execution-like services must additionally prove authorization, scope, idempotency, correlation, runtime ownership lease, and Supabase reconciliation.

## Local quick start

```bash
npm run typecheck:cloud
npm run test:cloud
bash cloud/scripts/local-start.sh health
curl http://localhost:8080/health/live
```

Example files contain placeholders, never usable credentials. See the local development and deployment precheck runbooks before using any script.

## Intentionally unimplemented

There are no Google SDK adapters, production subscribers, business logic copies, provider mutations, production Supabase connections, Terraform Google resources, active remote state, artifact pushes, Cloud Run deployments, schedules, or migration routing. Those require later separately approved phases.
