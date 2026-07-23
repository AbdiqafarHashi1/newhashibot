# Phase 8B — Professional Trade Management and Certification

## Shared architecture

`ProfessionalTradeManager` is the provider-independent management loop for Binance, Bybit, and account-scoped MT5. It consumes the shared `ExchangeProvider` contract and canonical trade truth, compares truth with live positions/orders, repairs protection through provider methods, applies break-even, trailing-stop and partial-close policies, persists idempotent lifecycle transitions, and publishes lifecycle events through an injected reporting adapter. Providers only translate those operations.

Reconciliation keys positions by provider position ID where available and detects missing/duplicate/quantity-mismatched/orphan positions, missing SL/TP, and stale synchronization. Retry is bounded, exponential, and restricted to transient errors. Configurable Personal, Demo and Prop Challenge policies include daily/weekly loss locks, exposure and position limits, break-even, trailing, partial close, staleness and retry caps.

## Operations and certification

The migration adds per-account execution policies, durable idempotent recovery jobs, and an MT5 provider-health view exposing connection/synchronization state, pending/failed queue depth, command latency, heartbeats, last sync and last successful execution.

Repository certification covers deterministic management, reconciliation, protection repair routing, policy locks, partial close, trailing stops, transient retry, existing shared execution tests, lint and build. Live certification still requires controlled Binance, Bybit and Windows MT5 Personal/Demo/Prop accounts, deployed workers, broker market hours, long-running soak tests and operator sign-off. Repository tests cannot certify broker fills, VPS availability, prop-firm permission or live network behavior.
