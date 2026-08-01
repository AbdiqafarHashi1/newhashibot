# Google Cloud Implementation Foundation — Phase 10

## Decision

Phase 10 turned the Phase 9 design into repository boundaries, contracts, safety primitives, container/build definitions, dormant infrastructure interfaces, tests, and runbooks. It is **complete** and did not begin migration. Supabase Edge Functions retain all production ownership.

The locked roadmap is: **Phase 10 — Google Cloud Foundation (COMPLETE); Phase 11 — Portable HashiBot Core; Phase 12 — Google Cloud Runtime Services; Phase 13 — Demo Infrastructure + Shadow Certification; Phase 14 — Demo Cutover + Certification.** Current migration work targets the HashiBot demo only. Customer functionality is outside current scope. Logical service ownership boundaries do not require identical deployment boundaries.

## Implemented boundaries

The foundation uses the repository's TypeScript/Node tooling rather than adding a second application stack. A generic service runtime provides strict config loading, JSON logging, safe health endpoints, dependency initialization state, and graceful shutdown. Fourteen service entry points name ownership boundaries but intentionally register no workers. One reusable Dockerfile prevents drift.

Events use a v1 envelope with runtime validation, explicit known types, UUID correlation/causation, truth versions, and recursive rejection of secret-bearing fields. Commands add authorization, command identity, and idempotency identity. Unknown versions fail closed.

Pub/Sub is represented by interfaces and an in-memory adapter. Subscriber decisions are explicit `ack`, `nack`, or `dead-letter`; retry classification and ordering/correlation metadata are testable without Google credentials. A future Google adapter must preserve these semantics.

Idempotency defines claim, complete, fail, result retrieval, lease expiry, duplicate result, and truth-version behavior. Its in-memory adapter is local-only. Durable production implementations must invoke Supabase RPCs so no second truth store emerges.

The Supabase server boundary supports typed RPC/query calls, timeouts, bounded retry classification, and correlation-aware logging. It accepts server credentials only at runtime. Nothing instantiates it against production in this phase, and no schema is changed.

## Execution safety

Execution, protection, recovery, and provider entry points inherit false runtime gates. Provider mutation authorization rejects unless runtime/provider gates are enabled, production has its additional gate, the command is authorized, correlation/idempotency/scope are present, the ownership lease is valid, and Supabase truth was reconciled. Phase 10 supplies no provider mutation implementation.

## Infrastructure decision

Terraform/OpenTofu modules enumerate project services, identities/IAM, Artifact Registry, secrets, Pub/Sub/DLQ, Cloud Run, Scheduler, logging/monitoring, VPC/NAT, load balancer/Armor, and budgets. They are deliberately interface-only: `enabled` must be false and no provider/resource blocks exist. Environment roots use placeholders and have no active remote backend. Phase 13 may add reviewed demo resources and a pinned provider only after Phase 12 services exist and separate approval is granted.

## Contract evolution

Never change v1 meaning in place. Add a new version, validator, fixtures, producer compatibility period, and consumer support before publishing. Unknown versions remain rejected/DLQ'd. Payload additions must be optional and non-secret. Correlation ID is stable across a flow; child causation ID is the parent's event ID.

## Phase boundaries

- Phase 10 — Google Cloud Foundation (**COMPLETE**).
- Phase 11 — Portable HashiBot Core.
- Phase 12 — Google Cloud Runtime Services.
- Phase 13 — Demo Infrastructure + Shadow Certification.
- Phase 14 — Demo Cutover + Certification.

Production schedules, Edge Functions, database schema, provider/Telegram/customer behavior, and runtime routing remain unchanged.
