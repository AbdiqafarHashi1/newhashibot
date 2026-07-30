# Forex and Gold Strategy Authenticity Audit — 2026-07-30

## 1. Executive conclusion

The active root runtime contains **six genuine independent production strategies** behind one scanner, one evaluator/arbitration path and MT5 market-data/execution truth. No `v2/` code was used. This pass neither deployed nor changed cron, runtime mode, accounts, or production data. Gold's former research evaluator was classified **research prototype / partial**: it had a Gold symbol gate and breakout concept, but generic candidate construction, no event capability, weak acceptance/exhaustion controls and research provenance. It was replaced internally while retaining `gold.volatility-breakout` migration compatibility.

## 2. Six-strategy final classification

| Strategy | Final classification | Production identity |
|---|---|---|
| Forex Micro Scalper | Genuine independent production strategy | `forex.micro-scalper@1.0.0` |
| Forex Swing Continuation | Genuine independent production strategy | `forex.swing-continuation@1.0.0` |
| Forex London Breakout | Genuine independent production strategy | `forex.london-breakout@1.0.0` |
| Forex New York Continuation | Genuine independent production strategy | `forex.new-york-continuation@1.0.0` |
| Forex Trend Pullback | Genuine independent production strategy | `forex.trend-pullback@1.0.0` |
| Gold Volatility Breakout | Genuine independent production strategy; **Production-certified Gold strategy** | `gold.volatility-breakout@1.0.0` |

## 3. Evaluator identity matrix

| Strategy ID | Contract | Export/function | Source | Shared wrapper? | Unique core? |
|---|---|---|---|---|---|
| `forex.micro-scalper` | `forex-runtime-contracts.ts` | `evalForexMicroScalper` | `market-scanner/index.ts` | no | yes |
| `forex.swing-continuation` | same | `evalForexSwingContinuation` | `market-scanner/index.ts` | no | yes |
| `forex.london-breakout` | same | `ForexLondonBreakout.evaluate` | `forex-research-strategies.ts` | certification-only adapter | yes |
| `forex.new-york-continuation` | same | `ForexNewYorkContinuation.evaluate` | same | certification-only adapter | yes |
| `forex.trend-pullback` | same | `ForexTrendPullback.evaluate` | same | certification-only adapter | yes |
| `gold.volatility-breakout` | same | `evaluateGoldVolatilityBreakout` | `gold-volatility-breakout.ts` | no | yes |

Every contract declares symbols, instrument classes, primary/context timeframes, 55/64-candle minimums, version and lifecycle. The registry has no fallback and throws for missing, duplicate, invalid and uncontracted mappings. Certification provenance is `FOREX_AND_GOLD_STRATEGY_AUTHENTICITY_20260730`; Gold additionally emits evaluator identity and a deterministic FNV-1a evidence fingerprint.

## 4. Full evaluator call chains

* Micro Scalper → registry → `evalForexMicroScalper` → freshness/distance gates → short momentum/body/RSI → narrow pip plan.
* Swing Continuation → registry → `evalForexSwingContinuation` → EMA trend/slope → retracement/reclaim → structural continuation → wide ATR/pip plan.
* London Breakout → certified adapter → Asian UTC closed-candle range → London DST-aware eligibility → body/extension/range gates → structural breakout plan.
* New York Continuation → certified adapter → London impulse/session handoff → EMA trend direction → continuation and exhaustion → ATR plan.
* Trend Pullback → certified adapter → established EMA structure → controlled value retracement → momentum reclaim → swing/ATR stop.
* Gold → registry → `evaluateGoldVolatilityBreakout` → exact canonical MT5 XAUUSD metadata → 24-candle compression box → two-candle breakout acceptance → false-breakout/exhaustion/event gates → Gold-normalized bounded plan.

## 5. Methodology matrix

| Strategy | Hypothesis | Trigger | Regime | Session | Trend dependency | Type |
|---|---|---|---|---|---|---|
| Micro | fresh micro momentum persists briefly | body/momentum confirmation | liquid, low cost | intraday | light | scalp |
| Swing | HTF trend resumes after retracement | value touch and reclaim | directional | broad liquid | strong | swing continuation |
| London | Asian balance expands at London | close beyond Asian range | compression→expansion | London/overlap | none/secondary | session breakout |
| NY | London impulse persists through handoff | aligned NY confirmation | directional, not exhausted | NY/overlap | required | session continuation |
| Pullback | established trend offers value re-entry | controlled EMA pullback + momentum | directional | liquid | required | pullback continuation |
| Gold | controlled XAU compression transitions to accepted directional expansion | breakout candle plus closed follow-through | normalized valid volatility | London, NY, overlap | HTF alignment required | metal volatility breakout |

