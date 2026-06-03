# R1 Scanner ↔ Backtest Full Parity Audit

**Phase:** R1 — audit only  
**Date:** 2026-06-03  
**Scope:** Real Supabase Edge Function scanner path vs Backtest Lab / fixture-runner parity for crypto and forex strategy/timeframe coverage.  
**Behavior change:** None. This report is the only intended repository change.

---

## 1. Executive summary

The real production path is confirmed as the Supabase Edge Function scanner chain:

1. `supabase/functions/scheduled-market-scanner/index.ts`
2. `supabase/functions/market-scanner/index.ts`
3. `supabase/functions/evaluate-signal-outcomes/index.ts`
4. `supabase/functions/telegram-send/index.ts`

The Backtest Lab is **not true live parity**. It is a browser-compatible approximation with its own evaluator logic, presets, scoring, stop logic, compression logic, and trade simulation. The Backtest Lab explicitly labels runs as **"Backtest approximation logic"**, not imported live scanner logic.

Primary findings:

- **MicroScalper 0 live rows is most likely explained by the scanner's post-evaluator stack, not simple absence from code.** MicroScalper is included, enabled by fallback/default config, evaluated on 5m/15m, and uses real Binance candles. However, scanner-only `crypto_behavior_tuning`, stricter live evaluator formula, distance guards, cross-strategy arbitration, duplicate active-symbol blocking, min-grade/mode gates, and live symbol-level one-active protection are not modeled by Backtest Lab.
- **SwingContinuation expiry mismatch is critical.** Backtest expiry is `max_bars_in_trade` in bars and varies by timeframe/preset/strategy. Live outcome expiry is a global 360-minute fallback unless `signals.expires_at` exists. The scanner does not write `expires_at` when inserting signals and does not convert `max_bars_in_trade` into per-strategy/per-timeframe expiry metadata.
- **CompressionBreakout is not parity.** Scanner uses repaired/relaxed `crypto_behavior_tuning` logic, recent compression boxes, early breakout allowance, risk-multiple targets when tuning is enabled, and arbitration; Backtest Lab uses older strict box/drift/breakout/ATR-expansion logic.
- **Forex is intentionally weak/inactive in this phase.** Scanner has forex strategies and TwelveData-only provider support, but effective live forex requires both DB and env toggles, is throttled/budgeted, supports only EURUSD/GBPUSD/USDJPY and 15m/1h provider timeframes, and Backtest Lab has no forex evaluator or real forex parity path.
- **Telegram/outcome is not modeled in Backtest Lab.** Scanner creates signal rows before Telegram and outcome tracking updates status rows later. Backtest simulates TP/SL/expiry directly inside the historical loop.

**Conclusion:** Do **not** merge to testnet yet. R1 should be treated as a proof report only. Follow R2-R5 before relying on Backtest Lab results as live-production scanner evidence.

---

## 2. Real production scanner path confirmation

### 2.1 Scheduled call path

- `scheduled-market-scanner` authenticates either service-role Authorization or `x-scanner-cron-secret`.
- It creates a scheduled `scanner_runs` proof row.
- It checks `scanner_config.is_enabled` and `scanner_config.schedule_enabled`.
- It calls `/functions/v1/market-scanner` with `{ run_type: "scheduled", source, market_mode: "crypto_only", scanner_run_id }`.
- After the scanner returns, it calls outcome evaluation and records proof/warnings.

### 2.2 Market scanner entry point

- `market-scanner` creates a service-role Supabase client.
- It handles debug endpoints first.
- It reads scanner config row `id=1`.
- It derives effective market enablement from DB toggles plus env toggles.
- It rejects scheduled runs when `schedule_enabled` is false.
- It calls `runScanPipeline()`.

### 2.3 Outcome and Telegram path

