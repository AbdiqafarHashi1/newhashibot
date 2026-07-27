# Phase 1E Professional Execution Planning and Routing Architecture

## Contracts

### `execution-planning-context/v1`

Contains the exact frozen CapitalAllocationPlan, evaluation/correlation IDs, provider/environment/account, the complete certified provider contract and fingerprint, provider truth timestamp/freshness, routing timestamp, a versioned routing policy and explicit provider capabilities. Capabilities include symbol mapping, supported entry/TIF/leverage modes, minimum stop distance, reduce-only/close-on-trigger/post-only support, margin/leverage configuration ownership, MT5 fill policies and bid/ask when pending subtype selection requires them.

No capability is inferred. Missing, stale, mismatched or unsupported data rejects routing.

### `execution-plan/v1`

Retains the exact StrategyPlan, RiskDecision and CapitalAllocationPlan references. It records one provider/account/environment route, canonical/provider symbols, routing policy/version, explicit configuration prerequisites, order sequence, immutable provider-native orders, ordered gates, plan/order idempotency, execution/routing fingerprints and diagnostics. A rejected plan has no orders or configuration actions.

## Provider isolation

### Binance

- Optional/pre-entry margin-mode instruction maps to `/fapi/v1/marginType`; leverage maps to `/fapi/v1/leverage` when capabilities authorize changes.
- LIMIT uses `price`, native `GTC` or `GTX` for post-only; MARKET has no planned price/TIF.
- Protection uses opposite-side `STOP_MARKET`/`TAKE_PROFIT_MARKET`, stop price, reduce-only, working type and deterministic `newClientOrderId`.

### Bybit

- Configuration is separately marked preconfigured or explicit; no Binance endpoint/field is reused.
- Entry uses V5 `category=linear`, `Buy`/`Sell`, `Limit`/`Market`, string quantity/price, Bybit TIF or `PostOnly`, and deterministic `orderLinkId`.
- Conditional exits use Market, `triggerPrice`, direction 1/2, `MarkPrice`/`LastPrice`, reduce-only and close-on-trigger.

### MT5 Personal / Prop

- Uses broker symbol, lots, explicit account leverage/margin verification and supported fill policy.
- MARKET plans `DEAL`; pending plans resolve exactly to BUY/SELL LIMIT/STOP from certified bid/ask. Missing bid/ask rejects.
- Two child entries conserve total lots and preserve TP1/TP2: each carries its target and the same attached SL. Payload includes action/type, price when pending, GTC/filling, deterministic magic/comment/client request ID.
- Personal and Prop routes remain distinct providers/accounts; Prop cannot inherit Personal routing.

## Ordered routing gates

1. Deeply immutable `ALLOCATED` capital plan.
2. Fresh provider routing truth.
3. Exact certified contract fingerprint.
4. Provider, environment, account, policy, capability and specification compatibility.
5. Explicit canonical-to-provider symbol mapping.
6. Supported order type, TIF, post-only and protection semantics; pending MT5 bid/ask truth.
7. Directionally valid stop and provider minimum distance.
8. Directionally ordered TP1/TP2.
9. Unchanged leverage within authorized ceiling and supported mode.
10. Valid TP split that floors to provider increments and exactly conserves allocation; complete provider translation.

Every gate exposes order, stable ID, PASS/REJECT/NOT_APPLICABLE, observed/required values, canonical reason and explanation. Routing never rounds prices, resizes quantity, changes leverage or repairs upstream intent.

## Deterministic routing and idempotency

The singular Phase 1D account scope routes directly and explainably. The contract already separates provider/account/policy/capabilities so a future multi-account RiskDecision can reuse the planner without architecture changes; the planner itself never broadens scope.

Canonical key inputs include correlation ID, allocation ID, provider/account, routing policy/capabilities, contract fingerprint and order role. Each order has a stable client ID (provider-safe 36-character maximum) and idempotency key. Configuration actions and the overall plan have independent keys. Same inputs produce byte-equivalent plans; routing and execution fingerprints make provider/policy drift visible.