## 6. Indicator/filter matrix

| Strategy | TF | Indicators/structure | Session/volatility/spread | Unique gates |
|---|---|---|---|---|
| Micro | 15m | ATR, RSI, fast/slow EMA, body, momentum | freshness and tight pip distances | rapid momentum/distance invalidation |
| Swing | 1h | EMA20/50 slope/spread, RSI, ATR, pullback swing | normalized FX ATR and distance | touch, reclaim, structural continuation |
| London | 15m | Asian high/low, ATR, body | IANA London DST, provider spread | range completeness/quality and overextension |
| NY | 15m/1h | session impulse, EMA trend, ATR | IANA New York DST | direction conflict and move exhaustion |
| Pullback | 15m/1h | EMA trend, RSI, ATR, swing | liquid sessions | pullback depth, chase, swing-stop width |
| Gold | 15m + declared 1h context | ATR-normalized box, EMA20/50, body/wick, displacement, follow-through | IANA sessions, MT5 spread, Friday/weekend | exact symbol/source, compression, wick, acceptance, multi-ATR exhaustion, event capability |

## 7. Scoring matrix

| Strategy | Components/weights | Minimum | Grades | Distinct? |
|---|---|---:|---|---|
| Micro | momentum, RSI, EMA/body, spread/distance | config 72–78 | shared A+/A/B mapping | yes |
| Swing | trend .23, slope .11, pullback .21, momentum .15, volatility/distance/RR .10 each | 78 | shared | yes |
| London | hard range/body/extension evidence; certified score | 78 | shared | yes |
| NY | impulse, continuation, trend and exhaustion evidence | 78 | shared | yes |
| Pullback | trend, depth, momentum and stop quality | 78 | shared | yes |
| Gold | range .12, compression .12, expansion .17, acceptance .14, HTF .12, session .09, spread .07, RR .12, base .05, exhaustion penalty | 74 | A+≥88, A≥80, else B | yes |

Gold does not copy an FX weighting vector. Missing authoritative event data is explicitly reported; required-but-unavailable protection rejects, and supplied high-impact USD evidence blocks deterministically.

## 8. Entry/SL/TP matrix

| Strategy | Entry | Stop | TP1 / TP2 | Holding |
|---|---|---|---|---|
| Micro | narrow current-price pip band | micro swing/ATR + pip minimum | short R/pip projection | minutes–hours |
| Swing | value-reclaim band | pullback swing + 1.35 ATR/pip floor | 1.25R / 1.85R | hours–days |
| London | confirmed breakout close | range/1.35 ATR | 1.2R / 1.9R | London session |
| NY | continuation close | 1.3 ATR | 1.15R / 1.85R | NY session |
| Pullback | reclaim close | swing + .15 ATR, minimum 1.4 ATR | 1.2R / 2.1R | hours–day |
| Gold | bounded close ± min(.08 ATR,.04 range) | boundary/breakout swing + ATR buffer, min 1.15/max 2.6 ATR | range-bounded 1.25–1.6R / 2.05–2.8R | 4–16 × 15m bars |

Rounding comes from canonical instrument metadata. Evaluators emit risk distance but never lot size; broker tick value, contract size, lot step, stop level, margin and account conversion remain in shared risk/capital/MT5 planning.

## 9. Deterministic fixture decision matrix

Legend: `C(direction, score)`; `R(reason, score)`. Exact results are asserted by deterministic suites; methodology cells below state the expected distinguishing decision family.

| Fixture | Micro | Swing | London | NY | Pullback | Gold |
|---|---|---|---|---|---|---|
| London FX breakout | R(momentum/trend gate) | R(pullback) | C(direction,≥78) | R(session) | R(pullback) | R(gold_symbol_not_supported,0) |
| NY after London impulse | R(profile) | different/slow | R(session) | C(direction,≥78) | different | wrong symbol |
| FX trend pullback | R(profile) | different/HTF | R(no breakout) | R(session) | C(direction,≥78) | wrong symbol |
| FX scalp | C(direction,≥72) | R(timeframe/profile) | R(range) | R(session) | R(depth) | wrong symbol |
| FX swing | R(profile) | C(direction,≥78) | R(timeframe) | different | different | wrong symbol |
| choppy FX | R(momentum) | R(trend) | R(breakout) | R(structure) | R(trend) | wrong symbol |
| high-spread FX | R(distance/spread) | R(distance) | R(spread) | R(spread) | R(spread) | wrong symbol |
| stale FX | R(stale) | R(stale) | R(stale_candles) | same | same | wrong symbol |
| Gold BUY | R(instrument class) | R(instrument class) | R(instrument class) | R(instrument class) | R(instrument class) | C(buy, deterministic ≥74) |
| Gold SELL | same | same | same | same | same | C(sell, deterministic ≥74) |
| Gold false breakout | same | same | same | same | same | R(gold_false_breakout,0) |
| Gold exhaustion | same | same | same | same | same | R(gold_exhaustion_detected,0) |
| Gold compression/no break | same | same | same | same | same | R(gold_setup_not_present,0) |
| malformed/stale Gold | same | same | same | same | same | R(gold_malformed_candles/stale_candles,0) |
| EURUSD→Gold | normal methodology | normal | normal | normal | normal | R(gold_symbol_not_supported,0) |
| XAUUSD→FX | R(strategy_instrument_class_not_supported,0) | same | same | same | same | normal Gold methodology |

