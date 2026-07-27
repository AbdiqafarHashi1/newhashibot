# Phase 1G-A — Active Runtime Ownership and Integration

## Safety state

Phase 1G-A integrates contracts in code but leaves adoption disabled. It does not enable live trading, schedules, deployment, or apply SQL. Phase 1G-B must explicitly authorize a non-production account, policy, maximum test risk, rollback owner, and one controlled submission.

## Runtime ownership audit

| Stage / former writer | Legacy behavior found | Phase 1G-A owner | Disposition |
|---|---|---|---|
| `market-scanner` evaluators | Produced candidate entry, stop and targets | Professional strategy registry | Compatibility output is converted to an immutable `StrategyPlan`; it is not executor input. |
| Scanner mode-aware checks | Selected risk %, leverage guidance, daily lock and cooldown | `RiskDecision` | Guidance remains reporting compatibility only; certified execution cannot consume it. |
| `paper_execution_intents` | Copied signal prices and account-equity sizing | `CapitalAllocationPlan` | Paper lifecycle remains, but is not authoritative execution truth. |
| Binance testnet execution | Loaded signals, sized quantity, rounded precision and selected leverage | `ExecutionPlan` | Existing executor remains the transport; certified boundary accepts a planned order only. |
| Bybit demo execution | Provider-specific sizing and order reconstruction | `ExecutionPlan` | Existing V5 transport remains; recalculation is forbidden at the certified boundary. |
| MT5 bridge / EA | Lot sizing and protection fields could originate in command payloads | `ExecutionPlan` | Existing bridge remains and transports exact planned lots, SL and TP. |
| V2 planner, risk engine and capital manager | Parallel architectural runtime | Active root certified pipeline | Retained as inactive V2 code; it does not own root execution. |
| Exchange provider classes | Normalized side/status and provider payloads | Canonical runtime events + `ExecutionPlan` | Provider adapters translate acknowledgements only; they cannot write intent. |
| Testnet monitors / MT5 reconciliation | Provider status and fill polling | Existing monitors | Kept. They append observed attempts, fills and events against the plan lineage. |
| Provider acknowledgement | Sometimes treated as order success | `ProtectionVerification` | Acknowledgement is not protection. Actual filled/open/remaining quantity and active stop/targets must be observed. |
| Signal/trade/position tables | Mixed status, direction and provider words | Append-only normalized runtime events | Compatibility projections are read-only; the event vocabulary is canonical. |

### Duplicate removal report

The certified seam calls exactly one arbitrator, one risk evaluator per execution account, one capital allocator per accepted decision, and one execution planner per allocation. Account IDs are unique and checked at every lineage boundary. Precision and quantity rounding live only in capital allocation; prices, stop and targets remain the immutable strategy values; provider configuration and payload construction live only in execution planning. Executors receive an immutable `ExecutionPlan` and are limited to submit, acknowledge, reconcile, monitor and report.

Legacy calculations remain only where the legacy runtime still requires shadow comparison. They are classified as compatibility projections and cannot feed the certified adoption boundary. Every mismatch is recorded by the existing `shadowCompare` contract as exact parity, economic equivalence, or material drift.

## Integration and arbitrator report

`runCertifiedRuntime` is the single root orchestration seam: candidates → root arbitrator → winner/NO TRADE → approved immutable strategy plan → account risk → account capital → account execution. A NO TRADE result creates no account work. Missing or mutable winner plans and winner lineage mismatch fail closed. Downstream code receives the arbitrator winner but has no selection API.

## Runtime truth and protection report

The prepared event store is append-only and normalizes lifecycle status to: planned, claimed, submitted, acknowledged, partially filled, filled, protected, recovery required, rejected, failed, closed, and archived. Provider vocabulary belongs inside redacted event evidence, never in canonical status. Existing monitors bind observations to execution plan/account IDs. Existing protection verification compares actual fill, open quantity, entry remainder, stop/target orders and coverage; acknowledgement alone cannot yield `protected`.

## Customer capital isolation report

Each `ExecutionAccountInput` owns its account-specific risk context and factories for capital and execution context. The orchestrator rejects duplicate account IDs, risk/account mismatch, capital scopes containing another account, and execution lineage mismatch. Thus a Binance account with $1,000 at 1% authorizes $10 while a Bybit account with $8,000 independently authorizes $80; neither balance can be selected for the other account.

## Provider and Operations Center integration report

Binance, Bybit, MT5 Personal and MT5 Prop retain their existing executors and monitors. Their certified role is transport, acknowledgement, observation, reconciliation and reporting. Operations pages must query the prepared canonical projection plus existing account/provider truth; no fallback values are authorized. The execution detail contract exposes StrategyPlan, RiskDecision, CapitalAllocationPlan, ExecutionPlan, attempt, provider, fill, protection, recovery and runtime events. Account views expose current provider balance/equity, available risk, risk %, daily/weekly loss, drawdown, allocation, plan, provider health and protection, all timestamped from backend truth.

## Phase 1G-B controlled runtime handoff

1. Review and manually apply the prepared migration in a non-production change window.
2. Keep production/live environment forbidden and cron disabled.
3. Select one explicit testnet/demo customer account and maximum test risk.
4. Run shadow parity and resolve every material drift.
5. Confirm fresh account/contract/provider truth, executor health, existing monitor health and rollback owner.
6. Enable one account-scoped adoption policy, submit one plan, then disable the policy.
7. Verify provider fill and protection from provider observations, reconcile events, archive evidence, and obtain operator sign-off before expanding scope.

Rollback is policy-first: disable adoption, stop new claims, let the existing monitor reconcile in-flight work, preserve append-only evidence, and return execution to the legacy compatibility route. Schema removal is a separate manual operation after archival.
