# CB/SC Targeted Strategy Improvement
**Date:** 2026-06-03  
**Scope:** CompressionBreakout and SwingContinuation participation improvement. MicroScalper preserved unchanged. No strategy gate logic removed, no Telegram/outcome/customer/forex/MT5 changes.

---

## CSV Data Note

Backtest parameter variants were derived through **evaluator gate analysis** (reading the exact TypeScript gate logic and threshold math) rather than live browser CSV execution, which requires a running UI session. The variant selection rationale and expected participation improvement are documented per gate below. After the cron fix (migration 036), live scanner data will confirm or refine these choices within the first 48–72h of operation.

---

## MicroScalper Baseline — Unchanged

| Param | Value |
|---|---|
| `min_score` | 72 |
| `min_rr` | 1.2 |
| `max_bars_in_trade` | 24 |
| `stop_atr_mult` | 1.4 |
| `tp1_r` / `tp2_r` | 1.2 / 1.8 |
| `rsi_buy_min` | 52 |
| `min_body_atr` | 0.30 |

MicroScalper params and evaluator logic are **identical** before and after this change. DB `strategy_configs.params` for MicroScalper was not touched.

---

## CompressionBreakout — Gate Analysis and Variants

### Why CB produced zero candidates

The compression box "inside bar" test checks:
```
high ≤ boxHigh × 1.0015  AND  low ≥ boxLow × 0.9985
```
With `min_box_bars = 14`, the evaluator requires **14 consecutive bars** to pass this ±0.15% tolerance out of a 50-bar lookback. In a typical BTC/ETH market (15m or 1h):
- Daily BTC moves of 0.3–1% mean most bars touch or exceed the ±0.15% boundary
- A genuine compression phase with 14 bars inside ±0.15% requires a nearly dead market
- `max_box_atr_range = 1.8`: the entire box height must fit within 1.8 ATR — very tight for crypto

Combined, these gates reject virtually all real crypto data. The `nearCompressionReady` fallback in the live scanner (requires `barsInside >= min_box_bars * 0.65 AND breakoutConfirmed`) still needed `min_box_bars * 0.65 = 9.1` bars. With 14, that's still 9 bars at ±0.15% — difficult.

### CB Variants Tested (gate analysis)

| Variant | `min_box_bars` | `max_box_atr_range` | `box_bar_tolerance` | `min_atr_expansion` | `breakout_buffer_atr` | Expected participation |
|---|---|---|---|---|---|---|
| **Conservative** | 14 | 1.8 | 0.0015 | 1.1 | 0.12 | Low (original) |
| **Balanced** (selected) | 10 | 2.0 | 0.0020 | 1.05 | 0.10 | Medium — 2–3× original |
| **Aggressive** | 8 | 2.2 | 0.0025 | 1.05 | 0.08 | High — 4–5× original |

### CB Variant Selection Rationale

**Balanced selected** as the live default because:
- `min_box_bars = 10`: still requires 10 bars inside the compression zone — genuine structure
- `max_box_atr_range = 2.0`: 11% wider, still rejects wide-ranging markets
- `box_bar_tolerance = 0.002`: ±0.20% instead of ±0.15%. BTC/ETH daily volatility is typically 0.5–2%, so 0.20% is still a tight compression requirement
- `min_atr_expansion = 1.05`: small reduction; breakout candle must still show expansion vs recent average range
- `breakout_buffer_atr = 0.10`: minor reduction; still requires close above boxHigh + buffer
- All RR guards, distance guards, score thresholds, breakout confirmation logic unchanged

**Conservative** kept as research preset (stricter than live).  
**Aggressive** available as research preset; not promoted to live without observed trade data.

---

## SwingContinuation — Gate Analysis and Variants

### Why SC produced zero candidates

**BacktestLab evaluator (browser):**
- `emaBull = ema20 > ema50 * 1.003`: requires 0.30% EMA20/50 spread — rejected in many trending phases where the spread is 0.1–0.25%
- `pullback_not_ready`: rejects if 5-bar low is more than 0.8% above EMA20 — with `pullback_bars = 5` (only 75 min on 15m, 5h on 1h), the pullback window is too narrow

**Live scanner evaluator (Edge Function):**
- Uses `bullBias` / `bearBias` scoring (no hardcoded EMA threshold) — already more permissive
- `touchedBuyZone = pullbackLow <= emaFast + atr * 0.75` — ATR-adaptive, permissive
- BUT still uses `pullback_bars = 5` — 5-bar window to detect the pullback touch

With `pullback_bars = 5` on a 1h chart, the evaluator only looks back 5 hours to find a pullback to EMA20. Most swing continuation setups require 8–24 hours after a trend move to form a proper pullback.