- Auto initial Telegram sending happens inside `market-scanner` after a signal row is created and passes auto-send gates.
- Manual/admin signal Telegram sending is handled by `telegram-send` and applies a similar eligibility gate.
- Outcome updates are handled by `evaluate-signal-outcomes`, which selects active/waiting/new/approved/tp1 signals and updates them to entry/TP/SL/expired statuses.

---

## 3. Scanner pipeline map — Part A

| # | Scanner step | Where it happens | Backtest Lab models it? | Parity notes |
|---:|---|---|---|---|
| 1 | Scheduled wrapper call path | `scheduled-market-scanner` creates a proof row, validates cron auth/config, calls `market-scanner`, then calls outcome evaluation. | No | Backtest has no cron/proof/outcome wrapper. |
| 2 | Market scanner entry point | `market-scanner` `Deno.serve`, scanner config load, `runScanPipeline()`. | No | Backtest is a React browser tool and never invokes Edge Functions. |
| 3 | Symbol universe selection | Active DB rows from `symbols`, filtered by market toggles and forex C2 allowlist. | No | Backtest uses uploaded CSV only; no DB symbol universe. |
| 4 | Market type selection | Effective crypto/forex flags from scanner_config + env; forex can be disabled even if DB row says true. | No | Backtest is crypto-only by strategy list. |
| 5 | Timeframe selection | Crypto uses `scanner_config.active_timeframes`; forex uses `FOREX_ACTIVE_TIMEFRAMES` filtered to 15m/1h. | Partially | Backtest infers uploaded timeframe and builds a run plan for target strategies/timeframes; it does not read scanner_config. |
| 6 | Provider candle fetch | Crypto: Binance klines. Forex: TwelveData-only C2 provider. | No | Backtest CSV is user-supplied; no provider latency, missing candles, rate-limit, symbol mapping, or REAL DATA gate. |
| 7 | Candle normalization | Provider responses are converted to scanner `Candle` objects and upserted to `candles`. | Partially | CSV parser normalizes OHLCV and sorts time, but schema/source differs. |
| 8 | Resampling | Crypto scanner fetches native Binance timeframe; forex has a historical 4h resampler helper but C2 supported forex scan is 15m/1h. | Partially | Backtest resamples lower timeframe CSV upward only when dataset timeframe is smaller than target. |
| 9 | Strategy config loading | Reads `strategy_configs` rows and falls back per strategy. | No | Backtest uses hard-coded research presets and editable params, not live DB rows. |
| 10 | Strategy enable/disable gating | Skips disabled strategies and disallowed timeframes before evaluator call. | No | Backtest strategy choice determines what runs; no DB enabled flag. |
| 11 | Strategy evaluator call | Evaluates all eligible strategies for a symbol/timeframe and records each as a candidate/rejection. | Partially | Backtest evaluates one selected strategy/timeframe at a time and does not execute all strategies for arbitration. |
| 12 | Raw strategy gates | In live evaluator functions: insufficient candles, invalid candles, volatility, trend, RSI, body, compression, breakout, pullback, momentum, RR. | Partially | Names/families overlap, but formulas differ materially for all three crypto strategies. |
| 13 | Score gates | Evaluator uses `cfg.min_score`; distance guard checks `cfg.min_score`; mode checks also check mode/risk min score. | Partially | Backtest uses preset `min_score` only once in distance guard; no mode overrides. |
| 14 | RR gates | Evaluator `min_rr`, distance guard `cfg.min_rr`, and mode/risk `min_rr_override`. | Partially | Backtest uses preset `min_rr`; no mode-level second RR gate. |
| 15 | Distance guards | Live `checkDistanceGuards()` requires SL/TP1/TP2 pct distances, RR, and score. | Yes, but only locally | Form is very similar, but params may differ and scanner uses live DB config. |
| 16 | Arbitration / strategy selection | Passing entries are sorted by arbitration score, identity fit, then RR; losers become `arbitration_blocked`. | No | Backtest never pits MicroScalper vs SwingContinuation vs CompressionBreakout on the same candle. |
| 17 | Duplicate / one-active-symbol protection | Active `waiting`/`active` signal symbols are preloaded; winner can be rejected as `duplicate_active_signal`. | Partially | Backtest has only local in-trade suppression for the tested strategy/timeframe, not live DB symbol-wide duplicate blocking. |
| 18 | Signal creation | Winning, accepted, REAL DATA candidate inserts into `signals` as `waiting`; risk-blocked modes can insert `cancelled`. | No | Backtest creates simulated trade records only. |
| 19 | Telegram send eligibility | Auto-send requires Telegram env flags, scanner config auto-send, market enabled, REAL DATA, approved arbitrator decision, sendable status, grade >= min auto grade, valid trade fields, no duplicate delivery. | No | Backtest has no Telegram path. |
| 20 | Outcome row creation | Scanner does **not** create a separate outcome row at signal insert; outcome updates are later inserted into `signal_updates`. | No | Backtest classifies trade result inline. |
| 21 | Expiry / time stop logic | `evaluate-signal-outcomes` uses `signals.expires_at` when present, otherwise global 360-minute fallback from created_at. | No / mismatched | Backtest uses `max_bars_in_trade` bars from strategy/preset. |
| 22 | Performance stats reporting | Scanner run summary JSON, candidates/signals/updates tables, UI performance code. | Partially | Backtest reports metrics from simulated trades only. |

