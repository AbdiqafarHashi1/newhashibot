# Execution Fix E1 — Binance Margin-Type Repair

Date: 2026-06-10

## 1. Root cause

Valid crypto signals were reaching the Binance USD-M Testnet execution layer, but execution failed before entry placement because the function configured Binance symbol settings unconditionally for each execution attempt.

The failing sequence was:

1. Build a valid `OrderPlan`.
2. Insert a pending `execution_orders` row.
3. Call `POST /fapi/v1/leverage` for the symbol every time.
4. Call `POST /fapi/v1/marginType` with `marginType=ISOLATED` for the symbol every time.
5. If Binance rejected the margin-type call, the entry order was never placed and the execution row was marked `failed`.

This made execution initialization non-idempotent. A symbol that was already correctly configured as isolated was still sent to the margin-type endpoint, and a symbol with existing open orders could be rejected before the bot reached entry placement.

## 2. Exact failing code path

The failing code path was in `supabase/functions/binance-testnet-execution/index.ts` inside `executeSignal()` after all signal/risk/governor/same-symbol checks and after insertion of the pending execution row.

Previous behavior:

```ts
await binanceRequest("POST", "/fapi/v1/leverage", { symbol: plan.symbol, leverage: plan.leverage }, true);
await binanceRequest("POST", "/fapi/v1/marginType", { symbol: plan.symbol, marginType: "ISOLATED" }, true)
```

Because this ran inside the final exchange submission `try` block, any non-ignored margin-type rejection caused the catch block to write a generic failed execution.

## 3. Why Binance rejects

Binance USD-M rejects symbol configuration changes when existing symbol state makes the change unsafe or invalid. The observed response was:

```text
Binance /fapi/v1/marginType failed (400): Position side cannot be changed if there exists open orders.
```

In this code path, HashiBot was not intentionally changing position side. The rejection happened during the `marginType` setup call. The likely Binance-side blocker is existing symbol orders/state; Binance testnet returned a position-side wording for a blocked symbol-configuration mutation.

The repaired code no longer assumes a margin-type write is harmless. It first reads symbol state and skips the write if the symbol already matches the desired configuration.

## 4. Whether stale orders contribute

The local environment does not contain Binance testnet API credentials, so this patch could not directly inspect the live testnet account from the terminal. Environment audit result:

- `BINANCE_TESTNET_API_KEY`: unset
- `BINANCE_TESTNET_API_SECRET`: unset
- `EXECUTION_MODE`: unset
- `EXCHANGE`: unset
- `TESTNET_ENABLED`: unset
- `LIVE_TRADING_ENABLED`: unset

The repaired runtime now inspects each symbol before entry placement using Binance signed endpoints:

- `GET /fapi/v2/positionRisk?symbol=...`
- `GET /fapi/v1/openOrders?symbol=...`
- `GET /fapi/v1/openAlgoOrders?symbol=...&algoType=CONDITIONAL`
- `GET /fapi/v1/positionSide/dual`

If stale regular or conditional orders exist and a configuration change would be required, execution fails with a structured reason instead of blindly calling `marginType`.

## 5. New execution flow

New behavior:

1. Signal passes existing strategy, scanner, arbitrator, grading, risk, governor, max-open-position, and same-symbol protections.
2. The execution layer builds an order plan.
3. A pending execution row is inserted.
4. The execution layer reads Binance symbol state.
5. If the symbol is already compliant, HashiBot skips symbol configuration writes.
6. If a safe configuration update is required and no open orders/positions block the update, HashiBot applies only the needed update.
7. Entry order placement proceeds only after symbol configuration is confirmed, skipped as already correct, safely reused, or explicitly failed with a structured reason.

## 6. New decision tree

