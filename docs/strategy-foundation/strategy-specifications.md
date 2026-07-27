# Professional Strategy Specifications

## Reading these specifications

“Entry/exit/risk philosophy” describes the intent inferred from current logic; it is not a recommendation or a behavior change. Live defaults are fallback values and database configuration can override them. Shared downstream sizing, leverage, partial exits, break-even, trailing, execution, and reporting are not owned by an evaluator unless explicitly stated.

## 1. MicroScalper

**Identity:** `crypto.micro-scalper`, version `1.0.0`, legacy name `MicroScalper`. Crypto; enabled/configurable/live-publishable. All upstream-approved crypto symbols; 5m and 15m.

- **Purpose / regime:** capture short-lived directional momentum in a liquid, non-choppy intraday trend. Momentum/expansion with trend continuation; neither pure breakout nor mean reversion.
- **Edge hypothesis:** aligned EMA structure, directional RSI/momentum, real candle body and multi-candle pressure may identify continuation before the impulse decays. A 5m candidate requires 15m trend confirmation.
- **Entry philosophy:** EMA20/EMA50 and price location establish trend; RSI and calculated momentum confirm; candle body, directional pressure, ATR-percent band and chop/extension checks qualify impulse quality. Entry is a narrow band around latest close. Liquidity is assumed from the upstream crypto universe rather than measured inside the evaluator.
- **Exit philosophy:** invalidate at an ATR-derived stop; realize first and second reward objectives; abandon stale setups after a configured bar budget. Intended to be brief, not converted into a swing trade.
- **Risk philosophy (current):** fallback SL 1.4 ATR, TP1 1.2R and TP2 1.8R on the calibrated runtime surface, minimum RR 1.2, maximum 24 bars. Position sizing and leverage are downstream. The strategy has no own partial/BE/trailing rules; execution currently supplies shared protection/management semantics.
- **Inputs / indicators:** OHLCV (55+), timeframe, shared indicators, optional 15m candles for 5m, config: score/RR, ATR bounds, body threshold, EMA/RSI thresholds, momentum lookback, ATR stop/targets, extension and holding limits.
- **Outputs:** candidate/rejection, buy/sell, entry band, SL/TP1/TP2, RR, confidence/grade, gate and score evidence, expiry through registry.
- **Dependencies:** Binance market data, indicator calculation, professional registry, strategy configuration, distance guards, market-context classifier, arbitrator; downstream risk, planner, execution, protection, management, reporting.
- **Failure modes:** insufficient/invalid data; unavailable or opposing 15m trend; low/excessive ATR; range chop; weak/small or opposing candle; weak pressure/RSI/momentum; late overextension/chasing; poor RR; illiquid/spread-stressed conditions not detected locally; event gaps.

## 2. QuickScalp

**Identity:** `crypto.quick-scalp`, `1.0.0`, legacy `QuickScalp`. Crypto; enabled/configurable/live-publishable; dynamic crypto universe; 5m/15m.

- **Purpose / regime:** a faster, selective short-horizon scalp for strong immediate momentum and expansion.
- **Edge hypothesis:** unusually decisive candle expansion with EMA/RSI alignment may persist long enough to capture compact targets before mean reversion.
- **Entry philosophy:** direction follows EMA20/50, RSI and recent momentum; requires healthy ATR, meaningful body/expansion and directional close. Entry hugs the current close. Upstream universe substitutes for an explicit order-book liquidity gate.
- **Exit philosophy:** tight ATR invalidation and two compact R targets, with a short setup/holding lifetime.
- **Risk philosophy (current):** configured minimum score defaults 82, minimum RR 1.15, maximum 12 bars; evaluator defaults include ATR-based stop and targets. Sizing/leverage/partials/BE/trailing are downstream, not strategy-specific.
- **Inputs / indicators:** 55+ OHLCV candles, EMA20/50, ATR14 and ATR%, RSI14, body and momentum, plus score, RR, stop/target, body, ATR and max-bar parameters.
- **Outputs / dependencies:** standard candidate/rejection plan and diagnostics; Binance candles → indicators → registry → qualification/distance guard → arbitration → downstream lifecycle.
- **Failure modes:** chop, weak body or momentum, insufficient volatility, volatility spike, countertrend RSI/EMA, exhausted impulse, too-tight distances/RR, latency/slippage or low liquidity overwhelming a small edge, event-driven candles.

## 3. CompressionBreakout

**Identity:** `crypto.compression-breakout`, `1.0.0`, legacy `CompressionBreakout`. Crypto; enabled/configurable/live-publishable; dynamic universe; evaluator supports 15m/1h.

