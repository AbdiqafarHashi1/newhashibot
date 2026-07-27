# Professional Execution Operations UI / Backend Contract

## Real-truth rule

The future page projects immutable ExecutionPlans and later provider execution facts. It must not invent latency, queue state, provider health, idempotency state, orders or fills. Phase 1E does not modify an existing page because no durable execution-plan read model exists.

## Component boundaries

1. **ExecutionPlanSummary** — PLANNED/REJECTED/queued/routed counts, stale routes, provider health, duplicate/idempotency conflicts and warnings.
2. **ProviderExecutionGrid** — isolated Binance, Bybit, MT5 Personal and MT5 Prop cards with environment/account, capabilities/spec fingerprints, truth age, execution mode and current plan counts.
3. **ExecutionPlanStream** — plan/correlation/allocation IDs, strategy/symbol, provider/account, status/decisive gate, order count, routing/execution fingerprints and timestamp.
4. **OrderSequenceDetail** — configuration actions, phase/sequence, exact native order semantics, quantity/price/trigger, reduce/post-only, TIF, client ID and idempotency key. Secrets and credentials never render.
5. **RoutingDiagnostics** — all gates, mapping, rejected instructions, assumptions, warnings, freshness and fingerprint comparison.
6. **IdempotencyStatus** — planned key, any adopted queue/submission claim, provider order identity and duplicate/no-op outcome after Phase 1F.
7. **ProviderLatency** — only provider timestamps and measured submission/ack latency from adopted execution facts; never browser estimates.

## Required backend seams

- Immutable ExecutionPlan store keyed by plan/correlation/allocation IDs.
- Provider/account capability and symbol-map snapshot with fingerprint/timestamp.
- Idempotency claim/attempt/outcome ledger.
- Provider submission/ack/fill facts linked to planned order role and client ID.
- Freshness/health projection and stale-plan invalidation event.
- Access-controlled provider/account visibility and redacted native payloads.

Phase 1F must propose persistence separately. The UI cannot label a plan “queued” or “routed” until a real backend adoption event exists.

