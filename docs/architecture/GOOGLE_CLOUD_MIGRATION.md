# HashiBot Phase 9 — Google Cloud Migration Preparation and Production Architecture

**Status:** design only  
**Decision:** no migration, deployment, schema change, or customer-visible change is authorized by this document.  
**System of record:** Supabase remains authoritative for authentication, database/customer data, signal truth, trade truth, reporting, dashboard data, Storage, and Realtime.

**Locked roadmap:** Phase 10 — Google Cloud Foundation (COMPLETE); Phase 11 — Portable HashiBot Core; Phase 12 — Google Cloud Runtime Services; Phase 13 — Demo Infrastructure + Shadow Certification; Phase 14 — Demo Cutover + Certification. Current work targets HashiBot demo only. Customer functionality is outside current scope. Service ownership boundaries do not require identical deployment boundaries.

## 1. Scope, invariants, and decision record

This architecture prepares long-running and high-frequency work for Google Cloud while keeping the current Supabase deployment fully operational. Google Cloud is a future **compute plane**, not a replacement data plane. Until a migration stage is explicitly approved, every Cloud component described below is hypothetical and the existing Edge Functions remain the production owners.

Non-negotiable invariants:

1. Supabase remains the only durable source of truth. Pub/Sub messages and Cloud Run memory are never truth stores.
2. A Cloud worker may propose or execute work only through the same ownership, risk, capital, lifecycle, provider, and idempotency contracts used today.
3. Existing Edge Functions remain deployable and are the rollback target at every stage. No dual writer may update the same truth transition.
4. Hybrid routing is disabled by default and enabled per service, environment, customer cohort, provider, and account using a reversible control.
5. The React/Vite application continues to authenticate with Supabase and consume Supabase APIs, Storage, and Realtime. It does not call private workers directly.
6. Google resources must be created in a separate non-production project first. This phase creates none.
7. Provider behavior, database schema, customer behavior, and production schedules do not change in Phase 9.

## 2. Current architecture inventory

### 2.1 Runtime topology

```text
Browser (React + Vite)
  | Supabase JWT / PostgREST / Realtime / Storage / Edge Function calls
  v
Supabase (Auth + PostgreSQL/RPC + Realtime + Storage)
  |-- scanner/scheduler/intelligence Edge Functions
  |-- risk, capital, strategy, orchestration libraries
  |-- Binance and Bybit execution/monitor Edge Functions
  |-- MT5 account API and bridge polling API <--> external MT5 agent
  |-- Telegram orchestration, delivery, and test Edge Functions --> Telegram API
  `-- admin/operator/scheduler Edge Functions --> Operations Center
```

| Area | Current runtime and responsibility | Durable authority |
|---|---|---|
| Frontend | React/Vite public, customer, and Operations Center UI; obtains Supabase sessions and reads/writes through authorized Supabase interfaces | Supabase Auth and PostgreSQL |
| Supabase | Auth, RLS/JWT enforcement, PostgreSQL/RPC, customer/configuration records, signal/trade truth, reporting read models, audit records, Realtime, and Storage | Supabase |
| Runtime | Edge Functions plus shared TypeScript modules implement orchestration, ownership, certification, strategy, risk, capital, execution planning, and trade lifecycle contracts | Supabase rows and transactional RPCs |
| Scanner | `scheduled-market-scanner` coordinates `market-scanner` and outcome evaluation; scanner records candidates, signals, paper intent, provider/scanner status, and run evidence | Supabase signal/scanner tables |
| Execution | Binance and Bybit test/demo functions submit and reconcile provider orders; execution planning and account brains enforce provider/account policy | Provider response plus Supabase trade truth |
| Telegram | Orchestration, direct send, tests, delivery deduplication, admin digest, free/VIP routing, and lifecycle notifications | Supabase delivery/audit records |
| MT5 | Account administration, bridge registration/heartbeat, credential retrieval, command polling/acknowledgement, market/account state sync, and the external `mt5-agent` | Supabase account, command, snapshot, and certification rows |
| Providers | Binance, Bybit, MT5 and external intelligence feeds are isolated behind provider adapters, health/status, account ownership, and symbol capability contracts | Supabase provider/account state; provider is execution evidence |
| Recovery/protection | Monitors and unified trade-management contracts detect drift, verify native protection, repair recoverable protection, quarantine unsafe cases, and record evidence | Supabase lifecycle/trade truth |
| Operations Center | Admin pages read operational evidence and invoke authenticated `admin-operator-action`, scheduler inspection, onboarding, tests, pause/resume, sync, and repair commands | Supabase roles, controls, operator events, audit logs |

### 2.2 Current trust boundaries

- Browser-to-Supabase calls use Supabase JWTs and RLS. Admin functions additionally verify the admin profile.
- Internal/scheduled functions use the repository internal/cron secret contract where gateway JWT validation is intentionally unsuitable.
- Service-role access exists only server-side. It must never be placed in the frontend or Pub/Sub payloads.
- Exchange, Telegram, intelligence-provider, and MT5 credentials remain server-side and are not logging fields.
- Shared modules are code, not independently deployed runtimes. Their future service ownership is mapped below.

## 3. Target hybrid architecture

```text
Internet
  |
