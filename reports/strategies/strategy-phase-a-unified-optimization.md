# Hashibot Strategy Phase A — Unified Strategy + Arbitration Optimization

Date: 2026-06-09

## 1. What each strategy revealed

### MicroScalper
- Code audit shows the evaluator already records key funnel diagnostics: raw evaluator status, score gate, RR gate, distance guard, arbitration, duplicate guard, signal insert, max bars, trend/rsi/momentum/body/volatility/RR scores, chase risk, and price extension.
- The prior known bottleneck was not a missing evaluator branch anymore: MicroScalper already has an explicit identity-fit branch in arbitration.
- Evidence available in-repo is insufficient to prove a safe MicroScalper gate change. No live Supabase credentials or production candidate/outcome rows were available in this container, so Phase A does **not** loosen MicroScalper thresholds.

### CompressionBreakout
- Code audit shows CompressionBreakout records compression score, box range, recent box range, inside-box bars, breakout confirmation, early breakout flag, breakout distance, ATR expansion, momentum score, and RR.
- Expiry/fakeout diagnosis was limited by lack of live outcome rows. The evaluator already includes breakout confirmation and ATR expansion gates, so no entry threshold was changed without live evidence.

### SwingContinuation
- Code audit shows SwingContinuation records trend score, EMA alignment/slope, pullback score, pullback readiness, strict reclaim confirmation, reclaim-by-quality usage, momentum score, RSI score, and RR.
- The main proven risk was arbitration behavior: SwingContinuation could still win in mixed/choppy regimes if its raw/evaluator score outranked a better role-fit setup. Phase A therefore changed arbitration, not SwingContinuation entry gates.

## 2. Exact bottleneck per strategy

| Strategy | Evidence-backed bottleneck | Action |
|---|---|---|
| MicroScalper | Insufficient live evidence to prove evaluator/score/RR/distance bottleneck; arbitration needed better market-role accounting. | No gate loosening. Added market-role fit so qualified MicroScalper setups are not ranked only by raw score. |
| CompressionBreakout | Insufficient live evidence to prove fakeout/late-entry/TP-geometry change; arbitration needed compression/breakout regime awareness. | No gate loosening. Added market-role fit favoring CB only when compression + breakout + expansion context agrees. |
| SwingContinuation | Arbitration could over-prefer continuation candidates in mixed/chop because strategy selection was not explicitly regime-first. | No evaluator loosening. Added chop/mixed-market arbitration penalties for non-A+ SwingContinuation candidates. |

## 3. Expiry classification

Phase A adds expiry classification at the outcome-evaluator layer and Backtest Lab layer. Expiries are classified into the requested buckets where evidence supports the label:

- `TP too far`
- `expiry too short`
- `entry too late`
- `weak momentum`
- `fake breakout`
- `bad continuation`
- `chop/no follow-through`
- `wrong arbitration winner`
- `strategy should not have entered`

### Evidence used
- Live outcome classification uses entry, stop, TP1/TP2, current/latest price when available, current status, strategy name, risk/reward, confidence score, and candidate `score_breakdown` from the originating `strategy_candidates` row.
- Backtest classification uses the simulated final candle at expiry, score, grade, RR, TP distance in R, progress toward TP1, strategy name, and strategy reason string.

### Dominant expiry causes per strategy
Live dominant causes cannot be truthfully reported without production data access. After deployment/reset, `signal_updates.reason` will include `expiry_cause=<bucket>` for every newly classified expiry, and the evaluator response includes `expiry_cause` plus `expiry_evidence` for immediate inspection.

## 4. Arbitration findings

Before Phase A, arbitration blended confidence score, identity fit, RR, distance margin, and grade. That was better than raw score only, but still not explicitly market-context-first. It did not classify trend strength, compression, chop, breakout state, pullback/reclaim state, or role fit before ranking candidates.

## 5. Market-aware arbitration findings

Phase A adds a market context brain that computes:

- trend strength
- momentum strength
- volatility expansion
- volatility contraction
- compression state
- range state
- chop/noise level
- ATR regime
- distance from EMA
- overextension
- breakout state
- pullback state
- reclaim state

Arbitration now assigns each candidate a market-role fit score and records whether the selected strategy matched the market-preferred strategy. Mixed markets penalize non-A+ candidates rather than blindly selecting the highest raw score.

## 6. Repairs applied