- **Purpose / regime:** trade transition from compression/range into confirmed volatility expansion.
- **Edge hypothesis:** clustered price containment can accumulate imbalance; a fresh close beyond the box with range/ATR expansion and momentum is more likely to continue than an unqualified range touch.
- **Entry philosophy:** construct a recent box, measure inside-bar ratio and range in ATR units, then require breakout/early breakout/retest-hold evidence. ATR expansion, candle body, momentum/RSI and EMA alignment support direction; late-breakout exhaustion is penalized. Liquidity remains upstream.
- **Exit philosophy:** structure/ATR invalidation beyond the opposite box area, then staged R objectives before the breakout edge becomes stale.
- **Risk philosophy (current):** configurable stop ATR multiplier and TP R multiples, minimum score/RR, fallback maximum 48 bars. Targets use realized risk distance under current crypto tuning. Sizing/leverage and management actions are downstream.
- **Inputs / indicators:** OHLCV; box lookback/minimum inside bars/tolerance/max ATR range; breakout buffer and maximum late extension; expansion lookback/minimum; EMA/RSI/momentum; ATR bounds; stop/targets/RR/score/max bars.
- **Outputs / dependencies:** standard plan plus compression, box, breakout, expansion, freshness, momentum and distance evidence. Depends on Binance candles, indicators, registry, distance guard, arbitrator, and downstream engines.
- **Failure modes:** loose/no compression; false wick breakout; weak expansion; breakout too late/extended; opposing momentum; extreme/near-zero ATR; illiquid gap; insufficient candles; box distorted by outlier; breakout directly into higher-timeframe resistance (not modeled); news spike.

## 4. SwingContinuation

**Identity:** `crypto.swing-continuation`, `1.0.0`, legacy `SwingContinuation`. Crypto; enabled/configurable/live-publishable; dynamic universe; 15m/1h.

- **Purpose / regime:** join an established trend after a controlled pullback and reclaim.
- **Edge hypothesis:** trends exhibit serial continuation; retracement toward a fast mean with maintained slow-trend structure offers better asymmetry than chasing the impulse.
- **Entry philosophy:** EMA20/50 spread and fast-EMA slope establish trend, recent swing tests define pullback, and directional close/reclaim plus RSI/body momentum confirms resumption. Chop and poor reclaim quality are rejected.
- **Exit philosophy:** invalidate beyond pullback structure with an ATR buffer; take staged continuation targets; expire if continuation does not mature within the swing horizon.
- **Risk philosophy (current):** defaults include 1.2 ATR stop floor, TP1 1.2R, TP2 2.2R, minimum RR 1.5, maximum 96 bars. No evaluator-owned sizing, leverage, partial, BE or trailing policy.
- **Inputs / indicators:** 60+ OHLCV (effective minimum depends on EMA/ATR/RSI/pullback lengths); EMA fast/slow and slope, RSI, ATR%, momentum, pullback bars, reclaim/body, score/RR/stop/targets/max bars.
- **Outputs / dependencies:** standard plan plus trend, slope, pullback/reclaim, chop, momentum and volatility evidence. Same shared crypto dependencies.
- **Failure modes:** flat/weak EMA structure; deep trend break disguised as pullback; no reclaim; ranging/choppy continuation; low or extreme ATR; opposing momentum; overextended entry; structural stop too wide; regime reversal/news shock; higher-timeframe opposition not explicit.

## 5. CryptoTrendPullback

**Identity:** `crypto.trend-pullback`, `0.1.0-research`, legacy `CryptoTrendPullback`. Crypto; research/shadow/non-publishable; all scanner crypto symbols; 15m/1h.

- **Purpose / regime:** simple research baseline for controlled pullbacks inside EMA-defined trends.
- **Edge hypothesis:** price near EMA20 while EMA20/50 and mid-range RSI remain aligned may resume the dominant direction.
- **Entry philosophy:** trend via EMA20/50; price must lie in an asymmetric ATR zone around EMA20; RSI must avoid both weakness and exhaustion. It has no independent liquidity, volume, structure-reclaim, or news gate.
- **Exit / risk philosophy:** fixed research construction: 1.65 ATR stop, TP1 1R, TP2 1.75R, confidence 80, eight-bar expiry. Sizing, leverage and active management are intentionally absent.
- **Inputs/outputs/dependencies:** 55+ fresh valid OHLCV, EMA20/50, ATR14, RSI14; returns standard shadow research result through registry.
- **Failure modes:** stale/malformed data; flat/crossing EMA; deep pullback or trend reversal; RSI outside band; chop around EMA; high volatility/news; low liquidity; no candle/reclaim confirmation.

## 6. ReversalExhaustion

**Identity:** `crypto.reversal-exhaustion`, `0.1.0-research`, legacy `ReversalExhaustion`. Crypto; research/shadow; all scanner crypto symbols; 15m/1h.

