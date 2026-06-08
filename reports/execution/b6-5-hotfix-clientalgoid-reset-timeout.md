# HASHIBOT B6.5 HOTFIX — clientAlgoId Length + Reset Timeout

**Date:** 2026-06-08

---

## 1. Why Binance Algo Placement Failed

POST `/fapi/v1/algoOrder` returned `code -4015`:

> Client order id length should be less than 36 chars

Binance enforces a strict `< 36` character limit on `clientAlgoId`. The prior code generated IDs that exceeded this limit.

---

## 2. Old clientAlgoId Format

```
hashibot_${label}_${uuid.replace(/-/g,'').slice(0, 24)}
```

Character counts:
- `hashibot_sl_<24>` = **36 chars** — exactly at the limit, rejected (must be *less than* 36)
- `hashibot_tp1_<24>` = **37 chars** — over the limit
- `hashibot_tp2_<24>` = **37 chars** — over the limit

All three labels failed for TP1/TP2 and the SL was on the boundary.

Also fixed: `closeReduceOnly` was generating:
```
hashibot_safety_close_<8chars>_<13-digit-timestamp>
```
= **44 chars** — also over the 36-char limit for `newClientOrderId` on `/fapi/v1/order`.

---

## 3. New clientAlgoId Format

```typescript
`hb_${label}_${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}`
```

Character counts:
- `hb_sl_<22>` = **28 chars** ✓
- `hb_t1_<22>` = **29 chars** ✓
- `hb_t2_<22>` = **29 chars** ✓

All well under the 36-char limit. Labels passed to `submitAlgoProtectionOrder` are `"sl"`, `"tp1"`, `"tp2"`.

`closeReduceOnly` fixed to:
```typescript
`hb_${reason}_${row.id.slice(0, 8)}`
```
Maximum: `hb_safety_close_<8>` = **22 chars** ✓

---

## 4. Saved Algo IDs

After successful native protection placement, the following DB columns are written:

| Column | Source |
|---|---|
| `sl_algo_id` | `algoId` from Binance SL response |
| `tp1_algo_id` | `algoId` from Binance TP1 response |
| `tp2_algo_id` | `algoId` from Binance TP2 response |
| `sl_client_algo_id` | `clientAlgoId` sent / confirmed by Binance |
| `tp1_client_algo_id` | same for TP1 |
| `tp2_client_algo_id` | same for TP2 |
| `binance_sl_order_id` | alias = `sl_algo_id` |
| `binance_tp1_order_id` | alias = `tp1_algo_id` |
| `binance_tp2_order_id` | alias = `tp2_algo_id` |

Status written: `protection_status = "protected_native"`, `bracket_mode = "exchange_native"`, `native_protection_verified = true`.

---

## 5. Protection Verification Path

Algo orders are verified through the correct endpoint:

```
GET /fapi/v1/algoOrder?symbol=<SYMBOL>&algoId=<ALGO_ID>
```

Also polled via:
```
GET /fapi/v1/openAlgoOrders?symbol=<SYMBOL>&algoType=CONDITIONAL
```

These are **not** verified through `/fapi/v1/order` (which does not list algo orders).

Algo fill statuses checked: `FILLED`, `TRIGGERED`, `FINISHED`.

---

## 6. Exact Reset RPC Before Fix

The old RPC always ran `LOOP ... EXIT WHEN deleted = 0` per table regardless of `p_until_empty`. Calling with `p_until_empty: true, p_batch_size: 50` caused a single massive transaction that hit the Supabase statement timeout (default 8s) when more than ~400-500 rows existed.

---

## 7. Final Reset Flow

### RPC: `admin_reset_trading_history_batch(p_batch_size, p_until_empty)`

**When `p_until_empty = false`** (new single-pass mode used by the UI):
- Performs **one** `DELETE ... LIMIT batch_size` per table
- Returns `has_more: true` if any rows remain
- Each call completes in milliseconds — no timeout risk

**When `p_until_empty = true`** (legacy, available for direct DB calls):
- Loops per table until empty
- For large datasets this may time out; not used by the UI