---

## 4. Backtest pipeline map — Part B

| # | Backtest step | Where it happens | Scanner equivalent? | Parity notes |
|---:|---|---|---|---|
| 1 | CSV parsing | `parseCSV()` accepts time/open/high/low/close/volume variants, skips malformed rows, requires >=60 candles, sorts ascending. | Partially | Scanner normalizes provider output directly; malformed provider rows are not parsed from CSV. |
| 2 | Candle sorting | CSV candles sorted by time ascending. | Partially | Provider output order is assumed/returned as provider order; scanner upserts by symbol/timeframe/open_time. |
| 3 | Selected date window | UI date filtering is applied before run result creation. | No direct live equivalent | Scanner only uses most recent provider candles. |
| 4 | Timeframe handling | `inferTimeframe()`, `buildRunPlan()`, and strategy timeframe allowlists. | Partially | Scanner uses active timeframes and strategy_config allowed_timeframes. |
| 5 | Resampling logic | `resampleCandles()` buckets full lower-timeframe groups into target timeframe candles. | No for live crypto | Scanner fetches native Binance timeframe. |
| 6 | Strategy config/preset selection | Hard-coded presets: conservative/balanced/aggressive by strategy family. | Partially | DB `strategy_configs` can match some balanced defaults but can drift in production. |
| 7 | Evaluator logic | `evalMS`, `evalCB`, `evalSW`. | Partially | Names match but formulas are not live scanner formulas. |
| 8 | Score gates | Preset `min_score` in `passesDistanceGuard`; evaluator grade uses local score. | Partially | Scanner has evaluator, distance guard, and mode/risk score gates. |
| 9 | RR gates | Preset `min_rr` in distance guard. | Partially | Scanner has evaluator, distance guard, and mode/risk RR gates. |
| 10 | Distance guards | `passesDistanceGuard()` checks SL/TP1/TP2 pct, RR, score. | Yes | Same concept; not necessarily same effective params. |
| 11 | Trade simulation | Loops forward from signal candle, suppresses new trades while in prior simulated trade. | No | Live scanner creates one signal and outcome tracker updates later. |
| 12 | TP1/TP2/SL/expiry simulation | Historical OHLC checks SL first, then TP2, then TP1 within each future bar; expiry after max bars. | Mismatched | Live crypto outcome uses latest price; forex uses candles with conservative same-candle handling; expiry is global 6h fallback. |
| 13 | Capital/R calculation | PnL in R; TP1/TP2 based on actual risk distance; expired = 0R. | Partially | Outcome R is inferred/status-based; scanner UI performance may derive from signal statuses, not historical intrabar simulation. |
| 14 | Result classification | Viability/needs tuning/not enough trades etc. | No | Live scanner performance reports live outcomes and strategy stats, not Backtest Lab classification labels. |

