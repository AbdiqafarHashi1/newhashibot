# Strategy Lifecycle and Future Unified Contract

## Lifecycle contract

Every strategy is expected to traverse the same auditable state machine. Phase 1A documents ownership only; it does not alter the implementation.

```text
Candidate → Qualification → Arbitration → Sizing → Execution Plan → Execution
          → Protection → Management → Exit → Reporting → Archive
```

| Stage | Required intent | Owner / boundary today | Required durable evidence |
|---|---|---|---|
| Candidate | A strategy recognizes a setup from closed, valid, eligible market data. | Strategy evaluator + professional registry | Strategy ID/version, config provenance, input candle boundary, evidence, direction, proposed levels, rejection reasons |
| Qualification | Apply score, RR, distance, freshness, symbol/timeframe, regime, and policy gates without comparing strategies. | Evaluator, registry eligibility, scanner distance guards | Every gate outcome and normalized reason; no silent drop |
| Arbitration | Select at most the permitted winner among qualified candidates without changing their thesis. | Scanner arbitrator (out of scope for behavior changes) | All competitors, deterministic scores, winner/loser reasons, policy version |
| Sizing | Convert risk policy and stop distance into exposure, respecting account and portfolio constraints. | Risk/execution services, not strategy | Capital basis, risk amount/percent, quantity, leverage cap/source, portfolio guard decisions |
| Execution Plan | Turn the immutable approved thesis into exchange/broker-specific orders. | Execution planner/service | Venue, symbol mapping, side, order types, prices, quantities, time-in-force, expiry, idempotency key |
| Execution | Submit/reconcile orders and establish fill truth. | Binance/Bybit/MT5 execution paths | Request/response IDs, fills, average price, fees/slippage, rejected/cancelled reason |
| Protection | Establish and continuously verify SL/TP protection. | Venue execution/monitoring | Protection order IDs, quantities, state, coverage, repair/escalation events |
| Management | Execute only the approved lifecycle policy (partials, BE, trailing, time stop). | Monitor/management services | Trigger, before/after state, quantity, protected risk, policy version |
| Exit | Reach one explicit terminal economic outcome. | Venue/monitor reconciler | Cause, timestamp, fill price/quantity, realized P&L/R, fees, residual position check |
| Reporting | Present the same canonical truth to operators/customers/analytics. | Reporting views/UI/notifications | Correlation ID, outcome, latency, lifecycle exceptions; channel delivery is downstream |
| Archive | Preserve reproducibility and lineage under retention policy. | Database/archive process | Inputs or immutable references, versions, full event sequence, terminal status, retention class |

### State invariants

1. Strategy evaluation is pure with respect to execution: it proposes, never places orders.
2. A rejection and every non-publication decision have a structured reason.
3. Identity, version, configuration hash/source, market-data boundary, and timestamps never change after candidate creation.
4. Arbitration may select/reject but must not silently rewrite entry, stop, targets, direction, or strategy evidence.
5. Sizing may reduce or refuse exposure but must not widen the strategy stop or fabricate reward.
6. Execution cannot begin without an approved immutable plan and idempotency key.
7. A filled position cannot be considered healthy until protection coverage is verified.
8. Management actions name the policy and trigger that authorized them.
9. Every path ends exactly once in a terminal outcome or an explicit unresolved exception.
10. Reporting derives from canonical lifecycle facts, never a UI-local reconstruction.

## Proposed Phase 1B `StrategyPlan` contract (documentation only)

The following is a language-neutral target interface, not an implementation request:

```text
StrategyPlan {
  schema_version
  identity { strategy_id, strategy_version, display_name, asset_class, lifecycle, certification }
  provenance { evaluation_id, evaluated_at, config_version, config_hash, config_source,
               market_data_source, candle_close_time, candle_count, indicator_engine_version }
  scope { market, canonical_symbol, provider_symbol?, timeframe, eligible_sessions? }
  decision { action: BUY|SELL|NO_TRADE, confidence, grade, reasons[], regime, thesis }
  qualification { gates[], qualified, freshness, liquidity, volatility, structure, momentum, rr }
  entry { type, low, high, reference_price, valid_from, expires_at }
  risk_proposal { stop, stop_basis, invalidation, tp1, tp2, targets[], proposed_rr,
                  max_holding_bars, time_exit_intent }
  management_intent { partials[], break_even_trigger?, trailing_policy?, cancellation_conditions[] }
  evidence { indicators, structure, market_context, strategy_specific }
  diagnostics { warnings[], evaluator_status, runtime_duration_ms? }
}
```

### Contract rules

- Monetary/exposure fields such as quantity, leverage, account risk, and notional are deliberately absent from the **strategy proposal** and are appended in a downstream `SizedExecutionPlan`.
- `NO_TRADE` plans retain identity, provenance, evidence, and reasons but have null entry/risk proposals.
- Prices use explicit decimal/precision metadata; timestamps are ISO-8601 UTC; enum values and reason codes are versioned.
- Strategy-specific evidence lives only under `strategy_specific`; common gates use common names and units.
- The wrapper must preserve legacy output during migration so Phase 1B can certify parity before any cutover.
- Research/shadow plans use the same schema but remain non-publishable through an explicit lifecycle flag, not naming convention.

## Dependency boundaries

```text
Market-data adapters → canonical candles → indicator/market-context engines
                                         ↓
                             strategy registry/evaluators
                                         ↓
                              qualification + arbitration
                                         ↓
             risk/sizing → execution planner → venue adapters
                                         ↓
              protection/management → canonical trade truth
                                         ↓
                       reporting/analytics → archive
```

Strategies may depend inward on canonical data, indicators, and read-only context. They must not depend outward on venue clients, Telegram, customer packages, persistence mechanics, or arbitrator preference. The scanner currently combines several of these responsibilities; Phase 1B should introduce seams and certification, not a broad rewrite.

