# HashiBot Recovery Phase 2 — Forex Foundation and Research Strategies

## Status and safety boundary

Implemented directly in the active root scanner and Phase 1 professional strategy framework. This phase preserves the existing Twelve Data fetch, budget/throttle controls, Forex feature flags, `ForexMicroScalper`, `ForexSwingContinuation`, candidate writer, arbitrator, signal truth, Telegram routing and Admin diagnostics. It adds no provider fetch, database contract, migration, cron, application, signal writer or publication path.

No deployment or SQL was executed. Binance, Bybit, MT5, customer access, subscriptions, Telegram routing, persistence, reporting UI and arbitrator code were not changed.

## V2 references translated

The following abandoned files were used only as design/formula references:

- `v2/packages/forex/index.ts`
- `v2/services/signal-mode/index.ts`
- `v2/strategies/forex/index.ts`
- `v2/strategies/forex/london-breakout/index.ts` and `README.md`
- `v2/strategies/forex/new-york-continuation/index.ts` and `README.md`
- `v2/strategies/forex/trend-pullback/index.ts` and `README.md`
- `v2/strategies/forex/swing-continuation/index.ts` and `README.md`
- relevant session and Gold implementations in `v2/strategies/index.ts`
- `v2/tests/signal-mode/forex-signal-mode.test.ts`
- `v2/tests/strategies/strategies.test.ts`

There are no runtime imports from `v2/`. Incorrect V2 identities were not copied: the root IDs explicitly distinguish `forex.*` from `gold.*`, and the existing root `ForexSwingContinuation` remains `forex.swing-continuation` rather than inheriting V2's inconsistent shared identity.

## Root files changed

- `supabase/functions/_shared/forex-domain.ts` — root instrument, session, freshness, spread/cost and market-context contracts.
- `supabase/functions/_shared/forex-research-strategies.ts` — four translated research strategies.
- `supabase/functions/_shared/professional-strategies.ts` — expanded per-run diagnostics.
- `supabase/functions/market-scanner/index.ts` — registers the research strategies in the existing Phase 1 registry for already-fetched Forex contexts.
- `tests/strategies/forexRecoveryPhase2.test.ts` — focused domain, strategy, lifecycle and scanner-regression tests.
- `package.json` — `npm run test:forex-recovery`.
- this document.

## Instrument model

