# Phase 1C Provider-Aware Professional Risk Architecture

## Certified contracts

### `risk-evaluation-context/v1`

The caller supplies explicit lineage, request, account truth, portfolio truth and market/policy context. Facts use `KNOWN`, `UNKNOWN`, `STALE` or `UNAVAILABLE`; absent values remain `null`. Required account facts include balance/equity/margin, margin utilization, daily and weekly loss use, drawdown/peak, positions, pending orders and pending risk, aggregate open risk, provider health, snapshot time and freshness.

Portfolio truth is deliberately broader than the selected provider: exposure is supplied by provider, symbol, asset class, direction, base asset, quote currency, Forex currency, correlation group and gold. Consequently Binance and Bybit accounts remain operationally separate while BTC exposure across both remains economically related.

### Four independent domains

| Domain | Independent truth and policy | Additional focus |
|---|---|---|
| `BINANCE` | Binance account/balance/margin/positions/health and policy | Crypto symbol/base/quote, total Crypto exposure, margin utilization |
| `BYBIT` | Bybit account/balance/margin/positions/health and policy | Same categories, never copied from Binance |
| `MT5_PERSONAL` | One MT5 account/broker snapshot and personal policy | Forex currency/correlation, Gold, sessions, spread/news/overnight |
| `MT5_PROP` | One MT5 prop account plus explicit `PropRiskPolicy` | Daily/total/trailing/static drawdown semantics, safety buffer and account-specific restrictions |

### `risk-policy/v1` resolution

Applicable policies are sorted System → Account Mode → Provider → Prop → Customer → Strategy → Emergency. Numerical ceilings resolve to the lowest value; the minimum viable risk resolves conservatively; boolean hard requirements cannot be disabled by a weaker layer; unknown-context handling resolves `ADVISORY < REDUCE < REJECT`; allowed environments/assets resolve by intersection. Every effective limit records its owning policy ID/version/source, and the canonical resolved policy is fingerprinted.

`MT5_PROP` resolution refuses to proceed without a prop policy. Prop daily loss, maximum drawdown, maximum per-trade/open risk and leverage can only tighten the effective policy. Firm, stage, basis, floating-loss treatment, reset time/timezone, holding/news rules, safety buffer and unknown fields remain explicit.

## Ordered risk gates

1. **Contract:** deep freeze, tradeable plan, correlation and provider/account/policy domain.
2. **Account:** existence, enabled/authorized/execution state, manual lock, environment/account/asset policy scope.
3. **Truth:** required facts, actual snapshot age, positive balance/equity, provider health and margin utilization.
4. **Loss:** daily, weekly, drawdown, prop completeness and prop safety buffer.
5. **Portfolio:** aggregate and pending risk, concurrent positions and pending orders.
6. **Concentration:** cross-provider duplicate symbol, symbol/provider/asset/direction/correlation/base/quote, Forex currency and Gold.
7. **Market operations:** session, spread, liquidity, news, weekend, overnight, provider operation, account lock and customer execution.
8. **Authorization:** requested risk, per-trade cap, leverage ceiling and minimum viable risk.
9. **Final:** full `ACCEPT`, most-restrictive `REDUCE`, or `REJECT` with no envelope.

Every gate has a stable ID/category/status, observed and permitted values, unit, reason code, explanation, policy source and hard/reducing/advisory/informational effect. Required unknown/stale account truth rejects. Market unknowns follow explicit policy: reject, multiply authorized risk by the stated factor, or remain advisory.

## Deterministic reductions

- Loss/drawdown and margin proximity scale linearly from full risk at the configured consumption threshold to zero at the limit.
- Aggregate/pending risk and every concentration gate cap risk to remaining percentage capacity.
- The per-trade ceiling caps requested risk.
- The leverage ceiling caps requested leverage independently.
- Prop safety-buffer proximity uses the remaining buffered drawdown capacity.
- A policy-permitted unknown reduction applies the explicit `stale_context_factor`.

Each reduction records original, reduced, exact transformation, rule/source and whether it binds. The result is `REDUCE` when risk percent or leverage is below the request. If authorized risk falls below minimum viable risk, the result is `REJECT`.

## Immutable output and boundary

`risk-decision/v1` retains the exact frozen `ApprovedStrategyPlan` by reference and shares its evaluation/correlation ID. An accepted/reduced envelope may authorize percent/amount, leverage ceiling, maximum notional/margin, provider/account and policy version. Quantity remains `null`: lot/step/contract precision belongs to capital allocation/execution planning.

The engine never modifies strategy identity, version, direction, entry, SL, targets, RR, confidence, evidence or invalidation. Runtime duration is excluded from the canonical decision (`null`) so identical inputs remain deeply equal. No Binance, Bybit or MT5 execution consumer has been migrated.