---

## 5. Strategy/timeframe parity table — Part C

Legend: **Yes** means materially equivalent; **Partial** means same concept but meaningful implementation/config/context drift; **No** means absent or different enough to invalidate strict parity.

| Strategy | TF | Backtest active? | Scanner active? | Scanner evaluates? | Same candles/timeframe? | Same resampling? | Same params? | Same min_score | Same min_rr | Same stop | Same TP1 | Same TP2 | Same ATR | Same RSI/EMA/momentum | Same structure/compression/reclaim | Same RR gate | Same distance guards | Same time stop / expiry | Same duplicate behavior | Same arbitration behavior | Same outcome behavior | Severity | Expected effect |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MicroScalper | 5m | Yes | Yes if config allows 5m | Yes on crypto 5m | Partial | No resampling live | Partial | Partial: BT balanced 72, scanner DB/fallback can be 72/75 and mode 75 | Partial | Partial | Partial | Partial | Yes helper family | Partial; scanner has richer body/chase/tuning logic | Partial | Partial | No | No | No | No | **Critical** | Backtest can show profitable standalone trades while live MicroScalper loses to raw gates, score/mode gates, distance guards, arbitration, or duplicate protection. |
| MicroScalper | 15m | Yes | Yes if config allows 15m | Yes on crypto 15m | Partial | No if native; BT may resample from 5m | Partial | Partial | Partial | Partial | Partial | Partial | Yes helper family | Partial | Partial | Partial | No | No | No | No | **Critical** | Same as 5m, plus 15m competes directly against SwingContinuation/CompressionBreakout. |
| CompressionBreakout | 15m | Yes | Yes if config allows 15m | Yes on crypto 15m | Partial | No if native; BT may resample | Partial | Likely same balanced 75 if DB seeded | Likely same 1.3 if DB seeded | No under scanner tuning | No under scanner tuning | No under scanner tuning | Yes helper family | Partial | No: scanner repaired/recent/early breakout; BT strict/drift logic | Partial | Partial | No | No | No | No | **High** | Live can accept/reject different compression/breakout states; weaker live participation may reflect arbitration and stricter post-gates. |
| CompressionBreakout | 1h | Yes | Yes if config allows 1h | Yes on crypto 1h | Partial | No if native; BT may resample from lower TF | Partial | Likely same | Likely same | No | No | No | Yes helper family | Partial | No | Partial | Partial | No | No | No | No | **High** | 1h is independently evaluated live when active timeframe includes 1h; Backtest resampled/native distinction can distort results. |
| SwingContinuation | 15m | Yes | Yes if config allows 15m | Yes on crypto 15m | Partial | No if native; BT may resample | Partial | Likely same 76 if DB seeded | Likely same 1.5 if DB seeded | No | No under scanner tuning | No under scanner tuning | Yes helper family | Partial | No: scanner richer trend/pullback/reclaim scoring | Partial | Partial | No | No | No | No | **Critical** | Live dominance can be genuine score/arbitration advantage but expiry stats are not parity due 6h global fallback vs 96 bars. |
| SwingContinuation | 1h | Yes | Yes if config allows 1h | Yes on crypto 1h | Partial | No if native; BT may resample | Partial | Likely same | Likely same | No | No | No | Yes helper family | Partial | No | Partial | Partial | No | No | No | No | **Critical** | 1h backtest max_bars can imply multi-day room while live global 6h expiry is only six 1h bars. |
| ForexMicroScalper | 5m | No in Backtest Lab | Scanner evaluator supports 5m, but C2 provider plan excludes 5m | No in scheduled C2 plan | No | No | No | No | No | No | No | No | Partial | No | No | Partial | Partial | No | No | No | No | **High** | Function can evaluate 5m only if candles are supplied, but current forex scanner timeframe plan blocks 5m before evaluator. |
| ForexMicroScalper | 15m | No | Yes if forex enabled/config allows 15m/budget permits | Yes when forex enabled and provider succeeds | No | No | No | No | No | No | No | No | Partial | No | No | Partial | Partial | No | No | No | No | **High** | No real Backtest Lab parity; live rows can be absent from env/DB disable, throttling, budget, provider, config, or conservative gates. |
| ForexSwingContinuation | 15m | No | Yes if forex enabled/config allows 15m/budget permits | Yes when forex enabled and timeframe allowed by config | No | No | No | No | No | No | No | No | Partial | No | No | Partial | Partial | No | No | No | No | **High** | No real Backtest Lab parity; 15m may be skipped if DB allowed_timeframes only include 1h. |
| ForexSwingContinuation | 1h | No | Yes if forex enabled/config allows 1h/budget permits | Yes when forex enabled and provider succeeds | No | No | No | No | No | No | No | No | Partial | No | No | Partial | Partial | No | No | No | No | **High** | No real Backtest Lab parity; scanner is TwelveData/budget/throttle dependent. |