Global external HTTPS Load Balancer + Cloud Armor (only public webhooks/API gateway)
  | serverless NEG
  v
Public Cloud Run ingress services ---- OIDC/JWT validation

Cloud Scheduler --OIDC--> Scheduler Publisher --publish--> Pub/Sub topics
                                                        |
                                             push subscription (OIDC)
                                                        v
       +---------------- private/authenticated Cloud Run services ----------------+
       | Scanner | Strategy | Risk | Capital | Execution | Protection | Recovery  |
       | Provider | Telegram | Reporting | Customer | Operations | Health | Cert. |
       +-------------------------------------------------------------------------+
                    | HTTPS + service identity / pooled connections
                    v
       Supabase Auth + PostgreSQL/RPC + Realtime + Storage (system of record)

Artifact Registry <- Cloud Build <- GitHub
Secret Manager -> service-specific secret mounts/API reads
All services -> Cloud Logging, Monitoring, Error Reporting, Trace
VPC connector/direct VPC egress -> NAT/static egress only where provider allowlists require it
```

### 3.1 Google Cloud component decisions

| Component | Intended use and constraint |
|---|---|
| Cloud Run | Stateless HTTP services and event workers. One image/service responsibility where scaling or privileges differ. Cloud Run Jobs are reserved for bounded backfills/certification, never the continuous execution loop. |
| Pub/Sub | At-least-once event transport and work queues. Messages carry identifiers and versions, not secrets or complete truth snapshots. |
| Cloud Scheduler | Publishes scheduled commands or calls a minimal authenticated publisher. It never performs scanning itself. |
| Secret Manager | Versioned secrets with per-service accessor roles, rotation, audit logs, and no image/build-argument secrets. |
| Cloud Logging | JSON logs on stdout/stderr with exclusion/sampling for high-volume debug logs; no credentials or sensitive customer payloads. |
| Cloud Monitoring | SLOs, dashboards, log-based/custom metrics, uptime checks, alert policies, and queue/backlog alerts. |
| Artifact Registry | Regional immutable container images, vulnerability scanning, retention, and digest-based deployment. |
| IAM | Dedicated service accounts, OIDC service-to-service auth, no default broad identities, no long-lived service-account keys. |
| VPC | Direct VPC egress or Serverless VPC Access only when needed; private ranges, firewall policy, Cloud NAT and reserved egress IP for provider allowlisting. Supabase remains an external TLS endpoint. |
| Load Balancer | Global external Application Load Balancer, managed TLS, serverless NEG and Cloud Armor only for intentionally public endpoints. Internal workers are not attached. |
| Cloud Build | Tested, provenance-bearing image build and environment promotion; deploy identities separated by environment. |
| Health checks | `/health/live` is process-only; `/health/ready` checks required configuration and dependency circuit state without mutating providers. Load-balancer health must not submit trades. |
| Autoscaling | Per-service concurrency, min/max instances, CPU/memory and request timeout. Maximums cap provider and database pressure. |

Use separate `hashibot-dev`, `hashibot-beta`, and `hashibot-prod` projects (or an equivalently strong folder/project boundary), regionalize compute and Artifact Registry near the Supabase project/provider endpoints, and label every resource with `app`, `service`, `environment`, `owner`, and `cost-center`.

## 4. Complete Edge Function runtime mapping

The inventory boundary is every directory containing `supabase/functions/<name>/index.ts`. `_shared` is mapped separately because it is a library, not an Edge Function.

| Existing Edge Function | Current role | Future owner | Invocation shape | Migration note |
|---|---|---|---|---|
| `admin-bootstrap` | Controlled first-admin/profile bootstrap and audit | Customer Service (admin identity endpoint) | Authenticated request/response | Keep in Supabase until auth/customer stage; never expose service role |
| `admin-operator-action` | Authorize, audit, route operator controls and repairs | Operations Service | Authenticated request; emits `OperatorActionRequested` | Preserve action ID, correlation ID, timeout and idempotency semantics |
| `admin-scheduler-action` | Scheduler status/test and stale testnet cleanup operations | Operations Service + Health Service | Authenticated request; scheduler query response | Split observation from mutating cleanup |
| `binance-testnet-execution` | Binance execution, supervision, provider checks, position sync and protection repair; also routes supported provider work | Execution Service + Protection Service + Binance Provider Worker | Command queue and provider request/response | Initially lift intact behind one consumer; decompose only after parity certification |
| `binance-testnet-monitor` | Reconcile Binance positions/orders, lifecycle, cleanup, alerts and protection | Protection Service + Recovery Service + Binance Provider Worker | Scheduled command -> ordered account queue | One active lease per execution scope; no parallel monitor owner |
| `bybit-demo-execution` | Bybit demo/test execution and provider-specific order handling | Execution Service + Bybit Provider Worker | Command queue and provider request/response | Route by account/environment; retain provider isolation |
| `bybit-testnet-monitor` | Bybit position/order reconciliation, heartbeat, protection and repair evidence | Protection Service + Recovery Service + Bybit Provider Worker | Scheduled command -> ordered account queue | Serialize by execution scope |
| `evaluate-signal-outcomes` | Price-based signal lifecycle evaluation, paper intent updates, results and Telegram notification | Reporting Service + Trade Management worker | Scheduled/event work | Supabase remains sole signal/trade transition authority |
| `execution-account-onboarding` | Admin customer listing, credential verification and transactional account creation | Customer Service + Provider Service | Authenticated synchronous API | Keep transactional RPC and safe diagnostic boundary |
| `intelligence-engine` | External intelligence/news processing | Strategy Service (Intelligence worker) | Scheduled/event work | Isolate external feed quotas and failures |
| `market-scanner` | Market data collection, indicators, strategies, qualification, signal/paper intent production and execution dispatch | Scanner Service orchestrating Strategy/Risk/Capital Services | `ScanRequested` work; emits candidate/signal events | First migration uses compatibility facade; later split CPU-heavy stages |
| `mt5-accounts` | User/admin MT5 connection, mode, execution enablement, sync and credential lifecycle | Customer Service + MT5 Provider Service | Authenticated synchronous API | Credentials resolve by reference; never put ciphertext in events |
| `mt5-bridge` | Bridge registry, assignment, credential retrieval, heartbeat, command polling/ack, account/symbol/market sync and certification | MT5 Provider Worker + Health + Certification Services | Authenticated bridge request/response | Public endpoint may use LB/Armor; preserve polling protocol during migration |
| `scheduled-market-scanner` | Schedule guard, run/heartbeat bookkeeping, scanner invocation and outcome evaluation | Cloud Scheduler -> Pub/Sub -> Scanner Service | Scheduled event | Scheduler publishes only; worker claims run idempotently |
| `telegram-orchestrator` | Select and route Telegram messaging workflows | Telegram Service | Event/command consumer | Delivery ledger in Supabase remains dedupe truth |
| `telegram-send` | Validate signal eligibility, send Telegram API request and record delivery/audit | Telegram Service delivery worker | Ordered/deduplicated delivery work | Rate-limit per bot/chat and retry only safe failures |
| `telegram-test` | Operator tests, admin alerts/digests and selected free signal | Telegram Service + Operations Service | Authenticated command | Test messages use separate event type/labels and production safeguards |

### 4.1 Shared library ownership mapping

| Shared capability | Future service owner |
|---|---|
| Strategy plans, professional/forex/gold strategies, indicators, arbitrator, intelligence | Strategy Service; Scanner Service supplies market inputs |
| Professional risk engine | Risk Service |
| Professional capital allocation | Capital Service |
| Execution planning/adoption/adapters, account brains and execution ownership | Execution Service |
| Protection verification and unified trade lifecycle | Protection Service; Recovery Service may request repair, never redefine state |
| Binance/Bybit authentication and provider account contracts | Corresponding Provider Worker |
| MT5 market data/provider and forex runtime contracts | MT5 Provider Worker and Scanner Service |
| Telegram templates, taxonomy, eligibility, router, registry, free publisher and incentives | Telegram Service |
| Certified runtime/account loader/proof routing | Certification Service and Health Service |
| Internal auth/operator invocation | Platform library shared by ingress services, with service-specific IAM policy |

## 5. Service decomposition and ownership

| Service | Owns | Does not own |
|---|---|---|
| Scanner Service | Market universe, fetch cycle, scan run lease, indicator inputs, candidate pipeline coordination | Strategy policy, risk approval, orders |
| Strategy Service | Deterministic strategy evaluation, intelligence enrichment, qualification rationale | Position sizing or provider calls |
| Risk Service | Risk limits, exposure checks, accept/reject evidence | Capital allocation, order submission |
| Capital Service | Account-aware allocation and position plan sizing within approved risk | Strategy choice, provider rounding/submission |
| Execution Service | Execution decision/orchestration, account brain, command state, lifecycle handoff | Provider credentials/protocol implementation or reporting truth |
| Provider Service | Provider capability/account routing and shared health registry | Cross-provider execution policy |
| Provider Workers | Binance, Bybit, and MT5 API translation, signing, rate limits and raw evidence | Strategy/risk decisions |
| Protection Service | Verify SL/TP, monitor positions, lifecycle transitions, drift detection | Inventing recovery policy or unapproved exposure |
| Recovery Service | Classify failure, select bounded repair, retry/quarantine/escalate and prove outcome | Silent infinite retry or bypassing risk |
| Telegram Service | Eligibility, templates, routing, send throttles, delivery ledger updates | Trade truth creation |
| Reporting Service | Outcome evaluation, projections/read models, report generation | Operational execution decisions |
| Customer Service | Customer/account administration and onboarding APIs | Auth authority (remains Supabase Auth) |
| Operations Service | Admin authorization, operator command/audit, pause/resume and status facade | Direct unaudited provider mutation |
| Health Service | Aggregated readiness, heartbeat freshness and dependency/provider status | Repair decisions |
| Certification Service | Contract/parity probes, runtime evidence and staged migration gates | Production execution ownership |

Services should begin as modules in a small number of deployable images if operational simplicity requires it, but privilege, scaling, and failure boundaries above remain explicit. Execution, provider, and public ingress identities must not be merged.

## 6. Event bus design

### 6.1 Envelope and topics

```json
{
  "event_id": "uuid",
  "event_type": "TradeOpened",
  "event_version": 1,
  "occurred_at": "RFC3339 UTC",
  "producer": "execution-service",
  "environment": "beta",
  "correlation_id": "uuid",
  "causation_id": "uuid-or-null",
  "customer_id": "opaque-id-or-null",
  "signal_id": "opaque-id-or-null",
  "trade_id": "opaque-id-or-null",
  "runtime_id": "opaque-id-or-null",
  "execution_scope_key": "opaque-routing-key-or-null",
  "truth_version": 42,
  "payload": { "minimal": "non-secret fields only" }
}
```

Suggested topics: `runtime.commands.v1`, `signals.events.v1`, `trades.events.v1`, `providers.events.v1`, `customers.events.v1`, `telemetry.events.v1`, and `operations.events.v1`. Each subscription has one bounded responsibility and its own dead-letter topic. Topic schema validation rejects incompatible envelopes. Environment is isolated by project/topic, not merely an attribute.

### 6.2 Event catalogue

| Event | Producer | Primary consumers | Required semantic |
|---|---|---|---|
| `SignalCreated` | Scanner/Strategy | Risk, Reporting | Signal truth committed before publish |
| `SignalQualified` | Strategy | Risk, Telegram | Qualification and strategy version reference |
| `TradeOpened` | Execution | Protection, Reporting, Telegram | Provider fill evidence and committed trade ID |
| `TradeProtected` | Protection | Reporting, Telegram, Health | Verified provider protection evidence |
| `TP1Hit`, `TP2Hit` | Protection | Reporting, Telegram | Monotonic lifecycle transition/version |
| `TradeClosed` | Protection/Execution | Reporting, Telegram, Capital | Close evidence and reason |
| `RecoveryTriggered` | Recovery | Operations, Health, Telegram alerts | Classification, bounded attempt and severity |
| `ScannerCompleted` | Scanner | Health, Reporting, Operations | Run counts, duration and result status |
| `Heartbeat` | Every runtime | Health | Runtime/service/scope, status and observed time |
| `ProviderDisconnected` | Provider Worker | Recovery, Health, Operations | Provider/account scope and safe error class |
| `ProviderRecovered` | Provider Worker | Recovery, Health, Operations | Successful probes and recovery time |
| `CustomerStarted`, `CustomerStopped` | Customer/Operations | Execution, Scanner, Reporting | Committed desired-state version |

Additional commands/events required for clean orchestration include `ScanRequested`, `ExecutionRequested`, `ProtectionCheckRequested`, `OutcomeEvaluationRequested`, `TelegramDeliveryRequested`, `OperatorActionRequested`, `OperatorActionCompleted`, and `CertificationCompleted`. Commands express intent; events describe facts already committed.

### 6.3 Transactional publication rule

Because Supabase remains truth, the safe target is a transactional outbox recorded in the same Supabase transaction as a truth change and published by a relay. **This requires a future schema/RPC change and is not implemented in Phase 9.** Before that change is approved, hybrid workers use an idempotent write-then-publish pattern plus a reconciliation poller that republishes missing events from truth versions. Consumers always reread authoritative state and reject stale versions.

## 7. Runtime communication contract

| Concern | Standard |
|---|---|
| Request/response | HTTPS JSON for low-latency queries, operator APIs, bridge compatibility, and provider adapter calls. Private Cloud Run requires Google-signed OIDC with audience equal to service URL. User APIs validate Supabase JWT, issuer/audience, expiry, and authorization. |
| Events/commands | Pub/Sub for asynchronous fan-out and work. Acknowledge only after durable outcome or durable idempotency record. Never hold a DB transaction while calling a provider. |
| Timeouts | Supabase query 5–10s; internal request 10s; provider read 10s; provider mutation 15s; Telegram 10s; ordinary event handler 30–60s; scanner shard up to 300s. Set Cloud Run timeout slightly above application timeout. |
| Retry | Queries: up to 3 attempts. Mutations: retry only with provider/idempotency key and after truth reconciliation. Permanent auth/validation/risk failures are acknowledged and recorded, not retried. |
| Backoff | Full-jitter exponential: 1s, 2s, 4s, 8s, 16s, capped at 60s; respect provider `Retry-After`. Recovery may use longer policy-specific delays. |
| Dead-letter queues | Per subscription, normally after 5 delivery attempts (3 for unsafe provider mutations). DLQ alert contains IDs/error class, never secrets. Replay requires operator approval and original event ID. Retain long enough for investigation, initially 14 days subject to compliance review. |
| Idempotency | `event_id` for facts; `command_id`/`Idempotency-Key` for commands; provider client-order ID for orders; durable unique execution scope + signal + provider/environment for execution. Duplicate delivery returns the recorded result. |
| Ordering | Enable ordering key for `execution_scope_key` (account/provider) for execution/protection, `trade_id` for lifecycle, and `chat_id` for Telegram. Ordering is not correctness: Supabase truth version and state machine remain guards. |
| Concurrency | Lease/claim by execution scope, optimistic truth version checks, and single transition owner. Max instances/concurrency provide load control but are not locks. |
| Failure response | Stable error code, retryability, correlation ID, and safe message. Provider raw payload is stored only where approved and redacted from logs. |

## 8. Secrets and configuration

Create secrets per environment and least-privileged consumer, for example `supabase-service-role-execution`, `binance-api-key-<account-ref>`, and `telegram-bot-token-delivery`; do not use a single universal runtime secret.

| Secret class | Access pattern / rotation |
|---|---|
| Binance/Bybit exchange keys | Provider-worker identity only; separate test/live and account scope; rotate with overlapping version, read-only probe, then revoke old key |
| Telegram token/webhook secret | Telegram Service only; distinct bots/environments; verify webhook secret before parsing body |
| MT5 credentials | MT5 Provider Worker only; resolve opaque credential reference just in time; never send through Pub/Sub |
| Supabase service role / database integration credential | Separate per service if supported; otherwise service-role secret only for narrowly scoped server identities while migrating toward RPC-scoped credentials |
| Supabase JWT verification config | Public issuer/JWKS is configuration; any legacy shared JWT secret is restricted to ingress/auth component and rotated under Supabase procedure |
| Google API/provider credentials | Workload identity/ADC instead of keys for Google APIs; external feed keys only to owning service |
| Internal/cron compatibility secrets | Retained only while Edge compatibility exists; Cloud Scheduler and Cloud Run use OIDC instead |

Secret versions are referenced as `latest` only during controlled rotation or pinned by deployment policy, never copied to environment files committed to Git. Enable Secret Manager Data Access audit logs, rotation alerts, and access anomaly review. Build service accounts cannot read runtime secrets. Configuration that is not secret is versioned, validated at startup, and labeled by environment.

## 9. Structured logging and traceability

Every log is one JSON object with: `timestamp`, `severity`, `service`, `revision`, `environment`, `message`, `event_type`, `outcome`, `error_code`, `retryable`, `latency_ms`, `correlation_id`, `causation_id`, `signal_id`, `trade_id`, `customer_id`, `runtime_id`, `execution_scope_key`, `provider`, `provider_request_id`, and Cloud Trace fields when available.

Rules:

- Generate a correlation ID at ingress/schedule publication and propagate it in HTTP headers and event envelopes. Never overwrite an incoming valid ID.
- Log lifecycle transitions and operator/provider mutations at `NOTICE`; expected business rejection at `INFO`; retryable dependency failure at `WARNING`; exhausted/unsafe failure at `ERROR`; invariant violation at `CRITICAL`.
- Redact authorization headers, cookies, tokens, signatures, account numbers, credentials, chat content, raw customer objects, and provider request bodies. Hash/pseudonymize identifiers in broad-access views where feasible.
- Use log-based metrics only for low-cardinality dimensions; IDs belong in logs/traces, not metric labels.
- Default retention: 30 days operational, with security/audit sinks retained according to policy. Exclude successful health probes and sample high-volume debug/market logs. Route security audit logs to a protected centralized project/bucket.

## 10. Monitoring, SLOs, and alerting

### 10.1 Endpoints and heartbeat

- `GET /health/live`: process/event-loop health only; no dependencies.
- `GET /health/ready`: configuration loaded, subscriptions/required clients initialized, and circuit state safe. A degraded optional provider is reported but does not necessarily remove unrelated service readiness.
- `GET /health/version`: image digest, revision, contract versions, build ID; no secret configuration.
- Runtime workers upsert/publish heartbeat with runtime ID, execution scope, last successful cycle, lag, revision and status. Health Service alerts on freshness; it does not infer health merely from an HTTP 200.

### 10.2 Metrics and initial alert thresholds

| Signal | Metric/SLO | Initial alert |
|---|---|---|
| Availability | Request success for ingress/operations | <99.9% over rolling 30d; fast burn paging |
| Heartbeat | Seconds since successful scoped heartbeat | warning at 2 expected intervals, critical at 3 |
| CPU/memory | Cloud Run utilization and container restart/OOM | >80% 10m; any repeated OOM |
| Queue depth | Oldest unacked age and undelivered messages | execution >30s; protection >60s; scanner >2 schedules |
| Execution latency | request committed -> provider accepted/fill evidence, p50/p95/p99 | p95 >5s (tune per provider) |
| Failure rate | retryable/permanent failures by safe class | >2% 5m or any invariant/unsafe failure |
| Recovery | triggered, succeeded, failed, attempt count/time-to-recover | any exhausted critical recovery; p95 >5m |
| Provider health | connectivity, auth, rate-limit, clock skew, last success | disconnected for 2 probes; auth failure immediately |
| Protection | open-but-unverified positions and verification latency | any unprotected filled position immediately |
| Scanner | run duration, symbols/candidates/errors, completion freshness | missed run or >20% symbol failure |
| Supabase | query latency/error/pool saturation/circuit state | p95 >1s or errors >2% 5m; tune against baseline |

Dashboards: executive SLO, execution/protection safety, scanner throughput, provider/MT5, queues/DLQs, Supabase dependency, service resources, deployment comparison, recovery, Telegram, and cost. Alerts route critical safety issues to paging plus Telegram fallback if available; Telegram itself cannot be the only alert channel.

## 11. Autoscaling baseline

These are starting recommendations to load-test, not deployment instructions. `min=0` is acceptable for noncritical dev workloads. Production safety-path minimums avoid cold starts. Maximums are deliberately low until Supabase/provider quotas are measured.

| Service | Prod min / max | Concurrency | CPU / memory | Request timeout | Notes |
|---|---:|---:|---:|---:|---|
| Scanner | 1 / 20 | 1–4 | 2 vCPU / 2–4 GiB | 300s | shard by market/symbol; CPU always allocated while processing |
| Strategy | 0 / 30 | 8 | 2 vCPU / 2 GiB | 60s | CPU-heavy; keep deterministic/cache immutable inputs |
| Risk | 1 / 10 | 20 | 1 vCPU / 512 MiB | 15s | low latency; bounded DB connections |
| Capital | 1 / 10 | 20 | 1 vCPU / 512 MiB | 15s | low latency; no local balance truth |
| Execution | 2 / 20 | 4–8 | 1–2 vCPU / 1 GiB | 30s | min 2 across revisions; scope lease; conservative max |
| Provider worker (each) | 1 / 10 | 4–8 | 1 vCPU / 512 MiB–1 GiB | 30s | provider rate-limit token bucket; static egress if required |
| Protection | 2 / 20 | 4 | 1 vCPU / 1 GiB | 60s | prioritize filled/unprotected work |
| Recovery | 1 / 10 | 1–4 | 1 vCPU / 1 GiB | 60s | low concurrency prevents repair races |
| Telegram | 1 / 10 | 8 | 1 vCPU / 512 MiB | 30s | bot/chat throttles; ordering key |
| Reporting | 0 / 10 | 10 | 1 vCPU / 1 GiB | 120s | async; tolerate cold starts |
| Customer/Operations | 1 / 10 | 20 | 1 vCPU / 512 MiB | 30s | LB/API protection if public |
| Health | 1 / 3 | 40 | 1 vCPU / 512 MiB | 10s | cached aggregation; never heavy scans per request |
| Certification | 0 / 5 | 1 | 1–2 vCPU / 1 GiB | 300s | preferably Cloud Run Job for bounded suites |

Start Cloud Run CPU target around 60–70% for CPU-bound services and tune with latency/queue signals. Pub/Sub push scales on concurrent requests/backlog; cap instances so `instances × concurrency × connections-per-request` stays within Supabase/provider limits. Use connection pooling, lazy initialization, small images, dependency reuse, startup CPU boost where justified, and min instances for execution/protection cold-start control. Do not rely on minimum instances as leader election.

## 12. Deployment, verification, promotion, rollback

```text
GitHub pull request
  -> CI lint, typecheck, unit/contract/security tests
  -> merge protected branch
  -> Cloud Build (pinned builder images, SBOM, provenance, vulnerability scan)
  -> Artifact Registry (immutable digest)
  -> deploy no-traffic Cloud Run revision in dev
  -> smoke + contract + Supabase/provider sandbox certification
  -> beta canary (1%, then 10%, then 50%)
  -> explicit production approval and cohort/traffic canary
  -> verify SLO, truth parity, queue/DLQ, provider and cost
  -> promote digest, or route traffic/commands to previous revision
