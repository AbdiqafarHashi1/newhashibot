# Root Runtime Provider Operations and Forex Certification Audit

Date: 2026-07-30. Scope: active root runtime only. The `v2/` tree, archived migrations, deployment, scheduler state, cron state, and production runtime were excluded.

## Provider operations audit

All runtime values on these surfaces are reads from the existing canonical account, provider-control, monitor, execution-order, MT5 bridge, scanner-run, candidate, signal, protection, and command contracts. Page-local state is limited to view state (filters, dialogs, pending/error feedback); it is not provider truth.

| Page | Purpose | Keep | Merge | Remove duplication | Missing functionality / resolution |
|---|---|---|---|---|---|
| Binance | Testnet provider operations | Health, canonical account status, API/readiness evidence, testnet executor, positions/orders, protection, reconciliation/monitor, heartbeat, events, manual monitor/refresh/runtime proof | Canonical onboarding remains on Execution | No account or provider truth is copied to another store | Existing workspace already exposes the supported backend actions; live enable is not exposed |
| Bybit | Demo provider operations | Same lifecycle as Binance using Bybit V5 demo contracts | Canonical onboarding remains on Execution | Shared workspace removes divergent implementations | Existing workspace already exposes demo-specific monitor, symbol sync, test order and runtime proof actions |
| MT5 | Canonical Forex provider operations | Bridge/terminal/account/broker/server, market data, execution, heartbeat, reconciliation, protection, durable commands, adoption, certification proof and refresh | Prop and personal account views remain modes/tabs of MT5 operations | Prop Provider duplicate page and navigation entry removed; old URL redirects here | Gold remains data-enabled and execution-ineligible; no live enable surface added |
| Execution | Global account onboarding and operational designation | Credential validation, Vault-backed account creation, ownership assignment and canonical operational-account designation | Provider-specific runtime controls stay on provider pages | Does not maintain provider execution toggles or health copies | Deliberately remains orchestration/onboarding, not another provider dashboard |
| Prop Provider | Previously duplicated MT5 onboarding and execution toggles | Backward-compatible URL only | Consolidated into MT5 Operations | Page and navigation entry removed | Old route redirects to canonical MT5 surface |

### Provider control matrix

| Capability | Binance Testnet | Bybit Demo | MT5 Demo |
|---|---:|---:|---:|
| Provider/account/API or bridge health | Yes | Yes | Yes |
| Environment/readiness proof | Yes | Yes | Yes |
| Enable/disable non-live execution | Existing guarded backend action | Existing guarded backend action | Existing account/bridge backend action |
| Live enable control | **Never exposed** | **Never exposed** | **Never exposed** |
| Positions and pending orders | Yes | Yes | Yes |
| Protection and reconciliation | Yes | Yes | Yes |
| Heartbeat/events/receipts | Yes | Yes | Yes |
| Manual reconciliation/monitor and refresh | Yes | Yes | Yes |
| Scanner interaction/runtime proof | Scanner-run and signal lineage | Scanner-run and signal lineage | MT5 market-data and command lineage |

## Operational workflow

```text
Execution (validate credentials / create canonical account / designate operational)
  -> Provider page (read readiness -> enable guarded Demo/Testnet adoption)
  -> existing market-scanner, exactly one manual invocation
  -> MT5 broker candles for Forex | Binance candles for Crypto
  -> strategy registry and derived fetch plan
  -> immutable candidates (accepted and rejected evidence)
  -> shared arbitrator (winner or no-trade)
  -> immutable signal / approved plan
  -> existing provider router
  -> execution order -> native/fallback protection
  -> monitor/reconciliation -> events, receipts and runtime proof
```

The scanner is not copied into a provider page. Its existing run, candidate, signal, arbitration, routing, protection, and proof records provide the observable one-cycle trace. Scheduler and cron configuration are untouched.

## Forex strategy audit and classification

The audit covered active imports, scanner-local evaluators, the professional registry, canonical contracts, configuration migrations, research evaluators, and tests. Archived migrations and `v2/` were classified as historical rather than active implementations.

| Strategy | Exists | Registered | Evaluated | Executable | Certified | Status |
|---|---:|---:|---:|---:|---:|---|
| Forex Micro Scalper | Yes | Yes | Yes | Yes | Yes | Production |
| Forex Swing Continuation | Yes | Yes | Yes | Yes | Yes | Production |
| Forex London Breakout | Yes | Yes | Yes | Yes | Yes | Production (newly certified) |
| Forex New York Continuation | Yes | Yes | Yes | Yes | Yes | Production (newly certified) |
| Forex Trend Pullback | Yes | Yes | Yes | Yes | Yes | Production (newly certified) |
| Gold Volatility Breakout | Yes | Research registry only | Shadow evaluation | No | No | Research / shadow |
| Forex Provider Gate | Yes | Scanner diagnostic path | On provider failures | No | N/A | Diagnostic, not a strategy |
| Legacy `ForexMicroScalper`/`ForexSwingContinuation` names | Yes | Canonical-ID adapters | Through registry | Through approved plan only | Yes | Compatibility names, not duplicates |
| Archived base-schema strategy rows | Historical | No active registration | No | No | No | Legacy/archive |

### Newly certified strategy suite

The London breakout, New York continuation, and trend pullback retain their complete audited pipelines: closed MT5 candles, session and stale/malformed guards, EMA/RSI/ATR/structure filters, deterministic scoring, bounded entry zones, instrument-rounded stop/TP1/TP2, confidence/grade evidence, registry diagnostics, immutable strategy plans, and shared arbitration compatibility. Certification adapters change provenance to version `1.0.0` and production status without forking scanner logic.

The canonical contracts drive the scanner fetch plan (`15m`, `1h`) and evaluator registry completeness check. The database configuration uses the existing `strategy_configs` table and preserves operator values on conflict, updating only canonical symbol/timeframe eligibility. No separate strategy state was introduced.

## Regression and verification conclusions

- Provider routing is unchanged: MT5 remains the sole runtime Forex market-data route and the existing Binance/Bybit execution functions remain intact.
- Crypto strategy registration, candle fetching, arbitration, execution, protection, recovery, risk, capital, reporting and customer execution paths are unchanged.
- XAUUSD remains in the MT5 market-data universe while every production Forex contract excludes `metal_gold`; the gold evaluator remains research/shadow and cannot publish.
- The unified scanner still derives its Forex fetch plan from enabled canonical contracts and validates a one-to-one evaluator registry.
- No scheduler state, cron configuration, deployment artifact, secret, live runtime record, or production environment was mutated.
- Root architecture is preserved end-to-end: canonical contracts -> one registry -> one scanner -> shared arbitrator -> existing provider router -> shared execution/protection/reconciliation proof.