---

## 6. MicroScalper deep audit — Part D

### Evidence checklist

1. **Included in scanner strategy list?** Yes. It is in `strategyNames` and evaluated for crypto.
2. **Enabled by DB config or fallback?** Yes by fallback (`enabled ?? true`) unless DB row disables it.
3. **Allowed timeframes include 5m and 15m?** Seed/UI defaults include `['5m','15m']`; fallback allowed_timeframes is `[]`, which means all scanner active timeframes pass config gate, but evaluator itself rejects non-5m/15m.
4. **Scanner params equal calibrated Backtest Lab params?** Not guaranteed. Balanced DB defaults align on several numeric values, but scanner evaluator behavior differs and injects `crypto_behavior_tuning: 1`.
5. **Different min_score?** Possible. Backtest balanced MicroScalper uses 72. Scanner DB seed uses 72, fallback uses 75, evaluator default is 75, and mode/risk fallback can be 75.
6. **Different min_body_atr?** Possible. DB seed/backtest balanced use 0.30; scanner evaluator default is 0.25; effective DB row is required to prove live value.
7. **Different RSI thresholds?** Possible but defaults largely align around 52/48 for balanced. Scanner uses richer context and scorer.
8. **Different stop_atr_mult?** Possible. Backtest balanced/DB seed use 1.4; scanner evaluator default is 1.2 if DB params are absent.
9. **Different TP1/TP2?** Possible. Backtest balanced/DB seed use TP1 1.2R-ish ATR and TP2 1.8 ATR; scanner evaluator default is TP1 0.9, TP2 1.5 if DB params are absent.
10. **Scanner-only behavior?** Yes. `crypto_behavior_tuning: 1` is forcibly added for crypto evaluations. This creates continuation-body relaxation and chase-risk logic not represented in Backtest Lab.
11. **Rejected before evaluator call?** Possible only by `strategy_disabled` or `timeframe_not_allowed`. Current summary records skips but not effective params.
12. **Rejected by raw strategy gate?** Possible. Scanner raw gates are volatility, body/continuation body, trend+RSI, momentum/chase risk, RR, confidence.
13. **Rejected by RR/distance guards?** Possible and likely material on smaller ATR names/timeframes because distance guard requires min stop, TP1, and TP2 percentage distances.
14. **Passes but loses arbitration?** Very plausible. MicroScalper must beat SwingContinuation/CompressionBreakout on the same symbol/timeframe; Backtest never models this.
15. **Blocked by duplicate active symbol?** Very plausible in live. Existing `waiting`/`active` signals block any new signal on the same symbol after arbitration selection.
16. **Excluded from Telegram/outcome even if signal exists?** Telegram can be skipped by env/config/grade/data/status; outcome only tracks signal rows, so no signal row means no outcome/performance row.
17. **Exact reason for 0 MicroScalper performance rows?** The code cannot prove one exact cause without live run data/effective config. Ranked hypothesis below.

