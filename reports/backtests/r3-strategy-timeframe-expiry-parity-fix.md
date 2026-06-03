# R3 Strategy/Timeframe Expiry Parity Fix

**Phase:** R3  
**Date:** 2026-06-03  
**Scope:** Real Supabase Edge Function scanner/outcome expiry metadata only. No deploy or merge performed.

---

## 1. Files changed

- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `supabase/migrations/20260603080000_034_signal_expiry_metadata.sql`
- `reports/backtests/r3-strategy-timeframe-expiry-parity-fix.md`

No worker, provider, Telegram infrastructure, customer, bot, testnet, MT5, or execution files were changed.

---

## 2. Current expiry mismatch found

R1 found that Backtest Lab simulates expiry from `max_bars_in_trade`, while live outcome tracking checked `signals.expires_at` first and then fell back to a global 360-minute age limit for rows without `expires_at`.

The live `market-scanner` signal insert path did not write `expires_at` or strategy/timeframe expiry metadata. As a result, new live rows behaved like legacy rows and could hit the 360-minute fallback even when the strategy/timeframe intended a much longer window, especially SwingContinuation 1h.

---

## 3. Whether `signals.expires_at` already exists

The TypeScript outcome tracker already referenced `sig.expires_at`, but the baseline `signals` table migration did not define a `signals.expires_at` column. R3 therefore adds a safe migration:

```sql
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
```

Existing rows remain `NULL` and continue to use the legacy fallback safely.

---

## 4. New expiry calculation

For every selected scanner signal insert, R3 computes:

```text
expiry_minutes = timeframe_minutes × max_bars_in_trade
expires_at = signal_created_at + expiry_minutes
```

The scanner stores:

- `signals.expires_at`
- `arbitrator_decision.expiry_metadata`
- `risk_profile_snapshot.expiry_metadata`
- `risk_profile_snapshot.score_breakdown` expiry fields
- converted candidate `score_breakdown` expiry fields

Stored fields include:

- `expires_at`
- `expiry_source`
- `strategy`
- `timeframe`
- `timeframe_minutes`
- `max_bars_in_trade`
- `computed_expiry_minutes`
- `global_fallback_used`
- `legacy_global_fallback_minutes`
- `expiry_window_may_be_too_short`

---

## 5. Strategy/timeframe expiry table

| Strategy | Timeframe | Max bars source | Expiry minutes |
|---|---:|---|---:|
| MicroScalper | 5m | R2 effective MicroScalper runtime params (`max_bars_in_trade=30`) | 150 |
| MicroScalper | 15m | R2/strategy config effective `max_bars_in_trade=24` | 360 |
| CompressionBreakout | 15m | Current effective `strategy_configs.max_bars_in_trade` / fallback | `15 × max_bars_in_trade` |
| CompressionBreakout | 1h | Current effective `strategy_configs.max_bars_in_trade` / fallback | `60 × max_bars_in_trade` |
| SwingContinuation | 15m | Current effective `strategy_configs.max_bars_in_trade` / fallback | `15 × max_bars_in_trade` |
| SwingContinuation | 1h | Current effective `strategy_configs.max_bars_in_trade` / fallback | `60 × max_bars_in_trade` |
| ForexMicroScalper | 5m/15m if evaluated | Current effective forex strategy config / fallback | `timeframe_minutes × max_bars_in_trade` |
| ForexSwingContinuation | 15m/1h if evaluated | Current effective forex strategy config / fallback | `timeframe_minutes × max_bars_in_trade` |

If a future unsupported timeframe has no timeframe-minute mapping, the scanner records fallback diagnostics and leaves `expires_at` null, allowing the legacy outcome fallback to remain safe.

---

## 6. SwingContinuation 15m/1h no longer forced to 6h when metadata exists

Confirmed. New selected SwingContinuation signals now receive `expires_at` based on current effective `max_bars_in_trade` and timeframe minutes. SwingContinuation 1h therefore receives `60 × max_bars_in_trade` minutes, not the legacy 360-minute fallback, unless its config explicitly sets `max_bars_in_trade=6` or expiry metadata cannot be computed.

---

## 7. Legacy rows still use fallback safely

Confirmed. `evaluate-signal-outcomes` still prefers `signals.expires_at` when present. Rows without `expires_at` continue to use the 360-minute legacy global fallback. R3 only renamed the fallback reason to `legacy_global_max_age_expired` for clearer diagnostics and did not change TP/SL hit logic.

---

## 8. R2 MicroScalper fixes preserved

Confirmed. R3 did not remove or undo MicroScalper R2 diagnostics or runtime calibration. The expiry builder reads MicroScalper's effective `max_bars_in_trade` from R2 score breakdown, so MicroScalper 5m uses 30 bars and MicroScalper 15m uses the effective 24-bar config.

---

## 9. No strategy tuning

Confirmed. R3 does not change strategy entry logic, score gates, RR gates, distance guards, stop/TP calculations, thresholds, arbitration scoring, or duplicate/one-active-symbol protection.

---

## 10. No provider/Telegram/customer/execution changes

Confirmed.

- Provider logic unchanged.
- Telegram infrastructure unchanged.
- Customer/Bot/testnet/MT5/execution unchanged.
- Outcome TP/SL hit logic unchanged.
- No fake outcomes and no history reset.

---

## 11. Testing results

Testing commands requested for R3:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
- Deno checks for `market-scanner` and `evaluate-signal-outcomes` if Deno is available

Results are recorded in the final response for this commit.

---

## 12. Manual verification steps after future deploy

Do not deploy or merge yet. Later, after full readiness:

1. Deploy changed Edge Functions and migration only after review.
2. Run scanner manually.
3. Confirm new selected signals have non-null `expires_at`.
4. Confirm signal snapshot JSON contains expiry metadata.
5. Confirm SwingContinuation 1h expiry is not 6h unless configured that way.
6. Confirm MicroScalper 5m expiry is 150 minutes.
7. Confirm MicroScalper 15m expiry is 360 minutes.
8. Confirm CompressionBreakout expiry equals `timeframe_minutes × max_bars_in_trade`.
9. Confirm legacy rows without `expires_at` still evaluate safely through fallback.
10. Do not reset history until R4/R5 are complete.
