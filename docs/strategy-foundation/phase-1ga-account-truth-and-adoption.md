# Account truth and ExecutionPlan adoption mapping

| Certified field | Existing source |
|---|---|
| Crypto ownership/account/environment | `connected_execution_accounts` |
| Crypto balance/equity/margin/health | `execution_account_runtime_proof.certified_truth` written from provider monitor observations |
| MT5 ownership/mode/health | `mt5_accounts` |
| MT5 balance/equity/margin/positions/freshness | latest `mt5_account_snapshots.certified_truth` |
| Static risk/routing/contract/capabilities and scope | current `certified_execution_account_policies` revision |
| Adoption authorization | current `certified_execution_adoption_policies` revision; disabled/zero by default |
| Winner | `certified_strategy_plans` |
| Risk/allocation/plan | `certified_runtime_artifacts` |
| Claims | `certified_runtime_claims` through atomic `claim_certified_execution` |
| Attempts/events | full event payloads in `certified_runtime_events` |
| Provider-order lineage | `certified_provider_order_bindings` |
| Existing monitor binding | exact compatibility row in `execution_orders`; MT5 primary command queue |
| Operations read contract | `certified_execution_account_latest` |

No loader fallback exists. A deployment whose existing monitors have not yet populated the added `certified_truth` fields safely yields zero eligible accounts and normalized rejection/no-work behavior rather than guessed capital.
