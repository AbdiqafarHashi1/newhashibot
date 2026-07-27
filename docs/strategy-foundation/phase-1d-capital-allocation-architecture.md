# Phase 1D Professional Capital Allocation Architecture

## Versioned contracts

### `capital-allocation-context/v1`

Contains the exact immutable `RiskDecision`, evaluation/correlation IDs, evaluated time, provider, permitted account IDs, candidate account snapshots, provider contract specification, provider timestamp/freshness and maximum truth age. Each account supplies balance/equity, available capital/margin, used margin/utilization, health, enablement, environment, account currency and timestamp.

Allocation accepts only `ACCEPT` or `REDUCE`. It requires the context provider and lineage to equal the risk envelope and refuses mutable decisions. Phase 1C currently authorizes a singular `permitted_account_id`; the selector therefore never broadens scope. Multiple snapshots/candidates may be considered, but only that authorized account can win. A future multi-account scope requires a separately versioned RiskDecision change—not a Capital Engine workaround.

### Provider contracts

- **Binance / Bybit Crypto:** provider-specific product, quantity step/precision/min/max, tick and price precision, min/max notional, contract multiplier, leverage mode/cap and quote currency. Rules are never reused across providers.
- **MT5 Personal / Prop:** broker/canonical symbol, contract size, tick size and tick value in account currency, pip size, digits, minimum/maximum lot, lot step, account leverage cap or explicit margin rate, account currency and quote-to-account conversion. MT5 Prop remains separately constrained by the already-authorized risk/leverage envelope.

No default rules are synthesized. An incomplete or mismatched provider specification rejects allocation.

## Calculators

### Crypto v1

```text
risk quantity       = authorized risk amount / (|entry - stop| × contract multiplier)
notional quantity   = min(provider max notional, risk max notional) / (entry × multiplier)
raw quantity        = min(risk quantity, notional quantity, provider max quantity)
executable quantity = floor(raw quantity to provider quantity step and precision)
notional            = quantity × entry × multiplier
leverage            = 1 for spot; otherwise min(risk ceiling, provider cap)
margin              = notional / leverage
```

### MT5 v1

```text
ticks per stop       = |entry - stop| / tick size
risk per lot         = ticks per stop × tick value in account currency
risk lots            = authorized risk amount / risk per lot
notional lots        = risk maximum notional / (contract size × entry × conversion)
raw lots             = min(risk lots, notional lots, broker maximum lot)
executable lots      = floor(raw lots to broker lot step)
contract quantity    = lots × contract size
notional             = contract quantity × entry × quote/account conversion
margin               = notional × explicit margin rate, else notional / permitted leverage
```

No quantity is rounded upward, so provider precision cannot increase authorized exposure.

## Ordered gates

1. Immutable, allocatable RiskDecision and exact lineage/provider.
2. Fresh provider truth by timestamp and state.
3. Sufficient available capital for authorized risk.
4. Available margin present.
5. Complete provider-matched contract specification.
6. Explicit precision.
7. Positive derived quantity.
8. Provider minimum quantity/lot.
9. Crypto minimum notional (MT5 uses minimum lot).
10. Provider and risk maximum notional.
11. Risk/provider leverage ceiling.
12. Final margin and allocation verdict.

Every gate exposes order, stable ID, PASS/REJECT/NOT_APPLICABLE, observed/required values, unit, reason and explanation. A rejected plan contains no executable allocation and lists every rejected constraint.

## Account selection

Eligibility order is: exact RiskDecision account scope → provider match → enabled/execution-enabled → healthy → known/fresh → positive capital and margin. Eligible records sort deterministically by lowest utilization, policy priority, account ID, then newest provider timestamp. The plan records all candidates, eligibility reasons, rank and why the winner won. It never randomly selects or uses an unauthorized lower-utilization account.

## Immutable output

`capital-allocation-plan/v1` retains the exact RiskDecision and ApprovedStrategyPlan by reference. It records provider/account, authorized envelope, quantity/lots/contracts, notional, margin, leverage, precision adjustments, rounding explanation, gates, constraints and fingerprints. Strategy and risk fields are never copied into mutable replacements. Execution consumption remains pending Phase 1E.

