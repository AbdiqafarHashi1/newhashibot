# Phase 1F adoption architecture

`execution-plan/v1 → execution-adoption-policy/v1 → pre-submit revalidation → atomic claim → thin provider adapter → execution-event/v1 → deterministic projection → fill-binding-policy/v1 → protection-verification/v1`.

Policies are explicit by provider/environment/account/mode/customer/version and default to `DISABLED`; `LIVE` is unrepresentable in a valid policy and independently rejected from provider truth. Rollback, health, age, contract/capability/routing/execution fingerprints, route identity, conflicts, margin, and MT5 Prop lineage are fail-closed.

Claims cover plan, configuration, every planned entry and protection role. First claimant wins; completed replay is a no-op; stale recovery retains the logical plan/order IDs. Ambiguous submission begins reconciliation by deterministic client ID and never immediately retries. The prepared persistence contract is unapplied.

Adapters are isolated: Binance testnet requires `newClientOrderId`; Bybit demo requires V5 `category`/`orderLinkId`; MT5 Personal and Prop demo require exact broker lots and queue identity. They forward certified native payloads and cannot resize, reprice, change leverage, or move protection.

Events project the canonical state machine independently of arrival order. Provider-native statuses are normalized. Terminal reopening and invalid predecessor transitions fail. Entry state and protection state remain distinct.
