# Phase 1D Existing Capital and Sizing Audit

## Scope

Static, active-root audit only. No SQL, provider calls, database changes, deployment, cron, execution, customer, Telegram or `v2/` activity occurred.

```text
immutable RiskDecision (ACCEPT / REDUCE)
                 ↓
capital-allocation-context/v1
  account truth + provider contract specification
                 ↓
authorized-scope account selection
                 ↓
Crypto or MT5 calculator + ordered allocation gates
                 ↓
immutable capital-allocation-plan/v1
                 ↓
Phase 1E execution planning (not connected)
```

## Existing decision locations

| Location | Current capital/sizing responsibility | Defaults/fallbacks and duplication |
|---|---|---|
| Binance testnet execution `buildPlan` and capital snapshot | Selects capital basis, risk amount, leverage, notional, quantity, exchange rules, TP split and margin fallback | Execution-owned, Binance-specific, database/settings-backed with several fallback settings. Must remain untouched until parity migration. |
| Binance monitor | Fetches exchange info, floors quantities to step, rounds trigger price to tick and falls back to generic step/tick/precision if exchange info fails | Duplicates rounding/rule lookup for protection quantities; fallback precision is unsuitable as certified allocation truth. |
| Scanner paper intent | `risk amount / stop distance` position size from risk profile equity | Paper-only, no provider contract, step, lot, notional or margin validation. |
| `src/lib/binanceTruthExecution.ts` | TP1/TP2 quantity split and step flooring | Protection/execution utility, not funding authorization. |
| MT5 bridge and agent symbol sync | Captures free margin, contract size, volume min/max/step, digits/point and broker symbol | Real broker metadata path exists, but sizing remains closer to the agent/order boundary. |
| MT5 agent | Normalizes volume to min/max/step and submits orders | Execution-owned; it may clamp invalid input, so certified allocation must reach it already valid without changing this defense. |
| ExchangeProviderMT5 / MT5 operations | Maps symbol specs, account balance/equity/margin/free margin and provider commands | Read/mapping seam, no unified immutable allocation artifact. Some UI helpers use zero when truth is absent. |
| Prop rules utility | Produces approved risk amount/“size” from balance, drawdown and budget | Mixes risk authorization with size; caller still must translate using provider contract. |
| Admin Capital page | Reads Binance execution settings, MT5 accounts, provider controls, trade truth and customer setups; builds provider cards | Binance and MT5 can show real rows; Bybit balance is explicitly unavailable. Customer summary aggregates configured targets and uses browser time. This page is monitoring, not certified allocation truth. |

## Duplicated or unsafe-to-generalize behavior

- Step/tick/precision flooring appears in Binance execution, monitor and shared UI/test utilities.
- Risk-to-quantity conversion exists in scanner paper intent and execution code without one contract provenance model.
- Capital basis, balance, wallet, margin balance and free-margin meanings differ by provider.
- Binance and Bybit contract rules and balances cannot be shared even for the same symbol.
- MT5 `volume` is lots, not Crypto base quantity; contract size/tick value/account-currency conversion are essential.
- Provider/agent fallbacks that are acceptable operational defenses are not acceptable as certified contract truth.
- UI aggregates and labels are not allocation authority and must not be fed back into execution.

## Phase 1D containment decision

The new engine is additive and pure. Existing execution-owned sizing remains unchanged. It requires caller-supplied fresh account truth and complete provider specification, rejects missing/invalid facts, preserves the exact frozen RiskDecision, and records that active adoption is pending Phase 1E.

