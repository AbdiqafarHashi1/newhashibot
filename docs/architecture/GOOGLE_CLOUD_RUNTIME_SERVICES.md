# Phase 12 — Working Google Cloud Runtime Services

Phase 12 implements a locally runnable **demo-only** composition. Nothing is deployed; Supabase remains production owner. Five practical units (`decision-runtime`, `execution-runtime`, `trade-runtime`, `communications-runtime`, `operations-runtime`) share `cloud/runtime` rather than maintaining fourteen copies.

The explicit composition registers a clock, logger, append-first store, provider factory and orchestrator. The orchestrator uses the canonical indicator engine, arbitrator and portable immutable signal contract, selects the exact demo account-brain identity, sequences the sole risk and sizing stages, emits a mutation-disabled execution command, consumes only an explicitly supplied deterministic provider adapter, initializes trade lifecycle once, verifies protection, emits TP1/break-even/TP2 close truth, and records idempotent demo/admin Telegram receipts.

`repositories.ts` defines all required repository interfaces; `supabase-repositories.ts` is the server-only bounded wrapper over the existing Supabase boundary. The local adapter is deterministic test state, never production truth. Actual table/RPC binding and handler-owned strategy/account context assembly remain shadow-certification work.

Provider safety: production gates remain false. `DeterministicProviderAdapter` is explicitly constructed by local composition; Binance, Bybit and MT5 adapters never use credentials/network. UNKNOWN results append `RecoveryRequired` with `blindRetry=false`. No live executor exists in Phase 12.

Readiness is honest: consolidated services expose Phase 10 health and are disabled unless locally started. No worker is registered to a schedule or Pub/Sub subscription.