- **Purpose / regime:** research mean-reversion after local directional exhaustion.
- **Edge hypothesis:** extreme RSI at an ATR-proximate recent boundary can signal short-term overshoot and reversion.
- **Entry philosophy:** buy at RSI ≤32 near recent low; sell at RSI ≥68 near recent high. No trend, divergence, volume, reversal-candle, liquidity or news confirmation exists yet.
- **Exit / risk philosophy:** 1.4 ATR stop, TP1 1R, TP2 1.8R, confidence 79 and eight-bar expiry. No strategy-owned management.
- **Inputs/outputs/dependencies:** 55+ fresh valid OHLCV, recent high/low, ATR14 and RSI14; normalized shadow result.
- **Failure modes:** strong trend (“catching a falling knife”); repeated boundary walk; event gap; extreme ATR; thin market; RSI persistence; recent extrema polluted by outliers; no actual reversal structure.

## 7. ForexMicroScalper

**Identity:** `forex.micro-scalper`, `1.0.0`, legacy `ForexMicroScalper`. Forex; enabled/configurable/live-publishable. Fallback symbols are the ten canonical Forex/Gold instruments. Scanner defaults 15m/1h while evaluator accepts 5m/15m; therefore effective fallback coverage is 15m only.

- **Purpose / regime:** short intraday continuation using pip-aware distances and structure.
- **Edge hypothesis:** EMA-aligned microstructure, recent high/low pressure, directional candle quality and sufficient ATR/pip distance may persist after costs.
- **Entry philosophy:** select direction from EMA, price, momentum, RSI and recent boundary context; require structure or micro-breakout alignment, body/wick quality, healthy ATR and minimum pip distances. Entry band is capped in pips.
- **Exit philosophy:** stop beyond recent structure or an ATR/minimum-pip floor; staged R targets; do not let a scalp age into a swing.
- **Risk philosophy (current):** evaluator defaults stop at least 1.25 ATR and 6–7 pips, TP1 1.15R/minimum pips, TP2 1.7R/minimum pips; minimum RR effectively configuration-driven (fallback loader 1.4); fallback max 48 bars. Shared execution owns sizing/leverage/management.
- **Inputs / indicators:** 55+ OHLCV, normalized symbol/pip precision, EMA20/50, ATR14/ATR%, RSI14, momentum, recent structure/body/wicks; distance, entry-band, score/RR and holding parameters.
- **Outputs / dependencies:** standard plan plus pair type, session label and pip distances. Twelve Data adapter, Forex helpers, indicator engine, registry, distance/arbitration and downstream MT5 lifecycle.
- **Failure modes:** spread/commission exceeding edge (live evaluator has no authoritative spread input); inactive session/weekend; news; rollover; weak structure; spike-only candle; low/excess ATR; insufficient pip distances; symbol suffix/precision error; the 5m/1h configuration mismatch.

## 8. ForexSwingContinuation

**Identity:** `forex.swing-continuation`, `1.0.0`, legacy `ForexSwingContinuation`. Forex; enabled/configurable/live-publishable; fallback ten-instrument allowlist; 15m/1h.

- **Purpose / regime:** enter established FX directional structure after a controlled retracement and reclaim.
- **Edge hypothesis:** liquid-session FX trends often resume after price revisits EMA/structure, provided pip volatility, slope, momentum and risk distance remain viable.
- **Entry philosophy:** EMA alignment/spread/slope define trend; recent swing and fast-EMA zone define pullback; directional candle, reclaim, RSI and momentum qualify continuation. Pip-aware entry and stop floors protect against unrealistically tight plans.
- **Exit philosophy:** structural/ATR invalidation and staged R objectives within configured holding bars.
- **Risk philosophy (current):** evaluator stop multiplier floor 1.35 ATR, TP1 1.25R, TP2 1.85R, evaluator minimum RR 1.45 (loader fallback 1.4), fallback max 48 bars. No local sizing/leverage/partials/BE/trailing.
- **Inputs / indicators:** OHLCV, symbol precision/pips, EMA fast/slow and prior slope, ATR/pips/percent, RSI, momentum, pullback window/reclaim, score/RR/distance/max bars.
- **Outputs / dependencies:** standard result plus Forex/session/pip diagnostics; same active Forex dependency chain.
- **Failure modes:** range/chop, false reclaim, structural break, weak slope, low/excess volatility, wide spread/rollover, session/news shock, correlated USD exposure (portfolio concern), stale/provider data, overly wide structural stop.

## 9. London Breakout

**Identity:** `forex.london-breakout`, `0.1.0-research`. Forex majors; research/shadow; EURUSD/GBPUSD/USDJPY/AUDUSD/USDCAD; 15m; London or London–New York overlap.

