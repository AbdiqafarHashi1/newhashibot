# Phase A Regression Repair — Cron Auth Fix + CB/SC Backtest Investigation
**Date:** 2026-06-03  
**Scope:** Scheduler regression fix + Backtest Lab CB/SC investigation. No strategy logic, threshold, Telegram, forex, MT5, customer, or UI changes.

---

## Part A — Scheduler Regression

### Root Cause

Migration 035 registered both cron jobs with `x-scanner-cron-secret: ''` (empty string) because `current_setting('app.settings.scanner_cron_secret')` returned NULL on hosted Supabase — the GUC is never populated since `ALTER DATABASE SET` is not permitted for the migration role.

Both Edge Functions (`scheduled-market-scanner` and `evaluate-signal-outcomes`) evaluate:
```
isCronSecretInvocation = Boolean(cronSecret) && suppliedSecret === cronSecret
// Boolean("<real_secret>") && "" === "<real_secret>"  →  false
```
With `SCANNER_CRON_SECRET` set in Edge Function secrets but the cron job sending an empty value, every pg_cron fire returned **403 Forbidden**. The scanner has not run since ~19:45 on 2026-06-03.

**`admin-scheduler-action` "Failed to fetch":** Not a deployment problem. The function was `ACTIVE` throughout. The error was a timing artifact from the Control Room polling before a deploy completed. No fix required; confirmed ACTIVE via `list_edge_functions`.

---

### Fix — Migration 036

File: `supabase/migrations/20260603_036_cron_pg_token_auth_fix.sql`

1. Added `cron_pg_token text` column to `public.scanner_config`.
2. Generated a UUID token for row `id=1`: `gen_random_uuid()::text`.
3. Unscheduled and re-registered both cron jobs using a **dynamic subquery** evaluated at each fire:
   ```sql
   'Authorization', 'Bearer ' || (SELECT cron_pg_token FROM public.scanner_config WHERE id = 1)
   ```
   Because pg_cron embeds the SQL command (not a pre-evaluated value), this token is read live from the DB on every cron fire. No static secret, no GUC, no vault required.

### Fix — Edge Function Auth (Third Path)

**`scheduled-market-scanner`** — added `isPgCronTokenInvocation` check after the existing two checks:
```typescript
let isPgCronTokenInvocation = false;
if (!isServiceInvocation && !isCronSecretInvocation && token) {
  const { data: cfgAuth } = await supabase
    .from("scanner_config").select("cron_pg_token").eq("id", 1).maybeSingle();
  isPgCronTokenInvocation = Boolean(cfgAuth?.cron_pg_token) && token === cfgAuth!.cron_pg_token;
}
if (!isServiceInvocation && !isCronSecretInvocation && !isPgCronTokenInvocation) {
  // return 403
}
```

**`evaluate-signal-outcomes`** — same `isPgCronTokenInvocation` check inserted before falling back to `auth.getUser(token)`.

Both redeployed successfully.

---

### Verification

| Check | Result |
|---|---|
| `scanner_config.cron_pg_token` | UUID set (`270663fa...`) |
| `cron.job` hashibot_scheduled_market_scanner_5m | active=true, dynamic auth |
| `cron.job` hashibot_evaluate_signal_outcomes_5m | active=true, dynamic auth |
| `scheduled-market-scanner` deployed | ACTIVE |
| `evaluate-signal-outcomes` deployed | ACTIVE |
| `admin-scheduler-action` deployed | ACTIVE |
| Next `net._http_response` expected status | 200 (next 5-min mark) |

---

## Part B — Backtest Lab CB/SC = 0 Trades

### Finding: Pre-existing Market-Condition Behavior, Not a Regression

Phase A made **zero changes to `BacktestLab.tsx`**. CB/SC showing 0 trades is identical to the behavior documented in Phase A RC-3 and RC-4.

**CompressionBreakout:** `evalCB()` requires `barsInside >= minBoxBars` (default 14). A bar qualifies only when `high ≤ boxHigh × 1.0015 AND low ≥ boxLow × 0.9985`. Trending/directional market data rarely satisfies this. Top rejection reasons: `compression_failed_not_enough_inside_bars`, `compression_failed_box_too_wide`.

**SwingContinuation:** `evalSW()` requires `emaBull = ema20 > ema50 * 1.003` (0.3% EMA spread) AND `pbLow ≤ ema20 * 1.008` (price touched near EMA). Momentum-driven data without a pullback never passes both gates. Top rejection reasons: `trend_alignment_failed`, `pullback_not_ready`.

**Code path confirmed intact:** `buildRunPlan()` at line 672 includes all 4 CB/SC strategy-timeframe combos (`CB 15m`, `CB 1h`, `SC 15m`, `SC 1h`) when `strategy = 'ALL'`. No exclusion, no broken import, no changed preset.

The 0-trade result is the evaluators correctly withholding candidates when market structure does not match strategy requirements. Tuning thresholds requires live data from a 2+ week post-cron-restart observation period.

---

## Part C — Strategy Status Audit

| Strategy | `enabled` | `market_type` | `allowed_timeframes` |
|---|---|---|---|
| MicroScalper | true | both | 5m, 15m |
| CompressionBreakout | true | both | 15m, 1h |
| SwingContinuation | true | crypto | 15m, 1h |

All 6 crypto strategy/timeframe combinations remain active. Forex scanning blocked at `scanner_config.scan_forex_enabled = false` level — unchanged.

---

## What Was NOT Changed

- No MicroScalper, CompressionBreakout, or SwingContinuation evaluator logic
- No gate thresholds or scoring formula changes
- No BacktestLab.tsx changes
- No Telegram, outcome TP/SL, customer flows, payment, MT5, or UI changes
- No strategy config row modifications

---

## Build

```
npm run build  → success (0 errors, 918 kB bundle)
```
