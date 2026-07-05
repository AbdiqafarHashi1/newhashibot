# HashiBot V2 Master Architecture

HashiBot V2 is a new standalone SaaS trading platform to be built under `/v2`. V1 remains untouched and serves only as production-tested reference material.

## Constitutional Rule
If V1 conflicts with this V2 architecture, the V2 Constitution wins. V2 must be independently movable into a new repository and connectable to a new Supabase project without V1 dependencies.

## Target Outcomes
- Deterministic trading execution.
- One runtime truth and one trading brain.
- Event-driven modular subsystems.
- Customer-isolated execution environments.
- Minimal Supabase reads, writes, storage, and egress.
- Platform-independent execution through adapters.
- Explicit state machines for signals, trades, commands, executors, protection, and recovery.

## Logical Runtime Architecture
1. **Market Intelligence Layer**
   - One Crypto Scanner.
   - One Forex Scanner.
   - Shared Candle Engine.
   - Shared Indicator Engine.
   - Shared market structure, session, volatility, trend, and liquidity services.
2. **Strategy Layer**
   - Strategies consume shared intelligence only.
   - Strategies return candidates and never execute trades.
3. **HashiCore Trading Brain**
   - Arbitrator.
   - Risk Engine.
   - Capital Manager.
   - Trade Management Engine.
   - Protection Engine.
   - Recovery Engine.
   - Monitoring Engine.
4. **Execution Layer**
   - Command Queue.
   - Adapter registry.
   - Customer-specific executor environments.
   - Binance, Bybit, MT5, and future adapters.
5. **Persistence Layer**
   - Supabase stores durable facts only: signals, trades, customer actions, configuration, audit logs, reports, and analytics.
   - Live runtime state stays in memory.
6. **Platform Layer**
   - Customer portal.
   - Admin portal.
   - Telegram subsystem.
   - Monitoring and reporting.
   - Research Lab.
7. **HashiBridge**
   - Standalone Windows desktop execution bridge for MT5.

## Signal Lifecycle
Signals are immutable once created. State transitions must be explicit and event-driven, for example:
`candidate -> validated -> scored -> arbitrated -> approved -> queued -> active -> managed -> closed -> reported`.

## Command Lifecycle
Every execution command must move through:
`queued -> sent -> acknowledged -> completed -> verified -> archived`.
Duplicate command sends must be impossible through global IDs, idempotency keys, and state-machine guards.

## Protection Model
Protection is desired-state based:
`desired state -> actual state -> compare -> repair -> verify`.
The system must never assume stop loss, take profit, trailing, partial close, or close actions succeeded without verification.

## Customer Isolation
Customers never share execution state. Each customer owns accounts, executors, risk settings, permissions, logs, monitoring, health, and execution controls.

## Non-Goals for V2 Foundation
- No application code is defined by this document.
- No SQL or migrations are defined by this document.
- No Edge Functions are defined by this document.
- No V1 file movement or refactor is required.
