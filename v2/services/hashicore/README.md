# HashiCore Runtime

HashiCore is the V2 trading brain. It is an orchestrator only: it does not calculate indicators, own strategy logic, size positions, place provider orders, or persist runtime state.

## Deterministic pipeline

HashiCore processes exactly one pipeline per closed candle fingerprint:

1. `CandleClosed` event is received.
2. The shared candle cache is read for closed candles only.
3. The shared indicator engine/cache provides the matching indicator snapshot and `MarketFeatures` for the candle close time.
4. Eligible production strategies are evaluated for the candle market/timeframe.
5. All `StrategyCandidate` outputs are collected; rejects are not forwarded.
6. The existing Arbitrator selects `WINNER`, `MULTIPLE_VALID`, or `NO_TRADE`.
7. Only an arbitrator winner is passed to the Immutable Signal Engine.
8. The immutable signal is evaluated by the Risk Engine and Capital Manager path.
9. Approved risk decisions are converted to an Execution Planner signal input.
10. The Execution Planner enqueues commands through the Command Queue.
11. The Execution Worker may be delegated to run queued work; HashiCore never calls provider order APIs.

If any stage rejects, downstream stages do not execute.

## Dependencies reused

HashiCore composes these completed V2 subsystems through their public interfaces:

- Market Data events and provider health events
- Candle Engine closed-candle events and candle cache
- Indicator Engine snapshots and market features
- Professional Strategy Framework registry/strategy definitions
- Arbitrator and Immutable Signal Engine
- Risk Engine and Capital Manager decision model
- Execution Planner
- Command Queue via planner enqueueing
- Execution Worker delegation
- Event Bus

## Event subscriptions

HashiCore subscribes only to:

- `CandleClosed`
- `WarmupCompleted`
- `MarketFeaturesUpdated`
- `ProviderHealthy`
- `ProviderUnhealthy`
- `ConnectionRecovered`
- `ConnectionLost`

It intentionally does not subscribe to websocket ticks, trades, order books, or direct provider streams.

## Published events

The runtime publishes deterministic orchestration events:

- `HashiCoreStarted`, `HashiCoreStopped`
- `PipelineStarted`, `PipelineFinished`, `PipelineFailed`, `PipelineCancelled`
- `StrategiesStarted`, `StrategiesFinished`, `CandidatesCollected`
- `ArbitrationStarted`, `ArbitrationFinished`
- `SignalGenerated`, `SignalRejected`
- `RiskStarted`, `RiskFinished`
- `PlanningStarted`, `PlanningFinished`
- `CommandsQueued`, `ExecutionDelegated`
- `StageSkipped`

## Failure handling

Recoverable failures are caught, logged as `PipelineFailed`, and the runtime continues with the next symbol/candle. Fatal stages can be configured; if one fails, HashiCore pauses, emits `PipelineCancelled`, and remains deterministic until resumed.

## Runtime cache

The in-memory runtime cache tracks only active pipeline state, currently processing symbols, warmup state, provider health, metrics, last execution timestamps, completed candle fingerprints, generated signal IDs, planned execution fingerprints, and candidate IDs. It is never persisted.

## Duplicate prevention

HashiCore prevents duplicates with deterministic in-memory fingerprints for:

- one pipeline per closed candle
- candidate IDs per runtime
- immutable signal IDs per runtime
- execution plan fingerprints per signal/command batch

The planner and command queue keep their own idempotency guarantees; HashiCore does not replace them.

## Health metrics

The runtime tracks pipeline, indicator, strategy, arbitration, risk, planning, queue, and worker latency fields, plus symbols/sec, candles/sec, signals/day, accepted/rejected percentages, average reward/risk, average confidence, pipeline failures, total pipelines, and candidate counts.
