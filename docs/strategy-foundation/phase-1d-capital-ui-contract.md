# Professional Capital Allocation UI / Backend Contract

## Truth-only rule

The professional Capital page must project real account snapshots, provider contract specifications and immutable CapitalAllocationPlans. Missing values render `UNKNOWN`, `STALE` or `UNAVAILABLE`; the browser must not insert a balance, leverage, rule, timestamp or allocation.

## Component contract

1. **CapitalAllocationSummary** — allocatable/allocated/rejected counts, total authorized/allocated risk, margin reserved, freshness warnings and efficiency calculated from complete real plans only.
2. **ProviderCapitalGrid** — four isolated sections: Binance, Bybit, MT5 Personal and MT5 Prop.
3. **AccountCapitalCard** — account/environment/currency, balance/equity, available capital/margin, used margin/utilization, leverage mode/cap, health, truth timestamp/age and open allocations.
4. **ContractSpecificationPanel** — symbol/product/broker symbol, quantity or lot min/max/step, tick/price precision, contract size/multiplier, tick/pip value, min/max notional, margin mode/rate and specification fingerprint.
5. **AllocationDecisionStream** — status/decisive constraint, strategy/symbol, requested/authorized/allocated risk, quantity/lots, notional, margin, leverage, provider/account, correlation/allocation IDs and timestamp.
6. **AllocationDetail** — exact risk reference, all gates, precision adjustments, rounding explanation, rejected constraints, account candidates/ranks and immutable lineage.

## Required backend seams

- Latest account-capital truth keyed by provider/account with provider timestamp and freshness.
- Latest provider contract specification keyed by provider/environment/account/symbol/product and source timestamp.
- Immutable allocation-plan stream keyed by allocation/correlation/evaluation IDs.
- Current open-allocation/margin reservation projection derived from plans and later execution truth.
- Access-controlled provider/account assignment and policy priority.
- Efficiency/rejection aggregates calculated server-side from complete canonical rows.

Phase 1D creates no persistence and does not change the current Capital page. Bybit must remain unavailable until a real capital/specification adapter exists. Customer configured-capital summaries are not provider balances and cannot authorize allocation.

