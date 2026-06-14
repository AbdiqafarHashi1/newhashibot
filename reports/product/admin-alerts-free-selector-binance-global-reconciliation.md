# Admin Alerts + Free Selector + Global Binance Reconciliation

## Scope guard
- Preserved strategy scoring, scanner thresholds, scanner entry logic, Binance entry placement, intelligence calculations, Forex, MT5, and Capital Allocation.
- Changes are limited to Telegram product routing helpers, Binance monitor reconciliation/cleanup truth, Execution UI status visibility, and this proof report.

## 1. Global Binance reconciliation
- The monitor now builds an all-symbol reconciliation set from every open Binance position, every open regular/algo conditional order, and recent local `execution_orders` rows.
- For each symbol it records Binance position side, quantity, entry price, mark price, order side, order quantity, order type, trigger price, reduceOnly, order/algo id, and update time.
- Each symbol is classified with: `matched_position`, `matched_entry`, `matched_sl`, `matched_tp1`, `matched_tp2`, `duplicate_conditional`, `stale_conditional`, `orphan_binance_order`, `orphan_local_order`, `missing_protection`, `unmanaged_external_order`, `closed_but_orders_remain`, `safe_to_cancel`, and `unsafe_to_cancel`.
- Binance truth is authoritative: if Binance has a position without verified local protection, the monitor marks a critical mismatch and increments unsafe position tracking.

## 2. All-symbol conditional cleanup
- Cleanup is not DOGE/AVAX-specific. It applies to every symbol returned by Binance open order/conditional order APIs.
- For active open positions, duplicate protection cleanup only runs after the current expected SL/TP set verifies live on Binance.
- For symbols with no open Binance position, orphan/stale orders are safe to cancel and each attempt records symbol, order/algo id, matched local row, cleanup action/reason, safety decision, before/after count, Binance response/error, and timestamp in monitor reconciliation summary.
- The monitor still does not delete history; it writes event logs and monitor result JSON.

## 3. Monitor always-on truth
- The monitor result now includes `reconciliation_summary` and persists `latest_account_state_at` on account refresh.
- UI health requires a recent monitor invocation, a recent account fetch, a non-critical/non-degraded status, no monitor/sync error, no unprotected position, and no unresolved critical mismatch.
- Admin monitor alerts are sent for critical/degraded monitor states and include reconciliation summary, cleanup count, unsafe positions, and latest error/warning.

## 4. Profit lock / breakeven truth for all symbols
- TP1 native fill handling still calculates +0.3R from entry and original SL.
- The old SL is not cancelled until the replacement SL is submitted and verified by Binance.
- If replacement verification fails and an old SL exists, protection is marked degraded, the old SL is preserved, the exact error is logged, and the monitor retries later.
- If no SL exists, the failure remains critical/unprotected.

## 5. Admin ops alerts
- Telegram routing now treats admin/failure/failed/critical_error/cleanup/cron/provider/unprotected/protection_degraded/stale_monitor/execution_rejection events as admin-channel events by default.
- The Binance monitor sends admin alerts for critical/degraded monitor states and stale/duplicate cleanup summaries through `routeTelegramEvent`.
- `telegram-test` now includes a safe `admin_alert` action to prove admin delivery.
- Optional unavailable provider rows are included in digest text only and are not routed as emergency alerts by this patch.

## 6. Admin digest
- `telegram-test` now includes a safe `admin_digest` action.
- Digest contains scanner run count, signal count, execution/open/protection state, Binance monitor/account timestamps, Binance positions/orders, stale/orphan/duplicate/unprotected reconciliation counts, Telegram failures, intelligence events, and optional unavailable feeds.

## 7. Free selected signal selector
- `telegram-test` now includes a `free_selected_signal` action.
- Selector enforces a daily cap of two sent Free selected signals outside test mode, chooses A+/A signals ordered by score/confidence/RR, dedupes by `signal_id`/event id, and sends only a selected signal summary.
- It does not send lifecycle updates, TP/SL spam, execution logs, or performance reports to Free.
- VIP routing remains unchanged because existing VIP signal delivery routes were not altered and explicit channel overrides still take precedence.

## 8. UI truth
- Execution UI now shows admin alert last sent, admin digest last sent, Free selected signal count today, Telegram health per channel, monitor last invocation, Binance account fetch timestamp, reconciliation counts, stale/orphan order count, duplicate conditional count, and unprotected position count.
- UI displays `UNHEALTHY` when monitor run/account fetch is stale, monitor status is degraded/critical, monitor/sync errors exist, unprotected positions exist, or unresolved critical reconciliation mismatch exists.

## 9. Safe tests / proof
- Local static/build tests passed for the React app and execution library tests.
- Deno runtime is not installed in this container, so Edge Function typechecking is limited to source review and repository tests.
- Live Telegram/Binance/Supabase proof still requires deployed Edge Functions with configured secrets; safe triggers are implemented via `telegram-test` actions: `admin_alert`, `admin_digest`, and `free_selected_signal`.

## Acceptance status
- Admin test error alert path: implemented, requires deployed secret-backed test.
- Admin digest test path: implemented, requires deployed secret-backed test.
- Free selected signal selector: implemented with cap/dedupe and test trigger.
- VIP routing unchanged: yes.
- Binance monitor cron every minute: existing migrations still define `hashibot_binance_testnet_monitor_1m`; UI now refuses healthy when latest run/fetch is stale.
- All Binance open positions/orders classified: implemented in monitor reconciliation summary.
- Stale/duplicate conditionals cleaned or skipped with reason: implemented globally with safety guards.
- No only-valid-SL cancellation: active-position cleanup requires verified current protection and replacement SL preserves old SL until new SL verifies.
- Optional missing feeds: digest-only summary, no emergency route added.

READY FOR OBSERVATION: YES
