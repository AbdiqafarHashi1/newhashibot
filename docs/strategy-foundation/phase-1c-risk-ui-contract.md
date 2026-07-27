# Professional Risk Engine UI / Backend Contract

## Rule

The future Risk Engine page is a projection of persisted real `RiskDecision`, resolved policy and provider/account truth. It must never manufacture balances, PnL, health, freshness, exposure or decisions. Until persistence/read models exist, the current page remains unchanged and this document is the integration contract.

## Page composition

1. **GlobalRiskStatus** — system risk state, emergency lock, aggregate open/pending risk, daily/weekly loss use, drawdown, accounts at risk, ACCEPT/REDUCE/REJECT counts, and stale/unknown warnings.
2. **ProviderRiskGrid** — four non-merged card groups: Binance, Bybit, MT5 Personal and MT5 Prop.
3. **RiskDecisionStream** — timestamp, decision/decisive gate, strategy/symbol, provider/account, requested/authorized risk and leverage, policy version and correlation ID.
4. **EffectivePolicyDetail** — fingerprint, ordered sources, every effective value and provenance, unknown-handling rules, overrides, and hard-rule conflict resolution.
5. **PropPolicyDetail** — account/stage-specific firm metadata when supplied, loss/drawdown basis, floating treatment, reset/timezone, holding/news rules, safety buffer and unknown fields.
6. **ExposureAnalytics** — provider, symbol, asset, direction, base/quote, cross-provider correlation, Forex currencies/pairs and Gold.
7. **TruthQualityPanel** — snapshot timestamp/age/state per account and missing/stale facts.

## Provider/account card fields

Each card requires real account ID/mode/environment, balance, equity, available/used margin, utilization, open/pending risk, daily/weekly loss, drawdown/peak, leverage ceiling, positions/orders, provider health, policy version/fingerprint, truth age/state and lock/authorization states. A field without backend truth renders `UNKNOWN`, `STALE` or `UNAVAILABLE`, never zero.

## Backend read-model requirements

- Immutable risk-decision stream keyed by `decision_id` and correlation/evaluation ID.
- Latest real account-truth snapshots keyed by provider/account, including original provider timestamp.
- Effective-policy projection with per-field provenance and fingerprint.
- Consolidated cross-provider economic exposure snapshot with source account IDs and timestamps.
- Aggregated global state computed from those facts, not browser arithmetic over incomplete pages.
- Authorization and access controls that separate customer/account visibility.

No persistence or schema is created in Phase 1C. Phase 1D must propose storage separately and may not treat the current `Risk.tsx` local/database fallbacks as certified live truth.