```

Cloud Build uses a build identity that can write Artifact Registry but cannot deploy production or read runtime secrets. Environment deploy identities can deploy only their project; production promotion requires approval and a verified image digest. Database migrations are a separate, explicitly approved pipeline and are absent from this phase.

Rollback has two layers:

1. **Revision rollback:** stop publishing to the failing revision/subscription, shift HTTP traffic to the previous known-good digest, drain or park messages, and reconcile truth before replay.
2. **Platform rollback:** set the hybrid routing/cohort control to Supabase owner, disable Google schedules/subscriptions, wait for leases to expire, verify no in-flight provider mutation, resume the corresponding Edge schedule/function, and reconcile provider state against Supabase.

Never allow Edge and Cloud owners to consume the same execution scope concurrently. Rollback objective: operator/customer APIs within 5 minutes, scanners within one schedule interval, and execution/protection immediately after safe lease handoff. A rollback drill is a production gate.

## 13. Failure and failover matrix

| Condition | Required behavior | Recovery/failback |
|---|---|---|
| Supabase available, Google unavailable | Current Edge Functions remain production path until migrated. For a migrated scope, stop new commands; do not execute from cached state. Provider-native SL/TP remains primary protection. | Restore Cloud or explicitly hand lease/ownership to Edge; reconcile Supabase and provider before resume. |
| Google available, Supabase degraded | Circuit-break writes and all new execution. Read-only health may continue; queue bounded commands without acknowledging only within retention/backpressure policy. Never invent signal/trade truth. | Probe Supabase, reconcile provider state, process by truth version; operator approval after prolonged outage. |
| Provider unavailable | Isolate provider/account, reject new exposure, preserve provider-native protection, back off and emit disconnect; other providers continue only under their independent policy. | Authenticated read-only probes, `ProviderRecovered`, reconcile positions/orders, then controlled reopen. |
| Telegram unavailable | Record pending/failed delivery, retry safe 429/5xx with bot limits; trading truth/execution must not block. Alert through Cloud Monitoring/on-call. | Deduplicated replay from delivery ledger. |
| MT5 unavailable | Stop MT5 commands, mark heartbeat stale, retain commands, do not assume fills or close; alert on affected scopes. | Bridge re-registers/heartbeats, syncs account/positions, reconciles command acknowledgements, then resumes. |
| Binance unavailable | Quarantine Binance scope, stop entries, keep native protection, reconcile open orders/positions after recovery. Bybit/MT5 policy remains isolated. | Clock/auth/connectivity checks, full sync, protection verification, explicit healthy evidence. |
| Bybit unavailable | Same isolation behavior for Bybit; no automatic provider substitution or mirrored duplicate. | Full Bybit position/order sync and protection verification before resuming. |
| Recovery action fails | Bound attempts, mark recovery-required/unsafe truth, DLQ the command, page operator; never loop or widen risk. | Manual evidence-based action followed by certification and lifecycle reconciliation. |
| Pub/Sub duplicate/out-of-order | Idempotency lookup and truth-version/state-machine check; acknowledge already-completed/stale work. | No compensating provider mutation unless reconciliation proves it necessary. |
| Region-level disruption | Existing Edge fallback is preferred during hybrid stages. Future multi-region requires explicit single-writer lease design; it is not implied here. | Controlled ownership handoff and provider/Supabase reconciliation. |

## 14. Security architecture

- **Least privilege:** one service account per deployable service/environment. Grant `run.invoker`, `pubsub.publisher/subscriber`, `secretmanager.secretAccessor`, logging/metric roles only on exact resources. Human admin and runtime identities are separate.
- **Identity:** Google workload identity and OIDC for service-to-service calls; Supabase JWT for users. Validate issuer, audience, expiry, role/RLS-derived authorization, and replay/idempotency. Never mint Google service-account keys for GitHub; use Workload Identity Federation.
- **Network:** private Cloud Run ingress for workers; LB-only ingress for public services; Cloud Armor WAF/rate limiting; TLS everywhere; VPC/NAT/static egress only as required. Use organization policies to block public services and service-account key creation by default.
- **API protection:** narrow CORS, payload/content-type/size validation, per-user/IP/action rate limits, webhook signatures, replay window, idempotency keys, and admin reauthorization for dangerous operations.
- **Secrets:** service-specific Secret Manager access, rotation and audit as in Section 8. Secret scanning in CI and immediate revocation procedure.
- **Supply chain:** branch protection, reviewed changes, pinned dependencies/builders, SBOM/provenance, vulnerability gates, signed/attested immutable images, and production digest allow policy.
- **Audit:** Admin Activity and Data Access logs, Cloud Build/deploy/IAM/Secret Manager access, operator events and Supabase audit logs exported to restricted retention. Alert on IAM changes, secret reads outside baseline, public ingress, disabled audit sinks, and production rollbacks.
- **Data:** minimize Pub/Sub/log payloads, classify customer/provider data, encrypt at rest/in transit, define regional/residency policy and deletion/retention before production. Supabase backups/PITR remain part of the system-of-record plan.

## 15. Cost planning (illustrative, not a quote)

Costs depend on region, request duration, CPU allocation, minimum instances, Pub/Sub volume, egress, build minutes, log ingestion/retention, load balancer/NAT, and Secret Manager operations. Before each stage, enter measured workload into the [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator) and validate unit prices on the official [Cloud Run](https://cloud.google.com/run/pricing), [Pub/Sub](https://cloud.google.com/pubsub/pricing), [Cloud Logging](https://cloud.google.com/logging/pricing), and [Cloud Build](https://cloud.google.com/build/pricing) pages. Supabase and provider fees are additional.

| Profile | Planning assumptions | Indicative Google monthly range (USD) | Main drivers |
|---|---|---:|---|
| Development | Scale-to-zero services, small scheduled scans, short log retention, no always-on safety workers | **$25–$150** | LB/NAT fixed costs can dominate; build/log use |
| Beta | 1 warm scanner/execution/protection/provider set, moderate queues and telemetry, sandbox providers | **$250–$900** | min instances, scanner CPU, logs, NAT/LB |
| Production baseline | Redundant warm execution/protection, continuous monitors, several provider workers, 30-day operational logs | **$1,000–$3,500** | always-on vCPU/RAM, provider count, observability |
| Scaling / high frequency | Many scanner shards/accounts, high message volume and detailed telemetry | **$3,500–$15,000+** | scanner compute, egress, Pub/Sub throughput, logging |

Component envelopes for initial budgeting: always-on runtime **$150–$1,500+**, high-frequency scanner **$200–$5,000+**, execution/provider workers **$100–$2,000+**, Artifact Registry/build/storage **$10–$250+**, and logging/monitoring **$50–$2,000+** monthly. These overlap with profile totals and must not be added blindly. Supabase remains storage truth; Google storage is primarily images, logs, DLQs, build artifacts and approved exports.

Cost controls: budgets at 50/75/90/100%, anomaly alerts, per-environment quotas, max instances, log exclusions/sampling, lifecycle policies, image cleanup, no dev min instances, per-service labels, weekly beta review, and cost-per-scan/trade/account dashboards. Never autosuspend execution/protection solely to meet a budget; fail safe and alert.

## 16. Staged migration with rollback

Every stage requires contract tests, shadow parity, security review, load/quota evidence, failure injection, rollback drill, no unresolved critical alerts, and an operator go/no-go. Promotion is by allowlisted non-production scope before customer scope.

### Stage 1 — Current Supabase only (this phase)

- Produce architecture, inventory, event/service contracts, baseline metrics, cost model and runbooks.
- Add no resources, routes, schedules, schemas, secrets, or runtime changes.
- **Exit:** inventory signed off; Edge baseline tests/latency/failure rates captured; ownership matrix accepted.
- **Rollback:** documentation-only revert; production is unchanged.

### Stage 2 — Hybrid foundation

- In dev/beta only, create projects/IAM/registry/build/logging/monitoring, deploy Health/Certification and non-mutating shadow consumers.
- Shadow events are derived from reads and cannot write truth or call providers. Compare decisions/results to Edge evidence.
- **Exit:** 14 days parity, zero unauthorized writes, tested DLQ/idempotency/observability and spend within budget.
- **Rollback:** disable shadow publisher/subscriptions and Cloud schedules, delete/restrict services; Edge remains sole owner.

### Stage 3 — Execution workers

- Move one sandbox provider/account cohort behind an explicit routing flag and execution-scope lease. Cloud Execution/Provider worker becomes sole owner only for that cohort.
- Keep Supabase truth writes/contracts and Edge code ready but inactive for the cohort. Reconcile every provider mutation.
- **Exit:** order/protection/lifecycle parity, quota/load/chaos tests, zero duplicate orders, rollback drill.
- **Rollback:** stop command publication, drain/park queue, reconcile provider/Supabase, release Cloud lease, set cohort owner to Edge, resume Edge owner.

### Stage 4 — Scanner workers

- Cloud Scheduler publishes `ScanRequested`; Scanner Service runs selected market/timeframe cohorts. Edge schedule is disabled only for the claimed cohort.
- Strategies/risk/capital remain contract-compatible and Supabase remains signal truth.
- **Exit:** candidate/signal equivalence within documented deterministic tolerances, no duplicate signals, schedule/failure evidence.
- **Rollback:** disable Cloud schedule/subscription, wait for run lease, reconcile incomplete runs, enable Edge scheduled scanner.

### Stage 5 — Recovery and protection

- Move monitors/protection/recovery for previously migrated execution scopes only. Prioritize filled/unprotected messages and enforce one monitor lease.
- Run fault injection for missing SL/TP, provider timeout, duplicates, stale state and Supabase outage.
- **Exit:** recovery success/time SLOs, no overlapping supervisors, unsafe states page immediately, failback certification.
- **Rollback:** stop new repair commands, finish or quarantine in-flight repair, provider/Supabase full reconciliation, transfer scope lease to Edge monitors.

### Stage 6 — Full production runtime

- Gradually move remaining long-running scanner, strategy, execution, recovery, provider, messaging/reporting orchestration and schedules by cohort.
- Supabase continues Auth, data/customer/signal/trade truth, reporting/dashboard, Realtime and Storage. Retain Edge compatibility for a defined stabilization window.
- **Exit:** 30-day SLO/cost/security review, disaster and rollback drills, support/on-call approval. Removal of compatibility is a separate future decision, not authorized here.
- **Rollback:** service-by-service ownership flags and leases revert to tested Edge owners in dependency order: stop entries, preserve/reconcile protection, restore monitors, execution, scanner and ancillary services.

## 17. Production readiness checklist

- [ ] Every deployed function/runtime has a named owner, service account, data access list, SLO and rollback owner.
- [ ] Supabase remains authoritative; no cache/event/local state can create truth without an authorized write/version check.
- [ ] Exactly one writer/monitor owns each execution scope and lifecycle transition.
- [ ] Provider mutation idempotency and post-timeout reconciliation are certification-tested.
- [ ] Topics, schemas, ordering keys, retention, retry and DLQ replay runbooks are reviewed.
- [ ] Secret rotation and emergency revocation drills pass; no build/frontend secret exposure.
- [ ] Queue, heartbeat, protection, provider, Supabase, cost and deployment dashboards/alerts pass tests.
- [ ] Load tests prove Cloud Run maximums cannot exhaust Supabase/provider quotas.
- [ ] Cloud/Supabase/provider/Telegram/MT5 outage and rollback game days pass.
- [ ] Security threat model, IAM review, audit retention, data classification and incident response are approved.
- [ ] Cohort routing defaults to Supabase and is independently observable/audited.
- [ ] No production resource or routing change occurs under Phase 9 approval.

## 18. Explicit non-actions in Phase 9

This document does **not** deploy Google Cloud resources, change any Edge Function, change the database schema, change provider/customer behavior, move secrets, modify production schedules, enable dual execution, remove Supabase, or authorize migration. Its only repository effect is the architecture record itself.