### Ranked MicroScalper root-cause hypothesis by evidence

1. **Arbitration/duplicate stack after evaluator pass** — strongest code-level explanation for profitable backtest but zero live signal rows. Backtest runs MicroScalper alone; scanner chooses one strategy per symbol/timeframe and can mark MicroScalper `arbitration_blocked` or selected winner `duplicate_active_signal`.
2. **Effective config/min-score mismatch** — likely. Backtest balanced min_score=72, scanner fallback/mode can impose 75, and live DB may differ.
3. **Scanner evaluator drift vs Backtest Lab evaluator** — critical. Scanner scoring/gates are not the browser evaluator, so a Backtest Lab "candidate" is not proof of live evaluator pass.
4. **Distance guards on live provider candles** — high. Smaller ATR/target distance can reject MicroScalper even when raw strategy logic passes.
5. **Timeframe active list or DB disabled** — possible, but lower evidence unless live `strategy_evaluation_summary` shows `skipped` counts for MicroScalper.
6. **Telegram/outcome exclusion** — not a root cause for zero signal rows, but can explain zero sent/visible rows if signals exist but fail sending.

---

## 7. SwingContinuation deep audit — Part E

### Findings

1. **Scanner expiry fixed at 6h?** Outcome tracker uses `EXPIRY_MINS = 360` when no `expires_at` is set.
2. **Backtest uses max_bars_in_trade?** Yes. It simulates only through `i + p.max_bars_in_trade`.
3. **Scanner max bars/time stop?** Scanner loads `strategy_configs.max_bars_in_trade` but does not use it to set `signals.expires_at` or outcome expiry.
4. **Backtest max bars/time stop?** Balanced SwingContinuation uses 96 bars. That is 24 hours on 15m and 96 hours on 1h.
5. **Same TP1/TP2 as backtest?** Only if DB config matches; scanner with `crypto_behavior_tuning` uses risk-distance targets for SwingContinuation rather than the backtest's ATR target formula.
6. **Same structural stop?** No. Scanner uses pullback low/high with ATR 0.15 buffer and stop_atr_mult minimum; Backtest uses a different `structLow/structHigh` and ATR 0.3 buffer.
7. **Same trend/pullback/reclaim filters?** No. Scanner uses bias/scoring/pullback/reclaim quality logic; Backtest uses stricter EMA threshold/regime checks and simpler pullback readiness.
8. **Dominance cause?** Code suggests it can be genuine higher score/identity fit after richer scanner scoring, but it is also influenced by arbitration. Strategy order is not first-valid because scanner sorts by arbitration score, identity fit, then RR.
9. **Expired trades counted correctly?** Live outcome marks `expired` status and inserts signal_updates when expiry triggers; performance UI likely consumes statuses. However, expiry basis is not equivalent to backtest.
10. **Would strategy/timeframe expiry metadata likely reduce false expiries?** Yes. Converting `max_bars_in_trade × timeframe_minutes` into `expires_at` at signal creation would align live lifetime with strategy/timeframe intent.

### Severity

**Critical.** A fixed 6h fallback badly mismatches SwingContinuation, especially 1h. A 1h swing signal gets only six bars live unless `expires_at` is populated, while balanced backtest gives 96 bars.

---

## 8. CompressionBreakout deep audit — Part F

