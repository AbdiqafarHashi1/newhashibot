# HashiBot V2

HashiBot V2 is the standalone future application workspace for the next HashiBot platform. V2 is independent from V1 and now contains a real engine layer plus contract tests and focused engine tests.

This workspace is ready for the next Platform Foundation step, but it is **not** a production trading platform yet. Do not treat this repository as live-ready until platform wiring, secrets, deployment, and live provider/testnet smoke certification are completed.

## Current status

### Implemented engine layer

The V2 engine layer currently includes:

- Exchange Provider Contract
- Binance Provider
- Bybit Provider
- Trade Truth Store
- Command Queue + Idempotency
- Execution Planner
- Execution Worker
- Protection + Recovery Engine
- Market Data Provider Layer
- Shared Candle Engine
- Shared Indicator Engine
- 8 Strategy Framework
- Arbitrator + Immutable Signal Engine
- Risk Engine + Capital Manager
- HashiCore Runtime

These components are implemented as repository/runtime code and covered by the V2 TypeScript test scripts. They are still pre-production and need platform/runtime hardening before any live use.

### Needs hardening before live trading

- Live provider/testnet smoke certification still remains before live trading.
- Provider behavior must be verified against certified exchange testnet flows before production use.
- Market data abstraction exists, but real production feed adapters still need platform/runtime wiring.
- Runtime operations, monitoring, secrets handling, and deployment procedures are not configured for production.

### Missing platform foundation

The following are **not built** in V2 yet:

- Platform Foundation
- Supabase/Auth/API platform schema
- Telegram Platform
- Real UI
- MT5/HashiBridge/Agent EA
- Research Lab
- Deployment/Operations

Supabase production project configuration and production secrets are **not configured**. Do not add or assume production secrets in this workspace.

### Supabase and migrations

Only engine migrations currently exist under `supabase/migrations`:

- Trade Truth Store migration
- Command Queue + Idempotency migration

Platform schema, auth, RLS, Edge Functions, billing, customer accounts, Telegram, and operational deployment migrations are later work and should be handled in the Platform Foundation phase or later roadmap steps.

## Workspace boundaries

- `apps/`: customer/admin/Telegram platform shells and placeholders; no real platform implementation yet.
- `services/`: engine and service runtime modules, including HashiCore, risk, market intelligence, execution orchestration, arbitrator, and monitoring boundaries.
- `packages/`: shared contracts, market data abstractions, candle/indicator engines, events, state machines, runtime cache, mock data, UI shell contracts, and utility packages.
- `execution/`: exchange provider contracts, Binance/Bybit providers, command queue, execution planner/worker, protection/recovery, and Trade Truth Store modules.
- `hashibridge/`: protocol contracts and desktop/local queue/updater/Agent EA placeholders; MT5/Agent EA implementation is later roadmap work.
- `strategies/`: implemented central 8-strategy framework modules for crypto and forex strategy families.
- `supabase/`: engine migration files plus documentation placeholders for later platform schema/functions/policies/seeds.

## Test scripts

Use the V2 package scripts from the repository root:

```bash
npm --prefix v2 run typecheck
npm --prefix v2 run test:contracts
npm --prefix v2 run test:execution
npm --prefix v2 run test
```

`npm --prefix v2 run test` runs the real V2 validation path: typecheck, contract tests, and execution tests. It must not silently pass if tests do not run.

## Later roadmap

Later steps should add the platform and operations layers without changing engine behavior unnecessarily:

- Supabase/Auth/API Platform Foundation
- Manual M-Pesa billing workflow
- Telegram Platform
- Customer/admin UI
- MT5/HashiBridge/Agent EA implementation and certification
- Research Lab
- Deployment, monitoring, runbooks, and production operations
