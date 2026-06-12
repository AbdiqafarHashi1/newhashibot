# HASHIBOT Execution Flow Audit — Binance Truth & Protection Hardening

Date: 2026-06-12
Scope: crypto Binance USD-M testnet execution only. No Telegram multi-channel work, Intelligence Engine work, Forex, MT5, rebrand, strategy tuning, or scanner scoring changes are in scope.

## Executive Summary

Binance must be the execution truth. Signal truth remains market-price lifecycle truth and must never close or score a Binance execution. The hardened lifecycle now treats an executed position as unsafe until Binance confirms a complete reduce-only native protection set:

- Stop loss exists.
- TP1 exists.
- TP2 exists.
- Each order has the expected close side, reduce-only behavior, quantity, and trigger price.

`protected_native` is only valid after verification. Partial protection is `pending_protection` or `protection_failed`, never active/protected.

## Execution Lifecycle Audit

| Stage | Failure Points | Retry / Monitoring | Recovery Behavior | Truth Rule |
|---|---|---|---|---|
| Signal Created | Signal can expire or hit TP/SL by market price without execution. | Signal outcome monitor can update signal-only lifecycle. | No execution state may be changed unless an execution row and Binance confirmation exist. | Signal truth only. |
| Execution Selected | Duplicate DB rows, stale open status, Binance position already open, Binance orders already open. | Duplicate guards compare DB rows with Binance position/order truth. | Stale DB active rows are cleanable only when Binance is empty. | Binance exposure blocks new same-symbol execution. |
| Entry Submitted | Network/API rejection, timeout, entry order ID missing, DB insert succeeds but order submit fails. | Monitor checks entry order and position every cycle. | Old unfilled entries are cancelled and marked timeout/missing if Binance has no position. | Entry is not filled unless Binance order/futures position proves it. |
| Entry Filled | Fill history unavailable, entry order lookup stale, DB still pending while Binance has position. | Monitor treats open Binance position as fill proof. | Row moves to `entry_filled` and `pending_protection`; protection is submitted/recovered immediately. | Binance position wins. |
| SL Submitted | API accepts but order not actually open; wrong side/qty/price; reduce-only false. | Open algo order verification is mandatory. | Failure leaves row `protection_failed` and watchdog recovers next cycle. | Not protected until verified. |
| TP1 Submitted | Same as SL plus half-quantity rounding failures. | Open algo order verification validates expected quantity and price. | Failure leaves row unsafe; watchdog recreates missing TP1. | Not protected until verified. |
| TP2 Submitted | Same as TP1. | Open algo order verification validates expected quantity and price. | Failure leaves row unsafe; watchdog recreates missing TP2. | Not protected until verified. |
| Protection Verified | Partial protection can be mistaken as protected. | Watchdog checks all three labels every monitor cycle. | Missing/mismatched label downgrades `protected_native` to `protection_failed`. | Complete set or unsafe. |
| TP1 Fill | Order status can be stale; position quantity may not match. | Native fill handling requires Binance order state; managed price-only path is not execution truth for native trades. | Profit-lock replacement SL is placed and verified; failures are critical. | Telegram only after Binance fill confirmation. |
| SL Move | Replacement can fail or old SL cancel can fail. | Replacement SL lookup verifies new order before marking active. | Old-SL cleanup retries; replacement failure records critical protection error. | Runner is unsafe until replacement verified. |
| TP2 Fill | TP2 order can report filled while Binance position remains open due partial/no fill drift. | Guard compares TP2 fill with current Binance position. | If position remains open, execution is not closed and no TP2/CLOSED Telegram truth is emitted. | Closure requires Binance flat position/order truth. |
| Trade Closed | DB may close while Binance still open; Binance may close manually while DB open. | Every cycle reconciles position, open orders, and known order IDs. | DB-open/Binance-closed closes DB and cleans orders; DB-closed/Binance-open recovers row unsafe. | Binance position is final execution truth. |
| Cleanup | Orphan SL/TP/reduce-only/conditional orders remain. | Reconciliation scans open normal and algo orders. | Orders without positions are cancelled and logged. | Orders without position are stale/orphan unless tied to active Binance exposure. |
| Reconciliation | Missing fill/order history, stale IDs, DB/Binance divergence. | Monitor fetches positions, open orders, open algo orders, and per-row order status. | Unsafe positions, orphan orders, stale DB opens are classified and repaired/cleaned. | Binance wins all execution disputes. |

## Mandatory State Model

Allowed protection path:

1. `entry_filled` → `pending_protection`
2. `pending_protection` → `protected_native` only after Binance verification
3. `pending_protection` → `protection_failed` when verification fails
4. `protection_failed` → `protection_recovered` after watchdog repair submission
5. `protection_recovered` → `protected_native` only after re-verification

Legacy managed fallback states may still exist historically, but new exchange-native execution must not classify a Binance position as protected through price checks alone.

## Protection Watchdog Requirements

Each monitor cycle must:

1. Fetch Binance open positions.
2. Fetch normal open orders and conditional algo orders.
3. For each open position, find the execution row.
4. Compare expected SL/TP1/TP2 against actual Binance orders.
5. If any label is missing/mismatched, classify `UNSAFE_POSITION` with critical severity.
6. Attempt native protection recovery immediately.
7. Verify replacement orders.
8. Notify/log admin.
9. If recovery succeeds, classify recovered and then verified protected.
10. If recovery fails, leave `protection_failed` and escalate.

No open Binance position may remain without SL, TP1, or TP2 beyond one monitor cycle.

## Reconciliation Matrix

| DB State | Binance State | Action |
|---|---|---|
| DB open + Binance open | Active exposure | Verify protection every cycle; downgrade unsafe protection immediately. |
| DB open + Binance closed | Drift/stale DB | Determine close path from order/fill evidence when available, close DB row, cancel leftovers. |
| DB closed + Binance open | Binance truth recovery | Reopen/recover row as unsafe `entry_filled`, restore protection, notify admin. |
| Orders exist + no position | Orphan orders | Cancel all stale normal/algo orders, log cleanup, notify admin. |

## Telegram Truth Rules

Execution Telegram messages for TP1, TP2, SL, and CLOSED must only come from Binance-confirmed execution facts:

- Filled order status.
- Fill/order history.
- Confirmed position quantity reduction.
- Confirmed position closure.

Price-only signal checks can update signal truth, but never execution truth.

## Execution Timeline Requirements

Each execution must be reconstructable from `execution_event_logs` plus the durable `execution_timeline` JSON field. Required timeline labels are:

- `signal_created`
- `entry_submitted`
- `entry_filled`
- `sl_created`
- `tp1_created`
- `tp2_created`
- `protection_verified`
- `tp1_filled`
- `sl_replaced`
- `tp2_filled`
- `sl_filled`
- `manual_closed`
- `reconciled`
- `closed`

## Performance Truth

Execution performance must count only Binance-confirmed execution rows. Exclude signal-only, not-executed, never-filled, skipped, cancelled, stale/no-position entries. Signal performance remains separate and market-price based.

## Acceptance Test Mapping

- Missing SL/TP1/TP2/any protection: watchdog verification detects and downgrades to unsafe.
- DB open/Binance closed: monitor closes DB and cleans leftovers.
- DB closed/Binance open: reconciliation recovers unsafe position.
- Orphan orders: reconciliation cancels and logs cleanup.
- TP2 message while position open: Binance truth guard blocks execution close/Telegram truth message.
- Entry filled but protection creation fails: row remains `protection_failed`, not protected.
- Recovery restores protection: only complete verified SL/TP1/TP2 promotes `protected_native`.