```text
Signal selected for execution
  ↓
Existing protections pass
  ↓
Build order plan
  ↓
Read Binance symbol state
  ├─ hedge mode enabled?
  │    └─ fail: symbol_configuration_mismatch
  ├─ margin type already ISOLATED?
  │    └─ yes: skip /fapi/v1/marginType
  │
  ├─ margin type change required?
  │    ├─ open position exists: reuse existing margin configuration; do not call marginType
  │    ├─ open regular/conditional orders exist: fail margin_type_change_blocked / open_orders_exist
  │    └─ no open blockers: call /fapi/v1/marginType once
  │
  ├─ leverage already equals planned leverage?
  │    └─ yes: skip /fapi/v1/leverage
  │
  ├─ leverage change required?
  │    ├─ open position exists: reuse existing leverage; do not call leverage endpoint
  │    ├─ open regular/conditional orders exist: fail leverage_change_blocked / open_orders_exist
  │    └─ no open blockers: call /fapi/v1/leverage once
  │
  └─ submit entry LIMIT order
```

## 7. Margin type handling rules

Target margin type remains `ISOLATED`.

Rules:

- If Binance reports `marginType=ISOLATED`, do not call `POST /fapi/v1/marginType`.
- If Binance reports a different margin type and there is an open position, do not attempt a margin-type mutation; reuse the existing symbol configuration for the execution attempt.
- If Binance reports a different margin type and there are open regular or conditional orders, do not call `marginType`; mark execution failed with `margin_type_change_blocked: open_orders_exist`.
- If Binance reports a different margin type and there are no open orders or positions, call `POST /fapi/v1/marginType` once.
- The old `No need to change margin type` benign Binance response remains tolerated.

## 8. Leverage handling rules

Target leverage remains the leverage selected by the existing signal/risk/governor plan.

Rules:

- If Binance reports current leverage equal to the planned leverage, do not call `POST /fapi/v1/leverage`.
- If leverage differs and an open position exists, do not reset leverage during that execution attempt; reuse existing symbol leverage.
- If leverage differs and regular or conditional open orders exist, do not reset leverage; fail with `leverage_change_blocked: open_orders_exist`.
- If leverage differs and there are no open orders or positions, call `POST /fapi/v1/leverage` once.
- If the leverage endpoint rejects, classify the failure as `leverage_change_failed`.

## 9. Structured failure reasons added

The execution layer now classifies configuration/exchange failures using stable reason codes:

- `margin_type_change_blocked`
  - Used when a required margin-type change is blocked by open orders, or a Binance margin-type API rejection is caught.
- `leverage_change_blocked`
  - Used when a required leverage change is blocked by open orders.
- `leverage_change_failed`
  - Used when the Binance leverage endpoint rejects.
- `symbol_configuration_mismatch`
  - Used when account/symbol mode is incompatible with the order style HashiBot submits, currently hedge mode versus one-way reduce-only execution.
- `execution_api_error`
  - Used for remaining Binance execution API failures.

Storage behavior:

- `execution_orders.error_message` contains a human-readable structured reason.
- `execution_orders.last_exchange_error` contains the stable reason code.
- `execution_orders.raw_exchange_response.execution_failure` stores structured details, including endpoint/status/code/message when the error came from Binance.
- `execution_event_logs.event_type` uses the stable reason code where possible.

Performance Phase B already reads execution rows and shows `error_message` / `last_exchange_error`, so these structured reasons flow through without changing performance-page code.

## 10. Files changed

- `supabase/functions/binance-testnet-execution/index.ts`
  - Added symbol state inspection before entry placement.
  - Added idempotent margin-type and leverage configuration rules.
  - Added Binance API error classification.
  - Added structured execution failure recording.
- `reports/execution/execution-fix-e1-margin-type-repair.md`
  - Added this audit, root-cause, decision tree, and validation report.

## Confirmation of untouched areas

No strategy logic, scanner behavior, arbitrator behavior, grading, signal generation, TP/SL calculations, Performance Phase B UI, Telegram signal formatting, customer pages, or product pages were modified.