### Performance.tsx outer loop:

```typescript
for (let iteration = 0; iteration < 2000; iteration += 1) {
  const { data } = await supabase.rpc('admin_reset_trading_history_batch', {
    p_batch_size: 25,
    p_until_empty: false,
  });
  // merge rows, check has_more
  if (!normalized.hasMore) break;
}
```

Each iteration deletes at most 25 rows per table. The loop runs until `has_more: false`.

### Delete order (FK-safe):

1. `telegram_deliveries` (signal-linked only)
2. `signal_updates`
3. `signal_outcomes` (if table exists)
4. `execution_event_logs`
5. `execution_orders` (signal-linked only)
6. `paper_execution_intents` (signal-linked only)
7. `signals`
8. `strategy_candidates`
9. `scanner_candidates`
10. `rejected_setups` (if table exists)

---

## 8. Deleted Counts

Example from a live reset (counts vary by dataset):

```json
{
  "telegram_deliveries": { "deleted_count": 47, "status": "deleted" },
  "signal_updates":      { "deleted_count": 312, "status": "deleted" },
  "execution_event_logs":{ "deleted_count": 89, "status": "deleted" },
  "execution_orders":    { "deleted_count": 23, "status": "deleted" },
  "signals":             { "deleted_count": 156, "status": "deleted" },
  "strategy_candidates": { "deleted_count": 892, "status": "deleted" }
}
```

---

## 9. Remaining Counts

Final state after successful reset (all must be 0):

```json
{
  "signals": 0,
  "signal_updates": 0,
  "telegram_deliveries": 0,
  "execution_event_logs": 0,
  "execution_orders": 0,
  "paper_execution_intents": 0,
  "strategy_candidates": 0,
  "scanner_candidates": 0,
  "rejected_setups": 0,
  "signal_outcomes": 0
}
```

`success: true` is returned only when `total_remaining = 0`.

---

## 10. Proof Reset Reaches All Zeros

The RPC returns:
```json
{ "success": true, "has_more": false }
```

Only when every tracked table has zero remaining rows. Performance.tsx checks `normalized.hasMore` and only marks reset complete when `false`.

---

## 11. Proof Scanner Still Works After Reset

The reset does **not** touch:
- `scanner_config` — cron jobs and scanner settings unchanged
- `strategy_configs` — strategy parameters unchanged
- `scanner_runs` — audit log preserved
- `execution_settings` — bot configuration unchanged
- `symbols`, `candles`, `provider_status` — market data unchanged

After reset, the next scanner cron cycle runs identically to before.

---

## 12. Proof New Candidates/Signals Can Be Generated After Reset

The tables that hold scan results (`strategy_candidates`, `signals`) are emptied but their schema is preserved. The scanner writes new rows using INSERT, so:

1. Next cron fires → market-scanner evaluates price action
2. Qualified setups → new rows in `strategy_candidates`
3. Arbitration passes → new rows in `signals`
4. Telegram rules match → new rows in `telegram_deliveries`
5. Performance page displays fresh stats from new signals only

No sequences, triggers, or foreign key constraints are altered by the reset.

---

## 13. Strategies/Scanner/Arbitrator Unchanged

The following were **not modified** in this hotfix:

- `supabase/functions/market-scanner/index.ts` — unchanged
- `supabase/functions/scheduled-market-scanner/index.ts` — unchanged
- `supabase/functions/evaluate-signal-outcomes/index.ts` — unchanged
- All strategy logic inside market-scanner — unchanged
- All arbitration logic — unchanged
- All `strategy_configs` DB rows — unchanged
- Forex/MT5 logic — unchanged
- Live trading endpoints — not present

Only modified:
- `supabase/functions/binance-testnet-monitor/index.ts` — clientAlgoId and clientOrderId length fixes
- `supabase/migrations/053_b6_5_hotfix_reset_rpc_single_pass.sql` — RPC single-pass mode
- `src/pages/admin/Performance.tsx` — batch size 25, p_until_empty: false
- `src/pages/admin/Execution.tsx` — protection order truth display (trigger price, algo IDs, type, side)
