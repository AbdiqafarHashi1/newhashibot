# Phase D — Multi-tenant account policy and brain consolidation

## Audit and reused authorities

Phase D reuses, rather than replaces, the following authorities:

- `AccountExecutionController` remains the final runtime-control, product/provider, duplicate, canonical risk/capital and prop-gate authority.
- The registered `Mt5PersonalBrain`, `Mt5PropBrain`, `BinancePersonalBrain`, and `BybitPersonalBrain` remain provider policy implementations. The public families are now **Personal** and **Prop**; customers select versioned profiles and bounded configuration, never source-code brains.
- `connected_execution_accounts` remains the canonical owned-account record and its Vault `credential_ref` remains the secret boundary.
- Existing professional risk, capital allocation, trade management and recovery registries remain the only engines. Phase D introduces none of those engines.
- `customer_onboarding_provisioning` remains the setup workflow record. Entitlement and activation are eligibility gates and never alter canonical signal truth.

The new `account-policy-authority` is a composition boundary, not another brain. It resolves a preset and validated overrides, invokes the existing registered brain, invokes the existing account controller, and emits a provider-neutral execution **intent**. It performs no provider submission.

## Final account and brain contract

An execution account has one customer owner, one immutable provider identity, one execution instance, an explicit account mode, one versioned policy profile, and an account-local runtime control. A customer may own any number of distinct accounts. Identity and ownership fields cannot be updated after insertion.

Supported mode mapping is:

| Provider mode | Family | Existing implementation |
| --- | --- | --- |
| MT5 Personal | Personal | `Mt5PersonalBrain` |
| MT5 Prop evaluation/funded | Prop | `Mt5PropBrain` |
| Binance Personal/Prop product | Personal plus controller prop gate | `BinancePersonalBrain` |
| Bybit Personal/Prop product | Personal plus controller prop gate | `BybitPersonalBrain` |

Presets are Conservative, Balanced, Growth, and Prop-safe. Advanced values are accepted only within the chosen preset ceiling. Configuration covers risk per trade, total open risk, leverage, concurrent positions, daily/total drawdown, symbols, strategies and sessions. Existing brain news/weekend protection policy remains in the versioned base profile. Prop accounts fail closed unless Prop-safe is selected.

Every decision carries customer/account/signal identity, immutable account identity, brain family/provider/version, policy profile/version, frozen effective configuration, authorized risk, reason codes and deterministic intent/decision identifiers. Credential references are deliberately absent.

## Exact call path

1. Receive the immutable Phase-C `SignalContract` and snapshot it.
2. Assert `account.customerId === context.user_id`, account ID equality and provider equality.
3. Assert account/base-policy profile version, provider and mode lineage.
4. Resolve a canonical preset plus bounded account overrides into the existing immutable `AccountPolicy`.
5. Gate inactive account, execution adoption, entitlement status/expiry, strategy and session.
6. Resolve the existing provider brain through `getExecutionBrain` and call `evaluateSignal`.
7. Call `decideAccountExecution` with qualification, account runtime control, account-local state and the brain/prop result.
8. Recompare the canonical signal snapshot and fail if it changed.
9. Map the combined result to `ALLOW`, `REDUCE`, `BLOCK`, or `LOCK` and, only for allow/reduce, ask the existing brain to create a position plan.
10. Emit an execution intent. Phase D stops here; provider order placement is unchanged and deferred.

## Isolation and security guarantees

- All state inputs are account-scoped and must match both account and customer before evaluation.
- Decision rows are keyed and indexed by customer plus execution account and protected by owner/admin RLS.
- The same signal is evaluated independently for every owned account, so policy and state can legitimately change sizing or outcome without modifying signal truth.
- Account ownership, provider identity, environment, execution instance and immutable identity are trigger-protected from reassignment.
- Live-environment execution remains database-constrained off. Existing demo/test runtime controls remain intact.
- Safe account views and TypeScript read models omit `credential_ref`; decrypted credentials remain available only through the existing service-role Vault resolver.

## Page ownership and consolidation boundary

No new dashboard was added.

- **Customer Fleet Ops** owns customer/account fleet inspection and account-policy assignment. It should consume `execution_accounts_safe`; it does not own provider execution or secrets.
- **Risk** owns cross-account risk observation and policy-limit editing, using the same versioned account policy rather than its own policy model.
- **Customers / Access Requests / Users Access** own identity and entitlement administration, not trading decisions.
- **Provider Operations** (Binance, Bybit, MT5) owns provider health, diagnostics and existing account runtime controls, not customer onboarding or policy definition.
- **Mission Control** owns emergency and adoption switches, not signal truth or risk configuration.
- **Customer setup/onboarding** owns collecting provisioning preferences and linking the resulting `execution_account_id`; the final Phase-G experience is intentionally not built.

The local-storage `UnifiedCustomerAccount` fleet adapter is legacy presentation aggregation, not a new authority. It must not be used for downstream decisions. `connected_execution_accounts`, policy lineage and account-scoped runtime truth are authoritative.

## Deferred work

MT5/Binance/Bybit submission, order placement and adapter changes are Phase E or later. Final onboarding UX is Phase G. Commerce, marketing agents and scanner/research changes are outside Phase D. Live customer execution remains disabled.

**PHASE D IMPLEMENTATION CLOSED — MULTI-TENANT ACCOUNT POLICY AUTHORITY READY FOR PROVIDER EXECUTION PHASES.**
