# Phase F — Binance + Bybit test/demo execution and unified protection

## Audit and reused authorities

Phase F keeps the Phase C–E architecture closed. Phase D `account-policy-authority` is the sole account/customer policy and sizing authority. The existing professional execution planner, certified adoption worker, atomic claims, Binance testnet and Bybit V5 demo adapters, deterministic client-order identities, provider symbol cache, provider credential resolver, execution-order bindings, monitor/supervisor, professional protection verifier, trade-management truth, and recovery controls remain authoritative. No executor, risk/protection/trade-management engine, account brain, truth store family, or dashboard was duplicated.

The previous certified crypto handoff validated its adoption plan but did not re-bind the Phase-D decision immediately before the provider call. Phase F makes the minimum integration correction: `crypto-phase-f-execution` validates that decision/intent and exact owned route, applies only exchange step/tick normalization, and creates a safe account-scoped projection. `record_phase_f_crypto_submission` repeats tenant, sandbox, health, decision, risk, and quantity invariants atomically. Existing legacy signal execution remains operationally separate; certified account intents use only `adopt_execution_plan`.

## Exact call paths and isolation

Both paths are: canonical signal → Phase-D per-account ALLOW/REDUCE intent → professional planner → certified adoption policy/revalidation → atomic account/order claims → Phase-F last-mile route and precision guard → existing adapter → Binance testnet REST or Bybit V5 demo REST → deterministic order binding/fill truth → unified supervisor/protection verifier/trade manager → recovery/reconciliation → account-scoped truth.

Binance requires `TESTNET`; Bybit requires `DEMO`. `LIVE` is rejected in pure code, certified adoption, adapter selection, environment configuration, and the database constraint/RPC. Customer, execution-account, immutable identity, provider, environment, intent and deterministic client ID must agree. Unique account+intent, account+plan and account+client-order constraints preserve independent fan-out while preventing duplicates and cross-routing.

Binance and Bybit use their own status vocabulary, payload identity field and symbol filters. The shared boundary floors quantity to the provider step (never increases Phase-D size), rounds price to tick, checks minimum quantity/notional, and records requested/submitted values plus a deterministic reason. It never recalculates risk. Provider adapters remain mechanics-only.

## Failure, protection, and recovery semantics

A timeout/ambiguous response enters `RECONCILIATION_STARTED`; the existing adoption worker looks up the deterministic client identity and explicitly performs no retry when unresolved. Rejections and partial fills remain explicit. A confirmed entry progresses through `ENTRY_FILLED` → `PROTECTION_PENDING` → `PROTECTION_VERIFIED`; it is not successful merely because it filled. Missing/failed protection becomes `PROTECTION_INCIDENT`, followed by existing repair or safety-close handling. The unified lifecycle records TP1, breakeven, profit lock, TP2, trailing/runner and terminal exit with identical Binance/Bybit semantics. Durable claims, events, provider bindings and supervisor truth support restart reconciliation.

Credential resolution stays inside the edge credential context. The Phase-F envelope, events and projections contain no credentials or references. Trading permission must be verified where provider account capability truth exposes it, and an observed withdrawal capability is rejected; withdrawals are never requested.

## Existing page ownership

No page was added. Binance Operations and Bybit Operations own connection/provider diagnostics. Execution owns planner, claims, submission and normalization truth. Positions owns orders, fills and positions. Protection owns protection and managed-lifecycle coverage. Recovery owns uncertainty, incidents, reconciliation and safety close. Provider Health owns health/monitor status. Customer Fleet owns customer/account assignment and Phase-D policy context.

## Customer #001 certification deferred

Customer #001 certification must prove real sandbox API permissions, account identity, provider-native filter refresh, rate-limit/timeout behavior, actual partial/full fills, conditional protection visibility, reconnect/restart reconciliation, TP1/BE/profit-lock/TP2/trailing behavior, alerts and safe projections with customer credentials. Live customer execution remains impossible and is not part of that certification.

**PHASE F IMPLEMENTATION CLOSED — BINANCE + BYBIT TEST/DEMO EXECUTION AND UNIFIED PROTECTION INTEGRATED; REAL PROVIDER CERTIFICATION DEFERRED TO CUSTOMER #001 SYSTEM CERTIFICATION.**