- Added market context classification to the scanner before arbitration.
- Reweighted arbitration toward expected value: confidence, strategy identity fit, market role fit, RR, distance margin, grade, preferred-strategy bonus, mixed-market penalty, SwingContinuation chop penalty, and existing overextension penalty.
- Added explicit arbitration loss reasons explaining whether candidates lost due to market preference, grade, role fit, RR, or mixed-market requirements.
- Added expiry-cause classification to outcome evaluation and Backtest Lab simulated expiries.

## 7. Files changed

- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `src/pages/admin/BacktestLab.tsx`
- `reports/strategies/strategy-phase-a-unified-optimization.md`

## 8. Scanner changes

- Scanner candidates now persist `market_context` inside `score_breakdown`.
- Arbitration snapshots now include `market_role_fit_score`, `market_preferred_strategy`, and `regime_fit`.
- Winning candidates record `market_regime`, `market_context`, `winner_matched_regime`, and `market_preferred_strategy`.
- Losing candidates record a more specific `arbitration_loss_reason`.

## 9. Backtest parity changes

- No scanner strategy entry gates were changed, so no strategy-entry parity migration was required.
- Backtest Lab now classifies expired simulated trades using the same expiry-cause vocabulary as live outcome evaluation.
- This keeps research/backtest expiry diagnosis aligned with live Signal Mode and Binance Bot outcome reporting without changing Binance execution.

## 10. Why changes are safe

- No Binance execution code was touched.
- No monitor, TP/SL placement, Telegram delivery, product/customer pages, live-trading controls, reset logic, testnet execution controls, or governor behavior was changed.
- Strategy evaluator thresholds were not blindly loosened.
- Arbitration changes apply only after strategy evaluators and distance guards pass.
- Mixed/choppy markets now become harder for weak A-grade continuation setups, not easier.

## 11. Expected behavior after reset

- Candidate rows will show why each strategy passed or died in the funnel.
- Arbitration will prefer MicroScalper in fresh tradable short-term momentum, CompressionBreakout in fresh compression/expansion breakouts, and SwingContinuation only in cleaner continuation contexts.
- New expired signals will include a reason suffix such as `expiry_cause=weak momentum` or `expiry_cause=TP too far`.

## 12. What to monitor after deployment

- Per-strategy evaluated/candidate/rejected counts.
- Score pass/fail, RR pass/fail, and distance pass/fail by strategy.
- Arbitration entered vs won by strategy.
- A vs A+ split and whether non-A SwingContinuation candidates disappear from noisy conditions.
- Expiry-cause distribution by strategy.
- Cases where `winner_matched_regime=false`.
- MicroScalper losing to SwingContinuation and CompressionBreakout losing to SwingContinuation.
- A+ candidates losing to A candidates.

## 13. Before/after expected impact by strategy

| Strategy | Expected impact |
|---|---|
| MicroScalper | More fair participation when short-term momentum and low-overextension context fit the strategy. No forced frequency. |
| CompressionBreakout | Better arbitration wins when compression, fresh breakout, and expansion context agree. No forced frequency. |
| SwingContinuation | Less domination in mixed/choppy markets unless the setup is A+ or role fit is genuinely strong. |

## 14. Rollback instructions if quality worsens

1. Revert this commit.
2. Redeploy the affected Supabase Edge Functions.
3. Rebuild/redeploy the web app if Backtest Lab rollback is needed.
4. Reset only if you need a clean post-rollback measurement window; the rollback itself does not require data deletion.

## 15. Confirmation no hardcoded frequency cap was added

Confirmed. No hardcoded frequency target or cap was added. Market conditions still decide candidate frequency.

## 16. Confirmation Binance execution untouched

Confirmed. Binance execution, testnet execution controls, monitor, and TP/SL placement were not changed.

## Phase A live funnel report status

The code now supports the requested funnel fields:

- evaluated count
- candidate count
- rejected count
- score pass/fail
- RR pass/fail
- distance pass/fail
- arbitration entered
- arbitration won
- duplicate blocked
- signals created
- A vs A+ split
- wins/losses/expiries/PF/total R/average R
- expiry rate, TP1 hit rate, TP2 hit rate, SL rate

However, exact production counts were not available from this local environment because no Supabase credentials or database dump were present. Phase A therefore implements the missing classification and market-aware arbitration instrumentation, and intentionally avoids unproven evaluator loosening.
