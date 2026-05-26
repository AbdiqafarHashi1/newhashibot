# HASHIBOT Runtime Audit (Phase 1)

Date: 2026-05-26 (UTC)
Branch: `codex/phase-1-runtime-audit`

## 1) Exact project stack

- **Frontend framework:** React + TypeScript + Vite (`react`, `react-dom`, `vite`, `@vitejs/plugin-react`).
- **Styling/UI:** Tailwind CSS.
- **Backend/data:** Supabase Postgres + Supabase Edge Functions (`supabase/functions/*`).
- **Supabase client usage:** Frontend uses `@supabase/supabase-js` in `src/lib/supabase.ts` for auth/data operations.
- **Edge Functions location:** `supabase/functions/`.
- **Database migrations location:** `supabase/migrations/`.
- **Build commands:**
  - install deps: `npm install`
  - build: `npm run build`
  - typecheck: `npm run typecheck`

### Build result (this audit run)

Command run:
- `npm install --no-audit --no-fund`
- `npm run build`

Result:
- Build **succeeded**.
- Warnings observed:
  - npm env warning: `Unknown env config "http-proxy"`
  - Browserslist data outdated warning.
  - Vite chunk size warning (main JS ~617 kB before gzip).

---

## 2) Runtime provider flow

### Where provider env vars are read

In both scanner functions (`market-scanner` and `scheduled-market-scanner`):
- `FOREX_DATA_PROVIDER` is read to choose provider (`demo`, `twelvedata`, etc).
- `TWELVEDATA_API_KEY` is read first, fallback to `FOREX_DATA_API_KEY`.
- `FOREX_DEMO_FALLBACK` is read to decide fallback behavior when provider fails.

### Twelve Data symbol conversion

- `toTDSymbol(symbol)` converts symbols into Twelve Data format by inserting `/` for 6-char FX pairs (e.g., `EURUSD` -> `EUR/USD`) and preserving already-slashed symbols.
- `toTDInterval(tf)` maps app timeframes to Twelve Data intervals (`M1 -> 1min`, `H1 -> 1h`, etc).

### REAL DATA vs DEMO DATA labeling

For forex:
- If provider is `demo`, scanner returns generated demo candles with `data_source: "DEMO DATA"`.
- If provider is `twelvedata` and key is missing/fetch fails:
  - updates `provider_status` error with `data_source_label: "DEMO DATA"`
  - if fallback true: returns demo candles
  - if fallback false: returns `PROVIDER_ERROR` with no demo candles.
- If Twelve Data fetch succeeds with enough candles: returns `data_source: "REAL DATA"`.

For crypto:
- Binance success -> `REAL DATA`.
- Binance fail + demo_mode_enabled -> demo candles.

### Why Provider Health can show Twelve Data while symbols/signals still show demo

This can happen due to multiple paths:
1. UI "real" badge logic is optimistic in some places (`provider_name === 'twelvedata'` can mark as real even when `data_source_label` is not real).
2. Provider row may remain `twelvedata` while per-symbol/timeframe fetches fail and fallback emits demo candles.
3. `FOREX_DEMO_FALLBACK=true` allows silent demo replacement when Twelve Data fails, so signals/candles still become demo-labeled.
4. Scheduled/manual scans may not have run recently; provider status can be stale/unknown vs latest symbol data realities.

---

## 3) Scanner flow

### Manual "Run One Scan Now"

- UI triggers Edge Function `market-scanner` (see admin pages invoking `/functions/v1/market-scanner`).
- Core scan pipeline (market-scanner):
  1. load `scanner_config`
  2. create `scanner_runs` row (`status=running`)
  3. load active symbols + strategies
  4. fetch candles (Binance or forex provider)
  5. compute indicators
  6. evaluate strategies -> `strategy_candidates`
  7. convert approved candidates to `signals`
  8. optional auto Telegram send
  9. update `provider_status`
  10. complete `scanner_runs` summary fields.

### Scheduled scanner function

- `supabase/functions/scheduled-market-scanner/index.ts` is the cron-oriented function.
- It includes an **inline scan pipeline** (comment says identical logic to market-scanner).
- It separately calculates heartbeat state and writes heartbeat fields into `scanner_config`.

### Reuse vs duplication

- Scheduled scanner does **not import/call** `market-scanner`; it duplicates logic inline.
- This means drift risk between manual and scheduled paths.

### Where `scanner_runs` are inserted/updated

Both scanner functions:
- Insert run row at start: `status='running'`, `run_type`.
- Update at finish: status (`completed`/`error`), counts, errors, telegram counts, timestamps.

### Where heartbeat is calculated

- In scheduled scanner (`updateHeartbeat`):
  - reads `scanner_config` values (`scan_interval_minutes`, `schedule_enabled`, `cron_job_active`, `last_scheduled_scan_at`, etc.)
  - sets `heartbeat_status` to `inactive`, `error`, `healthy`, or `stale`
  - writes to `scanner_config`.

---

## 4) Signal lifecycle

### Signal creation

