# 04 Trading Engine Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 market-scanner Edge Function combines market data acquisition, candle interpretation, indicators, strategy decisions, Telegram output, and execution triggers. Classification: REWRITE.
- V2 requires canonical event bus: CandleClosed -> IndicatorsUpdated -> CandidateCreated -> SignalCreated -> dispatch/execution. V1 does not implement this as explicit contracts.
- Signal lifecycle exists as statuses and updates but signal immutability is not enforced as a domain object. Classification: REWRITE/MODERNIZE schema.

## Required V2 rebuilds
- HashiCore service, canonical market event bus, immutable signal engine, arbitrator, risk engine, capital manager, explicit state machines.
- Durable events only for meaningful state changes; runtime state in cache.
