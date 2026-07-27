# Phase 1C Existing-Risk-System Audit

## Scope and architecture map

This static audit covers active-root scanner, shared libraries, Binance testnet execution, MT5 bridge, prop-rule utilities, types, and administrator risk/prop/provider pages. It did not query or mutate database data, execute SQL, call providers, deploy, or inspect `v2/`.

```text
ApprovedStrategyPlan
        ↓
RiskEvaluationContext (new additive seam)
        ↓
resolved RiskPolicy + optional account PropRiskPolicy
        ↓
ordered deterministic gates
        ↓
ACCEPT / REDUCE / REJECT
        ↓
immutable RiskDecision
```

## Existing active-root risk ownership

| Location | Existing responsibility | Truth source / defaults | Finding |
|---|---|---|---|
| `market-scanner` `runRiskCheck` | Daily lock, total drawdown, open positions, daily trades, consecutive losses and cooldown | Database `risk_profiles`; permissive zero-value fallback; signal mode bypass | Scanner-owned pre-signal guard, not account/provider authorization. Uses process time for cooldown. |
| `market-scanner` strategy risk guidance | Strategy/mode risk %, A+ adjustments, leverage ranges/caps, wide-stop and low-RR reductions | Hardcoded `STRATEGY_RISK_RULES`, config risk mode and strategy output | Guidance is strategy/mode-centric, not based on live account/portfolio truth. It deliberately does not execute. |
| `market-scanner` paper intent | Risk amount and simple size from equity fallback and stop distance | Risk profile `equity_start` and risk % | Paper-only sizing; not venue-aware and outside the new authorization seam. |
| Binance testnet execution | Capital basis, risk amount, leverage, quantity, max positions/open risk, symbol duplicate, governor/daily/unrealized locks, margin fallbacks | Execution settings, exchange/account truth, hardcoded fallback settings | Strongest Crypto risk enforcement, but execution-owned and Binance-specific. It must not be silently generalized to Bybit. |
| Bybit demo/execution paths | Provider/account validation and venue sizing/execution concerns | Bybit-specific account/API truth | No unified risk-policy contract; Binance balances/health cannot be reused. |
| MT5 bridge | Snapshot sync plus profile daily-loss/drawdown breach lock | `mt5_account_profiles`, snapshot balance/equity; defaults of 5% when fields absent | Bridge-owned post/sync enforcement; daily loss is approximated from current balance minus equity rather than a certified daily reset ledger. |
| `src/lib/prop/propRulesEngine.ts` | Advisory/blocking prop rules, drawdown, daily loss, leverage, positions, news/weekend, deterministic size reduction | Caller-supplied `PropAccountRules` | Useful pure logic but mixes authorization and sizing, uses one generic shape, and does not model unknown rules or policy provenance. |
| `professionalTradeManager` | Weekly-loss lock and management policies | Caller state/policy | Management-owned control, not a provider-aware pre-execution authorization result. |
| Admin `Risk.tsx` | Reads `risk_profiles` and scanner config; displays profiles and fallback labels | Database reads; UI fallbacks such as 1%, $500, 5%, 3 positions, 20x | Current page is a configuration viewer, not live RiskDecision/account-truth UI. Its “save” only updates `updated_at`; fields are not a validated backend policy contract. |
| Prop/provider admin pages | Local forms and account/profile views for drawdown, leverage, daily loss and governor state | Database responses plus numerous component defaults | UI contracts are fragmented; some defaults can look authoritative without proving backend enforcement. |

## Controls found and gaps

- **Risk per trade:** scanner guidance, risk profiles, prop utility and Binance execution each express it differently.
- **Leverage:** strategy guidance, account leverage, prop caps and execution settings are duplicated. Bybit and Binance must remain independent.
- **Daily loss:** scanner state, Binance governor, MT5 bridge and prop utility use different bases and reset semantics.
- **Weekly loss:** present in a trade-management utility but not uniformly enforced before provider authorization.
- **Drawdown:** total, unrealized, static and trailing concepts exist in separate components without one versioned calculation basis.
- **Concurrent/open risk:** scanner position count, Binance execution open-risk checks and prop position caps are separate.
- **Concentration/correlation:** scanner/profile flags and Binance duplicate-symbol checks exist, but there is no canonical cross-provider BTC or Forex-currency exposure ledger.
- **Provider health/freshness:** provider pages show health, yet current generic risk configuration does not fail safely on missing truth.
- **Customer/account overrides:** database-backed modes/accounts exist, but precedence and whether an override may weaken safety are not formalized.
- **Unused/UI-only values:** several page-level fallbacks and editable controls cannot be proven to map to an active backend authorization rule.

## Failure behavior before Phase 1C seam

Behavior is path-specific. The scanner can fall back to zero/permissive profiles; Binance has execution-local guards; MT5 can lock after snapshot evaluation; UI may show defaults; and the prop utility trusts complete caller inputs. There was no universal rule that stale/missing balance, equity, positions, pending risk or provider health rejects authorization. The new seam therefore fails safe on required account truth while remaining additive—no current consumer is switched.

## Duplication map and recommended containment

Do not broadly refactor these paths in Phase 1C. Treat them as behavior baselines. The professional engine centralizes only the new contract, policy resolution, ordered gates and append-only decision. Phase 1D should map current settings into explicit policy layers and migrate one consumer at a time under exact parity; legacy execution guards remain defense-in-depth until separately certified.

