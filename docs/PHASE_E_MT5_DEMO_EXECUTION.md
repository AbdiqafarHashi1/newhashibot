# Phase E — MT5 Personal + Prop demo execution

## Closure and authority audit

Phase E reuses the existing authorities instead of adding parallel runtime components:

* Phase D `account-policy-authority` remains the only customer/account entitlement, policy-version, Personal-brain and Prop-brain decision authority. Its immutable intent now exposes the already-approved quantity.
* The certified execution planner/adoption worker in `binance-testnet-execution` remains the executor/controller. Its existing `Mt5PersonalDemoAdoptionAdapter` and `Mt5PropDemoAdoptionAdapter` remain the provider adapters and its atomic claims remain the retry/idempotency authority.
* `mt5_commands`, `claim_mt5_command`, the `mt5-bridge` edge function and the installed HashiBridge agent remain the sole command protocol and transport.
* Existing trade-management truth, professional protection verification, MT5 protection truth and recovery commands remain the lifecycle/protection authorities. Phase E adds only an account-scoped lineage projection and explicit protection-incident state.
* The professional Prop product and `/admin/prop` remain the Prop safety and operational authority. Personal continues to use the MT5 Personal brain, capital allocation and professional protection policy. Phase E does not calculate either policy again.

The obsolete lowercase `place_order` insertion in the certified MT5 transport was consolidated onto the canonical `OPEN_POSITION` command path. No second executor, dashboard, protocol, protection engine, brain, Prop rules engine, or trade store was created.

## Exact call path

1. A canonical signal is evaluated once per owned account by Phase D. `BLOCK` and `LOCK` have no intent; `ALLOW` and `REDUCE` carry decision, entitlement, policy/profile version, brain version, immutable account identity, approved risk, and approved quantity.
2. The existing certified planner produces an account-routed demo execution plan. The existing adoption worker revalidates freshness, health, account route, policy and deterministic claims.
3. Immediately before MT5 submission, `createMt5EntryCommand` fail-closes unless Phase-D lineage, customer, execution account, immutable identity, MT5 mode, demo environment, bridge assignment/lease, health and heartbeat all agree. It copies (never recalculates) the Phase-D quantity and risk.
4. `enqueue_phase_e_mt5_intent` atomically repeats the tenant, account, bridge, demo-only, health, protection and sizing checks, inserts the existing `OPEN_POSITION` command, and creates the account-scoped lineage truth row. Unique account+intent and account+idempotency constraints make duplicate delivery a no-op.
5. Existing `claim_mt5_command` leases the command only to the exact account owner and assigned bridge. `mt5-bridge?action=poll_commands` additionally requires the certified completed claim before returning an entry command. HashiBridge submits it to the MT5 demo terminal.
6. Scoped acknowledgements update the command and `record_phase_e_mt5_lifecycle` projects provider facts. A fill enters `FILLED_PROTECTION_PENDING`, never success. Existing protection/trade management attaches/verifies SL and target coverage; missing or failed protection becomes `PROTECTION_INCIDENT`, after which existing recovery/reconciliation commands repair or safety-close it. TP1, breakeven and TP2 facts remain explicit states.

Uncertain responses enter reconciliation and must use deterministic identity lookup before any retry. Rejected orders are terminally visible. Stale intents, expired bridge leases, disconnects and unhealthy accounts fail before submission. Restarted workers reuse the durable command, claim, event and truth rows.

## Personal versus Prop

Both modes use identical transport and isolation guarantees. `MT5_PERSONAL` accepts only a `PERSONAL` account and preserves the Personal brain/capital/protection output. `MT5_PROP` accepts only `PROP_EVALUATION` or `PROP_FUNDED`; the existing professional Prop authority supplies its state, locks and any risk reduction before Phase E. There is no fallback between modes.

Live execution is impossible at both the pure boundary and database boundary. Phase E only accepts `DEMO`; the pre-existing certified adoption policy also rejects `LIVE`.

## Page ownership

No new page was added. Existing surfaces retain one responsibility:

* `/admin/mt5` (MT5 Operations Center): bridge, account, command, heartbeat, diagnostics and reconciliation transport operations.
* `/admin/execution`: certified planner/adoption attempts and order submission truth.
* `/admin/positions`: provider position/fill truth.
* `/admin/protection`: protection coverage and lifecycle truth.
* `/admin/recovery`: incidents, uncertain outcomes and repair/safety-close work.
* `/admin/prop`: canonical Prop challenge/funded account safety and operations.
* Customer Fleet: customer/account ownership, entitlement and operational assignment.

## Deferred certification

Real Windows terminal login, broker symbol mapping, actual bridge reconnect timing, demo fills and broker-native protection behavior require Customer #001's terminal and credentials. Those operational proofs are deferred to Customer #001 system certification; credentials must never be copied into command, lifecycle, audit or UI truth.

**PHASE E IMPLEMENTATION CLOSED — MT5 PERSONAL + PROP DEMO EXECUTION INTEGRATED; REAL TERMINAL/BRIDGE CERTIFICATION DEFERRED TO CUSTOMER #001 SYSTEM CERTIFICATION.**
