# HashiBot V2 Architectural Decisions

## ADR-001: V2 Is a New Standalone Application
V2 will be built inside `/v2` and must be independently deployable. V1 remains untouched and is not a dependency.

## ADR-002: Supabase Is Persistence, Not Runtime Memory
Runtime state lives in memory. Supabase stores only durable records needed for recovery, audit, analytics, reporting, and configuration.

## ADR-003: One Scanner Per Market
There must be one Crypto Scanner and one Forex Scanner, never one scanner per customer.

## ADR-004: Strategies Do Not Fetch Market Data
Strategies consume shared candles, indicators, market structure, sessions, volatility, trend, and liquidity from shared engines.

## ADR-005: One Trading Brain
Arbitration, risk, capital allocation, protection, trade management, recovery, and monitoring are centralized in HashiCore.

## ADR-006: Event-Driven Communication
Subsystems communicate through events and contracts, not direct cross-module coupling.

## ADR-007: Explicit State Machines
Signals, trades, commands, executors, protection, and recovery use explicit states rather than scattered booleans.

## ADR-008: Adapter-Based Execution
HashiCore never knows whether execution is Binance, Bybit, MT5, or another platform. Execution always flows through adapters.

## ADR-009: Customer-Isolated Execution
Each execution customer receives an isolated execution environment with separate account state, risk settings, commands, logs, and health.

## ADR-010: HashiBridge Is Execution-Only
HashiBridge never contains strategy, arbitrator, risk, or trading decision logic.

## ADR-011: Research Lab Gates Production Strategies
Strategies graduate through replay, backtesting, walk-forward testing, optimization, Monte Carlo, shadow mode, certification, and performance tracking before production.

## ADR-012: Retention Is Mandatory
Logs, telemetry, and high-volume audit data must have retention windows and automatic cleanup policies.