## 10. Registry safety findings

Contracts and mappings are one-to-one with no conditional alias or fallback. Generic validation rejects duplicate contract IDs, duplicate evaluator entries, missing mappings, uncontracted mappings and non-functions. Scanner lookup continues to throw `FOREX_EVALUATOR_NOT_REGISTERED` at its compatibility boundary. Instrument tests make semantic FX↔Gold misrouting fail before evaluation.

## 11. Strategy isolation findings

Evaluators use local constants/objects and return new evidence/plans. Gold freezes no caller object but never mutates it; tests snapshot shared candles, run repeatedly, and compare complete results. Registry entries are distinct function identities. No Gold parameter object is imported by FX code, no FX pip fallback is used by Gold, and evaluator ordering cannot affect pure results.

## 12. Session and DST findings

`Intl.DateTimeFormat` IANA zones (`Europe/London`, `America/New_York`) derive sessions and DST; UTC defines weekly close and candle timestamps. The differing UK/US transition weeks therefore resolve independently. Gold rejects weekends and Friday after 20:00 UTC (ahead of the canonical 22:00 close), uses only closed candles, and supports cross-midnight boxes by timestamps rather than broker hours. Broker server time and EAT are not used. Holiday input remains an injected authoritative capability.

## 13. Gold implementation audit

Previous state: **research prototype / partial**. It was symbol-limited and ATR aware but used the generic research `candidate()` function, one-candle breakout, static minimum stop, generic provenance, and lacked wick/follow-through/event/Friday controls. The production implementation is independent and the research row is skipped whenever a production mapping exists.

## 14. Gold production methodology

Setup is a six-hour, 24-closed-candle rolling compression box. Range width must be 0.8–5.5 ATR and mean candle range ≤1.05 ATR. The penultimate candle breaks; the last candle must accept beyond the boundary. Both BUY and SELL derive only from the boundary crossed. Wick dominance, weak body/displacement, close-back/follow-through failure, EMA conflict and >2.4 ATR value extension reject. Entry is bounded, stop is structural plus volatility/broker-point floor, and targets combine R with measured-range limits.

## 15. Gold risk and sizing findings

XAUUSD is `metal_gold`, point `.01`, pip `.1`, precision 2 and provider `MT5`. Plans are rounded accordingly and contain no volume. Shared broker metadata remains authoritative for live tick size/value, contract size, lot min/max/step, margin, stop levels and account conversion. This prevents FX pip sizing from being applied to Gold.

## 16. Gold execution/protection findings

No new execution path exists. Gold candidates become ordinary professional strategy plans, then shared arbitration/signal truth/risk/capital and the existing MT5 command lifecycle. Existing native SL/TP, fallback protection, idempotency, duplicate-symbol guard, reconciliation/orphan handling and runtime receipts remain unchanged. No provider command was sent.

## 17. Database/configuration findings

The earlier migration contains five enabled Forex rows. The new idempotent conflict-safe migration adds only canonical `GoldVolatilityBreakout`, exact XAUUSD/15m eligibility and provenance; it preserves operator-controlled enabled/risk/threshold values on conflict while merging immutable identity metadata. A legacy research-name row is disabled. No migration was executed.

## 18. Regression results

The required npm suites, dedicated Gold/independence suites, edge static checks, build and typecheck are recorded in the change summary/PR. Tests are deterministic, offline, fixed-time and do not mutate a database.

## 19. Remaining blockers

No repository implementation blocker remains. Before operational activation, operators must apply the reviewed migration, supply synchronized MT5 symbol specifications, and attach an authoritative USD event source if event protection is mandatory. This work deliberately does not certify broker connectivity, holidays, credentials, or live execution.

## 20. Final production-readiness conclusion

Repository classification is **six genuine independent production strategies**, including a **Production-certified Gold strategy**. Gold is eligible only via its canonical contract, reaches the same arbitrator and downstream MT5 lifecycle, and cannot bypass registry, risk, capital, protection or reconciliation. Operational deployment/runtime enablement remains a separate, explicit, safety-reviewed action.
