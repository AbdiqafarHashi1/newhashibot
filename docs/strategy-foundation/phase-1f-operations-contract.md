# Execution/protection Operations contract

The backend must expose real append-only events, projected state, adoption controls, claim leases, provider health/freshness, reconciliation outcomes and protection verifications. Provider cards remain separate for Binance testnet, Bybit demo, MT5 Personal demo and MT5 Prop demo. Incident banners cover unprotected/degraded positions, duplicate claims, uncertain submission, stale truth, fingerprint mismatch and provider outage.

Trade detail renders the immutable StrategyPlan → RiskDecision → CapitalAllocationPlan → ExecutionPlan chain, attempts, provider/fill facts, protection verification and recovery events. The protection matrix shows actual, stop, TP1, TP2, residual, over/under coverage, trigger correctness, age and remediation. No invented operational values are allowed.

Controls use `execution-adoption-control/v1`: disable, shadow compare, halt, reconciliation, protection-only recovery, rollback and incident acknowledgement. Each request is authorized, idempotent and audit-required; provider confirmation is explicit where applicable. There are no dead UI controls in this phase.

The manual proof request requires provider, non-production environment, account, symbol, bounded test risk, credentials, fresh truth, certified policy, rollback and explicit confirmation. It is never automatically invoked.