- Signals are created in both scanner functions when candidate passes filters/risk:
  - normal created with `status='waiting'`
  - risk-blocked branch inserts `status='cancelled'` signal with reason metadata.

### Status transitions implementation state

- Automatic lifecycle transitions (`waiting/active` -> `tp1_hit/tp2_hit/sl_hit/expired`) are **not truly active**.
- `evaluate-signal-outcomes` function is currently a **preview/stub**:
  - explicitly tagged TODO for real feed integration
  - computes `would_be_status` but does not persist updates to `signals`.

### `signal_updates` writes

- Audit found no active write path that persists lifecycle events into `signal_updates` for outcome automation.
- Manual status edits in `SignalsManager` update `signals.status` directly from UI.

### Telegram update delivery for status changes

- No active automated pipeline found that sends Telegram updates when outcomes/status transitions happen (because outcome updater is stubbed and does not persist transition events).

---

## 5) Telegram flow

### Manual send

- `supabase/functions/telegram-send` is the manual admin send endpoint.
- Validates admin auth, checks signal exists, sends via bot API, logs to `telegram_deliveries` as `sent`/`failed`.

### Auto-send

- Auto send implemented inside both scanner functions (`sendSignalToTelegram`).
- Controlled by scanner config flags:
  - `auto_send_telegram`
  - `min_grade_for_auto_send`
  - `allow_demo_telegram_sending`.

### Duplicate-send protection

- Auto path checks `telegram_deliveries` for existing `status='sent'` for same `signal_id`; blocks duplicates.
- Manual path appears to always attempt send (no duplicate short-circuit in function).

### Demo-data blocking rules

- In scanner auto-send helper: if signal `data_source === 'DEMO DATA'` and `allow_demo_telegram_sending=false`, send is blocked with `blocked_demo_telegram`.

---

## 6) Database schema audit

### Tables present in migrations and actively referenced

- `profiles`
- `symbols`
- `candles`
- `scanner_runs`
- `strategy_candidates`
- `signals`
- `signal_updates`
- `telegram_deliveries`
- `scanner_config`
- `provider_status`

Core tables are created in initial migration; later migrations add scanner config/provider/status/risk/replay fields.

### Gaps / likely missing operational pieces

1. **Outcome automation gap**
   - Schema has `signals` + `signal_updates`, but evaluate function does not write updates.
2. **Provider status keying ambiguity**
   - Upserts use `onConflict: "provider_name"` while rows also include `market_type`; if schema uniqueness is not aligned, multi-market/provider combinations can be fragile.
3. **Manual vs scheduled pipeline divergence risk**
   - duplicated scanner logic increases chance of inconsistent writes/behavior.
4. **Heartbeat depends on scheduler config fields and cron wiring**
   - if pg_cron or vault setup incomplete, scheduled scan never executes even when UI suggests configured.

---

## 7) Exact fixes needed (priority order)

### P0 — Forex real data fix

1. Standardize provider truth source:
   - UI should treat `data_source_label === 'REAL DATA'` as authoritative, not provider name alone.
2. In both scanners, enrich provider_status errors with concrete last failure reason per symbol/tf and clear success transition.
3. If `FOREX_DATA_PROVIDER=twelvedata`, ensure missing/invalid key path is surfaced prominently and not masked by fallback.
4. Add explicit run summary fields for forex fetch successes/failures per scan for admin visibility.

### P1 — Scheduled scanner reliability fix

1. Remove/avoid logic drift by sharing one scan pipeline module between manual and scheduled functions.
2. Ensure scheduled scanner writes `last_scheduled_scan_at` and error details deterministically.
3. Harden Scheduler Guide execution requirements (vault secret, cron active flag, service role headers) with machine-check endpoint.

### P2 — Outcome tracking activation fix

1. Implement real price fetching in `evaluate-signal-outcomes` (crypto + forex provider parity).
2. Persist `signals.status` transitions.
3. Write `signal_updates` rows for each transition.
4. Trigger Telegram update delivery for TP/SL/expired transitions (idempotent).

### P3 — Auto Telegram delivery hardening

1. Keep duplicate protection; add stronger idempotency key (signal_id + delivery_type + status event).
2. Add retry/backoff policy for transient Telegram API failures.
3. Distinguish blocked-vs-failed in logs/metrics consistently.

### P4 — UI/session/admin-nav stability (if needed)

1. Align Control Room/Provider Health badges to same backend truth rules.
2. Add explicit "stale provider status" timestamps in UI when latest scan age exceeds threshold.
3. Keep admin auth checks as-is; no redesign needed.

---

## Notes on current root cause hypotheses

- Most likely reason forex still appears demo despite Twelve Data configured: runtime fetch failures plus `FOREX_DEMO_FALLBACK=true` and optimistic UI labeling by provider name.
- Most likely reason scheduled runs are unreliable: cron/vault wiring not fully active plus duplicate scanner code path making behavior harder to reason about.
- Most likely reason signals remain waiting: outcome evaluator is intentionally non-mutating preview.