1. **Scanner using repaired compression logic?** Yes. It includes strict compression plus `nearCompressionReady`, `recentBoxRange`, range contraction, and early breakout paths under crypto tuning.
2. **Same box lookback as backtest?** Default can match 50, but scanner can use DB params and recent/effective box high/low under tuning.
3. **Same ATR calculation?** Same helper family, configurable `atr_len`, but effective surrounding logic differs.
4. **Same box width ATR multiple?** Default can match 1.8, but scanner near-compression allows wider/recent compression when tuned.
5. **Same recent compression logic?** No. Backtest has no `recentBoxRange` / `nearCompressionReady` equivalent.
6. **Same breakout buffer?** Default can match 0.12, but scanner may use effective recent box and early breakout; Backtest strictly compares boxHigh/boxLow + buffer.
7. **Same TP1/TP2?** No under scanner crypto tuning. Scanner uses risk-multiple targets; Backtest uses ATR multiples from price.
8. **Same min_score/min_rr?** Likely if DB seeded balanced, but live DB must be verified.
9. **Same fakeout/confirmation rules?** No. DB has `fakeout_max_reentry_bars` but scanner evaluator shown does not implement the Backtest Lab drift/fakeout logic as parity.
10. **Same expiry/time stop?** No. Live global 6h fallback vs Backtest `max_bars_in_trade` bars.
11. **Is 1h independently evaluated?** Yes, if scanner active_timeframes contains `1h` and strategy_config allowed_timeframes contains `1h`; it is not merely indirect.

### Severity

**High.** CompressionBreakout participates live, but Backtest Lab cannot prove live behavior because repaired live compression logic and target calculation differ.

---

## 9. Forex audit — Part G

Do not rebuild forex in R1.

1. **Included in scanner?** Yes: `ForexMicroScalper` and `ForexSwingContinuation` are in strategy names and evaluated for forex market type.
2. **Enabled?** Fallback enables them, but effective scanning requires DB `scanner_config.scan_forex_enabled === true` and env `SIGNAL_ENABLE_FOREX=true`. Strategy DB rows can also disable or timeframe-filter them.
3. **Provider?** TwelveData only (`twelvedata`) for C2; no demo fallback; Finnhub/MT5 helpers are not production C2 scanner path.
4. **Symbols/timeframes?** C2 allows EURUSD, GBPUSD, USDJPY. Forex scan timeframe plan supports 15m and 1h. Provider budget limits pairs/timeframes per scan and scheduled forex scans are throttled.
5. **Create candidates/signals?** Yes only if forex is enabled, not throttled/budget-skipped, provider returns >=55 candles, strategy_config timeframe permits, raw evaluator passes, distance guard passes, arbitration selects winner, duplicate gate passes, grade/mode gates pass, REAL DATA is present.
6. **Blocked by config/score/RR/distance/Telegram/outcome?** All are possible. Forex can also be blocked before provider by env/DB disabled, unsupported symbol, unsupported timeframe, throttle, or budget.
7. **Backtest Lab real forex parity?** No. It has only crypto strategy union (`MicroScalper`, `CompressionBreakout`, `SwingContinuation`) and no ForexMicroScalper/ForexSwingContinuation run plan.
8. **Files/data required later:** forex CSV fixtures by pair/timeframe, live forex evaluator parity module or shared strategy library, strategy_config export snapshot, TwelveData normalization fixture, provider failure fixture, forex spread/pip distance assumptions, timeframe-specific expiry metadata, and UI paths for forex performance/candidate rejection traceability.

---

## 10. Telegram/outcome parity — Part H

### Initial Telegram eligibility

Scanner-selected signals are Telegram eligible only when:

- `TELEGRAM_ENABLED=true`
- `ENABLE_SIGNAL_MODE_OUTPUT=true`
- `scanner_config.auto_send_telegram=true` for auto sends
- market is crypto/forex and enabled
- data source is `REAL DATA`
- arbitrator decision is approved
- signal status is waiting/active/new/approved
- grade is at or above `min_auto_send_grade` / `min_signal_grade` (normally A)
- trade fields are valid
- no previous sent delivery exists for that signal/chat/delivery type

Telegram eligibility is **not strategy-specific** in code. It is market/config/status/grade/data/arbitration specific.

A and A+ are both eligible when min grade is A. B is blocked if min grade is A. If min auto-send grade is A+, then only A+ is eligible.

### Outcome tracking

