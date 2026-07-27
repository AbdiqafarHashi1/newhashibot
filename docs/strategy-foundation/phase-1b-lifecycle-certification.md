# Phase 1B End-to-End Trade Lifecycle Certification

## Certification scope

Phase 1B certifies the strategy-intent boundary in the active root runtime. It does not certify venue behavior or migrate execution consumers. No evaluator formula, parameter, arbitrator score, provider adapter, execution path, protection rule, Telegram/customer path, SQL, cron or deployment configuration was changed.

## Implemented artifacts

### Immutable `StrategyPlan` v1

`strategy-plan/v1` owns:

- identity: canonical ID/name/version, asset class, lifecycle, certification and publication mode;
- provenance: deterministic evaluation ID, evaluation timestamp, config schema/fingerprint, indicator version, market-data source and candle boundary;
- market context: canonical symbol/timeframe, regime, volatility, derived trend, session and honest liquidity/news knowledge states;
- decision and ordered qualification ledger;
- entry: type/zone/expiry, unknown maximum slippage and validity;
- risk proposal: strategy-owned SL/invalidation, TP1/TP2, additional targets and maximum holding bars—never size/leverage;
- documented management intent and cancel/time-exit expectations;
- cloned evidence, explanation and diagnostics.

The registry creates this plan beside the unchanged `ProfessionalStrategyResult`. Deep freezing recursively protects identity, direction, entry, stop, targets, confidence, evidence and all nested content. Deterministic evaluation IDs correlate the exact strategy, version, timestamp, symbol, timeframe, last candle and config fingerprint.

### Approval seam

`ApprovedStrategyPlan` appends the existing arbitrator's policy version, winner reason and competitor loss/rejection explanations around the exact frozen plan. It refuses `NO_TRADE`. The active arbitrator is deliberately not migrated or changed in Phase 1B.

### `SizedExecutionPlan` design seam

The design-only wrapper owns risk-engine decision, capital basis, portfolio exposure, provider/account/venue, position size, leverage, margin, execution instructions, protection policy and reporting metadata. It:

1. requires an already frozen strategy plan;
2. requires its correlation ID to equal the evaluation ID;
3. retains the exact plan by reference rather than copying/rebuilding economic intent; and
4. freezes the appended wrapper.

The strategy never owns those downstream fields. No active Binance, Bybit or MT5 caller constructs this wrapper yet.

## Lifecycle transition certification

| Transition | Phase 1B state | Mutation rule |
|---|---|---|
| Candidate → Qualification | Implemented by evaluator result plus ledger | Plan construction represents; cannot promote/reprice |
| Qualification → Arbitration | Existing runtime behavior preserved | Frozen plan is available beside legacy result |
| Arbitration → Approved StrategyPlan | Integration seam implemented and tested | Append explanation only; intent retained by reference |
| Approved → SizedExecutionPlan | Design seam implemented and tested | Downstream fields append; correlation mandatory |
| Sized → Execution Plan → Execution | Existing systems unchanged | Future adoption must consume immutable intent |
| Execution → Protection → Management → Exit | Existing systems unchanged | Provider facts/actions append; plan fields never mutate |
| Exit → Reporting → Archive | Contract documented | Evaluation/correlation ID is canonical lineage key |

## Deterministic explanation

The canonical explanation is assembled without AI inference from:

- `identity` and `provenance` for who/when/input/config;
- `market_context` for regime and known/unknown context;
- `decision`, `qualification_ledger` and `evidence` for why;
- `entry_plan`, `risk_proposal` and `management_intent` for where/until when;
- `ApprovedStrategyPlan.arbitration` for why the winner won and competitors lost;
- the evaluation ID for reporting/archive correlation.

Unknown liquidity, news, maximum slippage and runtime duration are explicitly warned rather than invented.

## Golden parity certification

The strategy compatibility suite retains SHA-256 baselines for all six production evaluator functions and now additionally proves:

- all 12 canonical strategy identities construct `strategy-plan/v1`;
- BUY/SELL/NO_TRADE representation follows the legacy result;
- accepted entry, SL, TP1, TP2, RR, confidence and grade are exactly equal to legacy values;
- research lifecycle/publication identity remains shadow-only;
- identical inputs/config/results create deeply equal plans and stable key-order-independent fingerprints;
- entry/evidence mutation throws after approval;
- rejections have null economic instructions and a visible failed evaluator gate/category;
- arbitration and sizing wrappers retain the exact frozen plan;
- correlation mismatch and approval of `NO_TRADE` are refused.

## Certification verdict

**Strategy boundary: certified with legacy compatibility.** Every invoked registered strategy produces one deterministic immutable plan alongside its unchanged legacy output. The append-only approval and sizing seams prohibit mutation when adopted. **Downstream migration: intentionally pending** under the explicit Phase 1B non-goal of fully migrating sizing/execution and the prohibition on changing venue behavior.

