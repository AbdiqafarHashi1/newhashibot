# Phase 1E Existing Execution Ownership Audit

## Scope

Static audit of active-root Binance, Bybit and MT5 paths. No orders, provider calls, SQL, schema/data changes, deployment, cron, strategy, risk, capital, protection, monitoring, recovery, Telegram or customer behavior changed.

```text
immutable ALLOCATED CapitalAllocationPlan
                  ↓
execution-planning-context/v1
 routing policy + explicit provider capabilities + certified contract
                  ↓
ordered routing gates + isolated translator
                  ↓
immutable execution-plan/v1
                  ↓
Phase 1F provider adoption (not connected)
```

## Ownership map

| Provider/path | Current entry and configuration | Current protection/reduce-only | IDs, duplicates and recovery | Finding |
|---|---|---|---|---|
| Binance futures testnet execution | Configures margin type and leverage after checking open position/orders; submits GTC LIMIT entry on `/fapi/v1/order` | Native/algo `STOP_MARKET` and `TAKE_PROFIT_MARKET`, reduce-only; 50/50 TP split; separate monitor/repair/profit-lock paths | Database signal/execution duplicate guards, exchange truth checks, order IDs; retries and USDC margin fallback are execution-owned | Planning, sizing, submission, persistence and protection are coupled in one active function. |
| Binance monitor | Re-fetches exchange rules, rounds stop/targets, floors TP/remaining quantities, verifies/repairs protection and can safety-close | Reduce-only protection/close operations | Reconciliation, stale rows and repair counters | Operational defense must remain; Phase 1E cannot pre-empt monitor truth. |
| Bybit route in active execution function | Independent V5 `/v5/order/create`, category `linear`, Limit/GTC entry and `orderLinkId` | Conditional Market exits with `triggerPrice`, `triggerDirection`, `triggerBy`, `reduceOnly`, `closeOnTrigger` | Provider-specific duplicate checks and position/open-order truth; catches protection submission errors | Bybit semantics are not Binance aliases even though current orchestration is co-located. Leverage/margin are treated as preconfigured in the certified planner unless capabilities explicitly say otherwise. |
| Standalone Bybit demo/preflight and monitor | Connectivity/account/instrument checks and truth reconciliation | Monitor classifies precision, minimum notional and conditional-order failures | Provider V5 auth, environment and health diagnostics | Not an execution-planner API and remains unchanged. |
| MT5 shared provider adapter | Enqueues `place_order` commands with idempotency key to account-specific queue | Modify/cancel/close commands; attached/modified SL/TP | Queue RPC supplies command identity; reconcile commands append provider facts | Cloud command routing is separate from terminal-native translation. |
| MT5 bridge | Claims pending commands with leases and acknowledges results; syncs account/symbol truth | Relays modify/cancel/close semantics | Primary queue plus legacy fallback, claimed/failed/completed state | Queue lease/retry behavior is execution adoption, not planning. |
| MT5 agent | Maps market/deal or pending orders, broker symbol, lots, digits, BUY/SELL LIMIT/STOP choice, IOC filling, GTC, magic/comment, attached SL/TP; normalizes volume again | Terminal modify/close/cancel and broker retcode handling | Command acknowledgements and terminal tickets | Agent currently decides pending subtype from live bid/ask and clamps volume. Certified planning must supply explicit bid/ask/spec truth and already valid lots while preserving agent defenses. |

## Duplicate and unclear ownership

- Provider symbol mapping exists in scanner/provider adapters, execution and MT5 broker specs.
- Quantity/price normalization appears in allocation, execution, monitors and MT5 agent.
- Binance and Bybit protection order construction is provider-specific but co-located with live submission.
- MT5 idempotency exists at command enqueue; Binance/Bybit client IDs are inconsistent across all paths.
- Entry submission and protection sequencing depend on fill truth, while existing functions also contain retries, persistence and notifications.
- Current execution paths can recompute sizing/leverage. Phase 1F must forbid that when adopting certified allocation, under parity rather than deleting defense checks.

## Phase 1E containment

The new planner is a pure additive module. It produces instructions only; it imports no provider client and has no network/persistence capability. Static golden checks prove active consumers do not import it. Existing execution, monitor, recovery and protection remain authoritative until Phase 1F provider-by-provider adoption.