- **Purpose / regime:** capture London-session expansion beyond the preceding Asian range.
- **Edge hypothesis:** liquidity arrival at London can resolve overnight inventory and extend a confirmed break of the Asian range.
- **Entry philosophy:** use closed candles before 08:00 UTC to form the range; require close beyond it, body ≥0.45 ATR, extension ≤0.9 ATR and sane range size. Shared preflight requires fresh/malformed checks, eligible session, spread and provider budget.
- **Exit / risk philosophy:** stop is max(1.35 ATR, 25% of range); TP1 1.2R, TP2 1.9R; fixed confidence 82; eight-bar registry expiry. No local position management.
- **Dependencies/outputs:** Forex domain/session/DST, canonical majors, provider candles/cost/spread metadata, ATR; normalized shadow plan.
- **Failure modes:** incomplete/abnormally broad Asian range; false breakout; London holiday; DST/time-boundary assumptions; overextension; high-impact open news; wide spread/slippage; prior-range calculation spanning unwanted days; opposing higher-timeframe trend.

## 10. New York Continuation

**Identity:** `forex.new-york-continuation`, `0.1.0-research`. Forex majors; shadow; same five symbols; 15m/1h; New York or overlap.

- **Purpose / regime:** join continuation of an established London/overlap move into New York liquidity.
- **Edge hypothesis:** a directional session move supported by EMA trend and a confirming closed candle may persist, unless already exhausted.
- **Entry philosophy:** non-flat EMA-derived trend, recent session move in same direction between 0.25 and 3.2 ATR, directional candle beyond EMA20; common data/session/spread/provider gates.
- **Exit / risk philosophy:** 1.3 ATR stop, TP1 1.15R, TP2 1.85R, confidence 80, eight-bar expiry; no own management.
- **Dependencies/outputs:** Forex context/session engine, EMA20/50 trend, ATR, last 12 closed candles; shadow plan.
- **Failure modes:** New York reversal rather than continuation; move already exhausted; macro release; flat/conflicting structure; wide spread; bad session attribution; recent slice crossing sessions; higher-timeframe opposition.

## 11. Forex Trend Pullback

**Identity:** `forex.trend-pullback`, `0.1.0-research`. Forex majors; shadow; five symbols; 15m/1h; London, New York or overlap.

- **Purpose / regime:** higher-quality liquid-session trend re-entry after a controlled pullback.
- **Edge hypothesis:** EMA trend plus price within 0.8 ATR of EMA20 and renewed candle/RSI momentum offers asymmetric continuation from nearby structural invalidation.
- **Entry philosophy:** reject flat or extended context; require directional candle and RSI ≥45 for buys or ≤55 for sells; use recent 12-bar swing for invalidation sizing; common preflight gates.
- **Exit / risk philosophy:** stop max(1.4 ATR, swing distance +0.15 ATR), rejected above 4 ATR; TP1 1.2R, TP2 2.1R; confidence 84; eight-bar expiry.
- **Dependencies/outputs:** Forex context, liquid sessions, spread/provider, EMA20/50, ATR, RSI, swing structure; shadow plan.
- **Failure modes:** trend transition, deep pullback, false momentum candle, stop too wide, event reversal, rollover/spread, correlated exposure, simplistic trend state, swing outlier.

## 12. Gold Volatility Breakout

**Identity:** `gold.volatility-breakout`, `0.1.0-research`. Gold/metal CFD; shadow; XAUUSD; 15m; London, New York or overlap.

- **Purpose / regime:** capture gold expansion from a relatively contained 30-bar range during liquid sessions.
- **Edge hypothesis:** gold-specific volatility clustering can produce continuation when a large body closes outside compressed recent structure without excessive extension.
- **Entry philosophy:** require normal/high but not abnormal ATR state, close beyond prior 30-bar high/low, body ≥0.7 ATR, extension ≤1.8 ATR and average prior range ≤1.4 ATR. Common spread/provider/session/data gates apply.
- **Exit / risk philosophy:** stop max(1.8 ATR, 2.5 price units), TP1 1.2R, TP2 2.2R, confidence 86, eight-bar expiry. Downstream sizing must recognize metals risk, but this is not encoded in the strategy plan.
- **Dependencies/outputs:** Forex domain precision/session/spread/provider metadata, XAUUSD candles, ATR and volatility context; normalized shadow result.
- **Failure modes:** scheduled macro shock, abnormal gold volatility, false break/liquidity sweep, overextension, spread explosion, broker symbol/contract mismatch, range spanning regime shift, static 2.5 floor inappropriate to price regime, weekend/holiday feed anomalies.

## Shared lifecycle statement for all 12

Each specification proposes the **Candidate** and contributes evidence to **Qualification**. Live definitions may proceed through **Arbitration**; research definitions terminate as recorded shadow observations. No evaluator should own **Sizing, Execution Plan, Execution, Protection, Management, Reporting, or Archive**, but each must supply enough immutable intent and provenance for those stages to honor and audit the strategy. The expected end-to-end stages and invariants are defined in [Lifecycle and Future Unified Contract](lifecycle-and-contract.md).