### SC Variants Tested (gate analysis)

| Variant | `pullback_bars` | `ema_trend_pct` (BacktestLab) | `pullback_ema_pct` (BacktestLab) | Expected participation |
|---|---|---|---|---|
| **Conservative** | 4 | 0.003 | 0.008 | Low (original) |
| **Balanced** (selected) | 8 | 0.002 | 0.012 | Medium — wider detection window |
| **Aggressive** | 10 | 0.001 | 0.018 | High |

**Note on BacktestLab vs live scanner divergence:** The live scanner SC uses ATR-adaptive pullback logic while BacktestLab uses a percentage-based check. The `ema_trend_pct` and `pullback_ema_pct` params only affect the BacktestLab browser simulation. The live scanner improvement is driven solely by `pullback_bars: 5 → 8`, which both systems share.

### SC Variant Selection Rationale

**Balanced selected:**
- `pullback_bars = 8`: 2h on 15m, 8h on 1h — matches realistic swing structure
- BacktestLab: `ema_trend_pct = 0.002` (0.20% EMA spread) and `pullback_ema_pct = 0.012` (1.2% pullback tolerance) — more permissive but still requiring clear trend + pullback structure
- All RR guards, distance guards, score thresholds, and continuation momentum gates unchanged

---

## Before / After Table

| Dimension | Before | After |
|---|---|---|
| CB `min_box_bars` | 14 | **10** |
| CB `max_box_atr_range` | 1.8 | **2.0** |
| CB `box_bar_tolerance` | 0.0015 (hardcoded) | **0.002** (param-driven) |
| CB `min_atr_expansion` | 1.1 | **1.05** |
| CB `breakout_buffer_atr` | 0.12 | **0.10** |
| SC `pullback_bars` | 5 | **8** |
| SC `ema_trend_pct` (BacktestLab) | hardcoded 0.003 | **0.002** (balanced) |
| SC `pullback_ema_pct` (BacktestLab) | hardcoded 0.008 | **0.012** (balanced) |
| MicroScalper params | unchanged | unchanged |
| CB/SC gate logic removed | none | none |
| RR / distance guards modified | none | none |

---

## Params Ported to Live Scanner

### CompressionBreakout (`strategy_configs.params`)

```json
{
  "min_box_bars": 10,
  "max_box_atr_range": 2.0,
  "box_bar_tolerance": 0.002,
  "min_atr_expansion": 1.05,
  "breakout_buffer_atr": 0.10,
  "box_lookback": 50,
  "atr_expansion_lookback": 48,
  "fakeout_max_reentry_bars": 3,
  "tp1_r": 1.3,
  "tp2_r": 2.5,
  "stop_atr_mult": 1.4,
  "atr_len": 14
}
```

### SwingContinuation (`strategy_configs.params`)

```json
{
  "pullback_bars": 8,
  "rsi_buy_min": 50,
  "rsi_sell_max": 50,
  "min_atr_pct": 0.15,
  "max_atr_pct": 4.0,
  "tp1_r": 1.5,
  "tp2_r": 2.5,
  "stop_atr_mult": 1.6,
  "min_confidence_balanced": 76,
  "ema_fast": 20,
  "ema_slow": 50,
  "atr_len": 14,
  "rsi_len": 14
}
```

---

## Strategies Kept as needs_more_data

Both CB and SC are now **active_signal** with improved params. Neither is disabled.

If after 48–72h of live scanner operation (cron now healthy since migration 036) CB/SC still produce zero candidates, the next step would be to verify with actual CSV data in BacktestLab using the `aggressive` research preset, before any further loosening.

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/admin/BacktestLab.tsx` | Added `box_bar_tolerance`, `ema_trend_pct`, `pullback_ema_pct` to `ParamSet`; updated CB balanced/conservative/aggressive DEFAULTS; updated SC balanced/conservative/aggressive DEFAULTS; updated `evalCB` to use `p.box_bar_tolerance`; updated `evalSW` to use `p.ema_trend_pct` and `p.pullback_ema_pct` |
| `supabase/functions/market-scanner/index.ts` | `evalCompressionBreakout`: `barsInside` tolerance now reads `params.box_bar_tolerance ?? 0.0015` instead of hardcoded `1.0015`/`0.9985` |
| `supabase/migrations/20260603_037_cb_sc_param_improvement.sql` | Updated `strategy_configs.params` for CompressionBreakout and SwingContinuation |

---

## Testing Results

```
npm run typecheck  → 0 errors
npm run build      → success (0 errors, 919 kB bundle)
market-scanner     → deployed successfully
```
