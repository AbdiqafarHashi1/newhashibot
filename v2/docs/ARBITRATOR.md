# HashiBot V2 Arbitrator and Immutable Signal Engine

## Audit classification

| Area audited | Classification | Why |
| --- | --- | --- |
| V2 strategy candidate contract | Reuse & Improve | The arbitrator consumes the Step 11 deterministic `StrategyCandidate` outputs and normalizes compatibility fields without executing trades. |
| Existing HashiCore arbitrator concepts | Inspiration Only | Freshness, duplicate, confidence, RR and score concepts were useful, but Step 12 excludes risk/capital planning so the production arbitrator is isolated in `v2/services/arbitrator`. |
| Scanner winner-selection logic | Replace Completely | Scanner-specific winner selection is replaced by deterministic ranking across confidence, grade, RR, trend, momentum, liquidity, volatility, structure, certification, health, expiry, duplicate and correlation risk. |
| Existing signal immutability idea | Reuse & Improve | Signals are deeply frozen and lifecycle changes are represented by immutable lifecycle records rather than mutating the signal. |

## Arbitrator

The arbitrator accepts candidates from all eight strategies and produces `WINNER`, `MULTIPLE_VALID`, or `NO_TRADE`. It rejects expired candidates, duplicates by symbol/direction/timeframe/strategy, conflicting directions, correlated opposing opportunities, active cooldowns, active signal duplicates, weak confidence, weak grade, weak RR, bad liquidity/volatility/trend/momentum/structure, closed sessions, unsuitable regimes, unhealthy strategies and non-production strategies.

Ranking is deterministic and uses strategy score, confidence, grade, RR, trend strength, momentum score, volume score, structure score, strategy health, certification, lifecycle status and market regime context.

## Immutable Signal Engine

The immutable signal engine creates deeply frozen `Created` signals from arbitrated winners. Signals include ID, strategy, provider, environment, market, symbol, timeframe, direction, entry, stop loss, TP1, TP2, optional TP3, confidence, grade, RR, expected duration, timestamps, reason codes, feature snapshot, indicator snapshot and metadata.

Lifecycle transitions produce immutable lifecycle records. The original signal is never mutated.

Allowed signal states are `Created`, `Approved`, `Rejected`, `Expired`, `Cancelled`, `Archived`, and `Closed`.

## Event Bus

The signal engine publishes `SignalCreated`, `SignalApproved`, `SignalRejected`, `SignalExpired`, `SignalCancelled`, and `SignalArchived` events through the existing event bus.

## Runtime Cache

`ActiveSignalCache` is transient in-memory state only. It tracks active immutable signals for duplicate prevention and exposes lightweight stats by symbol. It does not persist anything.
