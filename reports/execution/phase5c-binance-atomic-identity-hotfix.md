# Phase 5C Binance atomic identity hotfix

## Pre-change contract trace

`connected_execution_accounts.id` is the immutable canonical account UUID and
`customer_id` is the owner UUID. `account_id` is the runtime routing identity;
`provider_account_identity` is the duplicate-prevention/provider-workspace identity.
Phase 5C onboarding persisted the discovered identity into both text fields. When
Binance Futures Testnet did not return `accountAlias`, verification produced
`canonical:binance:testnet:system`, so both fields contained that value.

Execution ownership constructs exactly four atomic components:

```text
customer_id:provider:account_id:execution_instance_id
```

Colon (`:`) is the reserved component separator. Consequently `customer_id`,
`provider`, `account_id`, and `execution_instance_id` must each be non-empty,
colon-free atoms. `credential_ref` is ownership metadata but is not a scope-key
component. `provider_account_identity` is not currently parsed into the scope,
but must remain atomic because onboarding, duplicate detection, provider workspace
selection, and `account_id` persistence share one discovered identity contract.

The incompatible `account_id` was rejected by `edgeScopeKey` before the Binance
monitor could enumerate rows. The same resolver is used by operator credential
resolution, execution/runtime proof, protection repair and recovery, command
scope generation, monitor leases, execution orders, trade-management truth, and
runtime-proof ownership. Bybit does not use this fallback and is unchanged.

The production evidence identifies one existing canonical Binance Testnet system
row. Because failure occurred during ownership construction before row processing,
no dependent monitor/protection rows are expected for this identity. The migration
nevertheless discovers and updates any exact denormalized `account_id` references
and embedded scope-key component, in the same transaction as the canonical row.
There are no schema foreign keys to these text identities; relational account
references use the canonical UUID. The unique identity index is
`(customer_id, provider, environment, provider_account_identity)`.

## Repair contract

The fallback is `canonical-binance-testnet-system`. It is deterministic,
non-secret, non-reversible, scoped to the system-owned Binance Testnet slot, and
contains no reserved separator. It is a canonical fallback, not a Binance-native
UID. The migration locks and updates the existing row; it does not insert an
account or touch Vault, state flags, execution settings, cron, or Bybit data.

Malformed identities remain rejected. Runtime row resolution now reports the
safe code `EXECUTION_ACCOUNT_IDENTITY_NOT_ATOMIC` together with provider,
environment, canonical UUID, field name, and failing stage, without credentials.

## Post-deployment verification

1. Apply migrations and deploy the changed shared edge-function modules plus all
   importing Binance monitor/execution functions.
2. Query the existing canonical row by its known UUID and confirm both identity
   fields equal `canonical-binance-testnet-system`; confirm the UUID,
   `credential_ref`, `enabled`, `monitor_enabled`, `is_operational`, and
   `execution_enabled = false` are unchanged. Confirm exactly one system-owned
   Binance/Testnet row exists.
3. Invoke `run_binance_monitor_now`. Require `success=true`,
   `configured_account=true`, `monitor_status=MONITORING`, all five read/sync
   checks true, and `execution_adoption=EXECUTION DISABLED`.
4. Invoke `repair_protection_now` for that canonical UUID. With no positions,
   require `success=true`, `repair_attempts=0`, `unsafe_count=0`, and execution
   still disabled.
5. Run the Binance runtime proof and supervisor action. Confirm neither contains
   `execution_ownership_reserved_delimiter` and both resolve the same four-part
   scope key.
6. Re-run Binance onboarding verification with the existing credentials only as
   a read-only verification. Confirm it reports identity source `canonical
   fallback`; do not submit account creation. Confirm duplicate onboarding is
   rejected as `SYSTEM_ACCOUNT_ALREADY_EXISTS` before Vault access.
7. Invoke the Bybit Demo monitor and recovery checks and confirm the existing
   healthy/PASS behavior is unchanged.
8. Confirm execution is OFF, no order mutation endpoint was invoked, and cron
   definitions are unchanged.