- Outcome tracking selects statuses `waiting`, `active`, `new`, `approved`, and `tp1_hit`.
- Outcome tracking requires REAL DATA and valid trade fields.
- Crypto outcome uses latest price, not full intrabar candle path.
- Forex outcome uses TwelveData candles and conservative same-candle handling.
- Expiry checks `signals.expires_at` first, otherwise global 360-minute fallback.
- Outcome updates are `signal_updates`, not pre-created outcome rows at scanner signal insert.

### Backtest mismatch

Backtest simulates TP/SL/expiry inline over historical candles and never models Telegram, REAL DATA gating, arbitrator status, duplicate delivery, or outcome notification.

---

## 11. Diagnostics gaps — Part I

The scanner now has useful strategy-evaluation summary and score_breakdown fields, but the following diagnostics are still missing or insufficient to prove live parity conclusively:

1. Effective params per strategy/timeframe/symbol at evaluation time.
2. Raw rejection reason before normalization.
3. Normalized rejection reason after mapping.
4. Primary failed gate as a top-level indexed/reportable field.
5. Full score components in a consistent schema across all strategies.
6. Arbitration winner/loser row with all competing raw score, identity fit, arbitration score, and final rank.
7. Duplicate blocking reason with the blocking signal id.
8. Existing active signal age and status for duplicate blocking.
9. Expiry metadata written to signal: `expires_at`, `max_bars_in_trade`, `timeframe_minutes`, and strategy-config source.
10. Telegram eligibility reason before send for every created signal.
11. Outcome eligibility reason for every skipped signal.
12. Live config snapshot: scanner_config + strategy_config + mode_config + risk_profile versions in scanner_runs.
13. Provider candle provenance summary: provider, native timeframe, count, first/last open_time, and whether resampled.
14. Backtest fixture parity proof: same candle window and same evaluator module as live scanner.

---

## 12. Recommended fix phases after audit — Part J

### R2 — MicroScalper fix

Audit live `strategy_evaluation_summary` and candidate rows for MicroScalper by symbol/timeframe. Add diagnostics first, then fix only the proven blocker:

- Effective params snapshot.
- Raw vs normalized rejection reason.
- Arbitration detail and duplicate blocking signal id.
- Compare scanner live min_score/min_rr/distance guard against calibrated backtest params.
- Only after proof, consider aligning Backtest Lab to live evaluator or extracting shared strategy evaluator logic.

### R3 — Expiry fix

Add strategy/timeframe-aware expiry metadata at signal creation:

- `expires_at = created_at + max_bars_in_trade × timeframe_minutes`.
- Store strategy `max_bars_in_trade`, timeframe minutes, and config source in signal snapshot.
- Keep 360-minute fallback only for legacy rows.
- Update Backtest Lab labels to show equivalent wall-clock expiry.

### R4 — Active strategy table / arbitration fix

Make strategy/timeframe participation explicit:

- Active strategy/timeframe table sourced from DB config and scanner_config.
- Live arbitration report per symbol/timeframe.
- UI that shows evaluated, accepted, rejected, arbitration blocked, duplicate blocked, and skipped counts by strategy/timeframe.

### R5 — Telegram/outcome proof

Prove created signal → Telegram → outcome lifecycle:

- Persist Telegram eligibility reason for each signal.
- Persist outcome eligibility reason for each scanned signal.
- Cross-link `signals`, `telegram_deliveries`, and `signal_updates` in admin UI.
- Show A/A+ policy and min grade from scanner_config at send time.

---

## 13. Explicit conclusion

**Do not merge to testnet yet.**

R1 identifies multiple critical parity mismatches and missing diagnostics. The next safe step is not threshold tuning or strategy changes; it is R2 diagnostics and proven MicroScalper root-cause isolation, followed by R3 expiry metadata alignment.

---

## 14. Testing results

Testing commands requested for R1:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
- Supabase function check if Deno is available

Results are recorded in the final response for this report commit.
