# Phase 5C provider-scoped runtime-proof routing hotfix

## Contract and root cause

`admin-operator-action` previously built one `selection` object from the request's
`customer_id` and `account_id`, then spread that same object into both the Binance
and Bybit proof payloads. A Binance explicit identity therefore reached the Bybit
Demo target and failed as an invalid explicit Bybit account.

The repaired contract is:

- `provider=binance` invokes only Binance Testnet and may use the explicit account.
- `provider=bybit` invokes only Bybit Demo and may use the explicit account.
- `provider=all` (also the default when omitted) invokes both targets, but resolves
  each target's operational/selectable account independently. An explicit account
  is never reused across providers in an `all` proof.

Before downstream invocation the coordinator verifies that the canonical account
exists, belongs to the target provider and environment, is selectable or
operational, and has execution disabled. It returns non-secret runtime-proof error
codes for missing, provider-mismatched, environment-mismatched, non-selectable, or
execution-enabled accounts. The proof payload carries only canonical ownership
coordinates; credentials and Vault references remain inside provider resolution.

## Safety and deployment

The change modifies Edge Function orchestration only. It has no SQL migration,
does not alter account identities or credentials, does not change cron, and does
not enable execution. Runtime proofs remain read-only and report zero attempted
mutations.

## Post-deployment verification

1. Deploy `admin-operator-action` with its shared modules.
2. Invoke `run_runtime_proof` with `provider=binance` and the canonical Binance
   Testnet account; confirm the response contains only `binance_runtime_proof_target`.
3. Invoke it with `provider=bybit` and the native Bybit Demo account; confirm the
   response contains only `bybit_runtime_proof_target`.
4. Invoke it with `provider=all` and no `account_id`; confirm two PASS checks with
   distinct provider-correct account IDs.
5. Submit the Binance account with `provider=bybit` and confirm
   `RUNTIME_PROOF_ACCOUNT_PROVIDER_MISMATCH` occurs before any downstream receipt.
6. Repeat the inverse mismatch for Binance, then inspect execution settings,
   provider controls, execution orders, and provider dashboards to confirm
   execution is OFF, mutations attempted are zero, and no order was placed.
