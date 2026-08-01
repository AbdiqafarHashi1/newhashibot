# HashiBot Portable Core — Phase 11

## 1. Scope and roadmap

Phase 11 creates a platform-independent core for the **HashiBot demo**. Customer functionality is outside current scope. It does not change current handlers or runtime ownership, and Google Cloud owns zero responsibilities.

Locked roadmap:

1. **Phase 10 — Google Cloud Foundation (COMPLETE)**
2. **Phase 11 — Portable HashiBot Core**
3. **Phase 12 — Google Cloud Runtime Services**
4. **Phase 13 — Demo Infrastructure + Shadow Certification**
5. **Phase 14 — Demo Cutover + Certification**

Service boundaries express ownership and test seams; they do not require identical deployment boundaries.

## 2. Extraction model

`packages/hashibot-core` is a runtime-neutral domain package. It receives data, clocks/timestamps, identity, policies, truth versions, and I/O ports explicitly. It never receives or imports an HTTP request, scheduler, Pub/Sub message, Cloud Run object, or Supabase client.

Production safety prohibits changing Edge Functions during this phase. Therefore pure professional engines already canonical in `supabase/functions/_shared` are **not copied**: the portable facade directly exports those exact functions. Reference-identity and output parity tests prove there is one implementation. New modules define domain contracts and pure validation around handler-bound orchestration; they do not duplicate database/provider/Telegram behavior.

## 3. Layers and extractions

| Layer | Portable boundary | Canonical behavior preserved |
|---|---|---|
| Market | normalized immutable candle, candle series, market context, indicator port | existing indicator engine is directly exposed |
| Scanner | request, symbol filter, timeframe/market loader, stage, candidate/rejection evidence, sink port | current scanner orchestration stays in its handler |
| Strategy | identity/version/lifecycle/evidence/certification hook contracts | professional crypto/forex/gold strategies directly exposed |
| Arbitrator | candidate/options/result and canonical `arbitrate` | exact current scoring, rejection, winner/no-trade implementation |
| Signal truth | immutable v1 creation proposal and truth persistence port | current Edge handler remains sole writer |
| Risk | professional risk types/functions | exact current sizing/limits/drawdown/leverage/exposure/stop policy engine |
| Capital | professional allocation types/functions | exact current allocation and portfolio constraint engine |
| Execution | professional planning types/functions and plan repository port | planning only; no provider transport |
| Providers | Binance, Bybit and MT5 read/mutation port contracts and capability/evidence values | no adapter and no new provider behavior |
| Lifecycle | versioned state, transition validation, repository/reconciliation contracts | current trade engines remain owners |
| Protection | canonical verification plus intents for SL/TP, breakeven, trailing and partial exits | verifier is exact; no mutation implementation |
| Recovery | orphan/restart/drift/ambiguous-result intent, bounded policy and reconciliation port | no supervisor or mutation implementation |
| Telegram | canonical content contract plus route/event/delivery intent ports | templates/routing behavior remains current |
| Reporting | request/result/read boundary | no new reports or truth writes |
| Intelligence | reservation-only interfaces | no implementation, registry, model, prompt, persistence or wiring |

## 4. Portability rules

- Domain modules contain no `Deno`, Node-only runtime, HTTP, Cloud Run, Pub/Sub, scheduler, environment-variable, database-client, or provider-client API.
- I/O is an explicit interface. Persistence ports use optimistic truth versions; provider mutation ports require correlation, scope, and idempotency values.
- Callers supply timestamps. Domain logic does not silently depend on platform clocks.
- Pure outputs are immutable or treated as readonly. Failures use stable error codes/evidence rather than platform responses.
- Supabase remains durable truth. A port is not permission to create a second truth store.

## 5. Parity and certification

Portable facades are compared to canonical functions by reference identity and deterministic fixture output. Existing suites continue to certify full strategy, risk, capital, execution planning, provider, trade-management, Telegram, recovery, and scanner behavior. Phase 11 adds portable boundary tests for candle normalization, immutable signals, stale lifecycle rejection, bounded recovery, provider/Telegram contracts, and absence of intelligence implementations.

The Capability Ledger is the authoritative extraction audit. A handler-bound capability is not falsely labeled extracted; it remains listed as a Phase 12 adapter responsibility.

## 6. Production preservation

No Edge Function import, body, schedule, schema, provider adapter, Telegram sender, customer path, execution path, or ownership configuration changes in Phase 11. The existing production deploy list and behavior are untouched. Nothing in `packages/hashibot-core` is wired into an active runtime.

## 7. Remaining Phase 12 work

Phase 12 — Google Cloud Runtime Services may compose the portable core behind disabled runtime service adapters, implement platform adapters for configuration/health and local test transports, and expand shadow certification harnesses. It must still not provision demo infrastructure or assume ownership. Infrastructure/shadow deployment belongs only to Phase 13, and any demo cutover belongs only to Phase 14 after certification.