The canonical universe is `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, and `XAUUSD`. Each root-owned specification contains provider/display symbols, asset class, base/quote currency, pip and point sizes, price precision, session timezone, supported timeframes and current production activation status.

Only `EURUSD`, `GBPUSD`, and `USDJPY` are marked production-enabled, matching the existing root scanner. The additional instruments exist for deterministic research contracts only; this phase does not add them to `C2_FOREX_SYMBOLS`, the root symbol table, or the provider budget.

Gold is explicit: `XAUUSD` uses the `gold` asset class, two-decimal price precision, `0.1` pip size, `0.01` point size, Gold-specific volatility thresholds and wider stop rules.

## Session and market-context model

Sessions use IANA timezones through `Intl.DateTimeFormat`: London is 08:00–16:00 `Europe/London`, New York is 08:00–17:00 `America/New_York`, overlap is calculated from both clocks, Asia is the pre-08:00 UTC weekday window, and weekends are closed. This makes summer/winter DST boundaries deterministic without a parallel market-data service.

The context builder consumes the root candles and Phase 1 indicator snapshot. It filters out candles that were not closed at evaluation time, normalizes and orders OHLCV, identifies the current/previous closed candles, rejects malformed/stale series, and exposes ATR, EMA20/50, strategy-only EMA200, RSI, volatility/trend/pullback state, breakout range, session metadata, spread eligibility, provider-cost eligibility and deterministic evidence. It does not change indicator values used by the two live Forex evaluators.

## Preserved live strategies

`ForexMicroScalper` (`forex.micro-scalper`, `1.0.0`) and `ForexSwingContinuation` (`forex.swing-continuation`, `1.0.0`) still call the unchanged in-scanner functions with the same `strategy_configs`, parameters and legacy results. Their evaluator-body SHA-256 baselines remain part of `npm run test:strategies`, and they remain the only publishable Forex definitions.

## New research strategies

| Strategy | Professional ID | Version | Symbols | Timeframes | State | Publication |
|---|---|---:|---|---|---|---|
| ForexLondonBreakout | `forex.london-breakout` | `0.1.0-research` | approved Forex set | `15m` | disabled + `RESEARCH` + `SHADOW` | false |
| ForexNewYorkContinuation | `forex.new-york-continuation` | `0.1.0-research` | approved Forex set | `15m`, `1h` | disabled + `RESEARCH` + `SHADOW` | false |
| ForexTrendPullback | `forex.trend-pullback` | `0.1.0-research` | approved Forex set | `15m`, `1h` | disabled + `RESEARCH` + `SHADOW` | false |
| GoldVolatilityBreakout | `gold.volatility-breakout` | `0.1.0-research` | `XAUUSD` only | `15m` | disabled + `RESEARCH` + `SHADOW` | false |

London Breakout uses completed pre-London/Asian closed candles, body-close confirmation, extension, range, ATR and RR gates. New York Continuation requires prior trend/session movement, rejects directional conflict/exhaustion, and uses ATR protection. Trend Pullback requires established trend, controlled EMA pullback, candle/RSI resumption and swing/ATR stops. Gold Volatility Breakout requires XAUUSD, normal/high-but-not-abnormal Gold volatility, prior compression, confirmed expansion, extension control and Gold-specific stops/rounding.

No strategy is claimed profitable or production-certified.

## Publication proof

All four definitions use `enabled: false`, lifecycle `RESEARCH`, publication mode `SHADOW`, and certification `RESEARCH`. `ProfessionalStrategyRegistry` evaluates research definitions but returns `publishable: false`. The scanner checks `if (!evaluation.publishable) continue` before the only `allEvals.push`. Consequently research results cannot create `strategy_candidates`, rejected setups, paper intents, signals, Telegram messages, or execution activity, and cannot reach the arbitrator.

Gold cannot currently evaluate in scanner runs because XAUUSD is outside the existing production Forex scan universe. AUDUSD and USDCAD similarly remain inactive unless an already-authorized future root universe change supplies their contexts.

## Diagnostics

Existing response-only `professional_strategy_diagnostics` now includes all eligible Forex research definitions. Per strategy it tracks evaluations, eligible evaluations, BUY/SELL/NO_TRADE counts, candidate-like research results, rejection reasons, runtime failures, session/stale/malformed exclusions, last evaluation/result/publication times, and symbol/timeframe coverage. It remains in memory for one scan response; no database column or UI was added.

## Test coverage

`npm run test:forex-recovery` covers deterministic normalization, pip/precision and XAUUSD rules, production activation flags, London/New York sessions, summer/winter DST and weekends, normalized closed-candle context, BUY/SELL/NO_TRADE for all four strategies, stops/targets/RR, malformed/stale rejection, deterministic repetition, no-lookahead filtering, symbol/timeframe filters, unique IDs, disabled research publication blocking, and scanner-source proof that research definitions cannot enter publishable `allEvals`.

`npm run test:strategies` continues to cover the unchanged live Forex and crypto strategy baselines and professional compatibility adapter.

## Known limitations and readiness

- Research strategies have synthetic deterministic unit coverage, not historical replay, provider-credit observation, forward paper evidence or production certification.
- Spread metadata is supported, but the existing root candle scan does not supply a bid/ask spread to the strategy context; absence is represented as unavailable and does not independently block shadow calculation.
- The London range currently uses the UTC Asian window from already-closed candles. Holiday calendars and broker-specific session rolls are not yet modeled.
- The professional diagnostics remain per-run response data and are not durable.
- Repository-wide typecheck and the combined execution suite have pre-existing failures outside these modules; these are reported rather than concealed.

The Forex foundation and four strategies are ready for root shadow/research evaluation only. They are not ready to be enabled or published. The next recovery phase should add replay/paper certification and observed provider/spread fixtures without changing the production gates until explicit approval.
