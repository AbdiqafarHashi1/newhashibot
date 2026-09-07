# End-to-end scanner, arbitration, notification, and execution audit — 2026-09-07

## Scope

Static and contract-level audit of the active scheduled path:

`scheduled-market-scanner → market-scanner → strategy evaluation → arbitration → scanner/mode/duplicate/real-data gates → signals → Telegram → certified risk/capital/execution plan → provider adoption → monitors/outcomes`.

No production credentials, broker accounts, Telegram chats, or live provider balances are available in this checkout. Therefore this is a code-path and deterministic-contract audit, **not** evidence that any strategy will profit or that a real order was placed.

## Fixed findings

### Critical — provider execution could precede mode approval and signal persistence

The scanner previously loaded certified accounts and adopted execution plans immediately after the global arbitration, duplicate, grade, and real-data checks. Its later mode loop could still reject the candidate by mode score, RR, or risk policy. This violated the intended pipeline ordering.

The certified execution block now runs only after a `waiting` signal has been successfully inserted by the accepted mode. It remains fed exclusively by the immutable strategy plan, arbitrator decision, account truth, risk decision, allocation plan, and execution plan.

### Critical — legacy direct signal execution existed alongside certified execution

The scanner also retained a second auto-execution helper which took a mutable `signals` row and, for MT5, could create fixed-0.1-lot commands. It bypassed the certified account-truth/risk/capital lineage. The helper and its invocation have been removed. The only scanner provider handoff is `adopt_execution_plan` using the certified plan.

### High — supplied no-trade arbitrator decisions could throw

`runCertifiedRuntime` validated the winner ID even when a supplied `NO_TRADE` decision had no winner. It now validates candidate lineage only when a winner exists, allowing a valid no-trade outcome to fail closed without an exception.

### Medium — Telegram visibility mappings did not match the declared channel registry

`VIP_EXECUTION` incorrectly routed to the general VIP and admin channels instead of the dedicated `vip_execution` channel; analytics also routed to admin. Both mappings now use their named registry destinations. Tests were updated where they were asserting stale text rather than the current compliant template.

## Verification performed

| Area | Command | Result |
| --- | --- | --- |
| Certified runtime and scanner wiring | `npm run test:phase1ga-runtime` | Passed, including supplied `NO_TRADE`, single certified path, and post-signal ordering assertions. |
| Risk/capital/execution adoption | `npm run test:execution-adoption` | Passed. |
| MT5 onboarding and trade-management contracts | `npm run test:mt5` | Passed (the CJS fixture emits known `import.meta` bundle warnings). |
| Telegram taxonomy, routing, eligibility, templates, and anti-spam | `npm run test:telegram` | Passed. |
| Broker historical-bar import | `npm run test:backtest-csv` | Passed. |
| Production web/server build | `npm run build` | Passed. |

## Remaining market-readiness gates

1. Verify a real scheduled run in the deployed Supabase project and retain the run ID, candidates, arbitration decision, signal, Telegram delivery, certified artifact, adoption result, provider acknowledgement, and monitor events as one correlated evidence chain.
2. Confirm each account's `load_certified_execution_account_truth` row is fresh and has correct contract sizes, tick values, spread, stop-level, commission, swap, leverage, and provider-health facts. No default account values should be accepted.
3. Run a controlled demo/testnet campaign for crypto, forex, and gold with broker-side statement reconciliation. MT5 server time, bid/ask spread, partial fills, rejected modifications, disconnects, and weekend/session closures must be measured against HashiBot's events.
4. Keep live execution disabled until the evidence chain reconciles. Historical OHLC replay and unit tests do not model queue latency, slippage, live bid/ask, or all provider failure modes.
