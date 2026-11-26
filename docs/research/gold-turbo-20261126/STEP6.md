# Work period 6: existing-agent local demo execution integration

Implemented and tested against deterministic terminal/provider doubles. No real MT5 terminal, Exness/Pepperstone account, hosted Edge Function or payment/Telegram activation was exercised. This milestone establishes the code path; it does not establish broker certification, strategy profitability or commercial qualification.

## Connected code path

- Existing authenticated `mt5-bridge?action=gold_turbo_lease` verifies bridge/account scope and reads the connected Personal demo account, admin configuration, active account-bound entitlement and finite subscription. A lease lasts at most 30 seconds and cannot outlive access. No new tables, credentials, tick ingestion service or standalone EA were created.
- `mt5-agent/gold_turbo/runtime.py` starts inside the existing daemon only with `HASHIBOT_GOLD_TURBO_ENABLED=true`, master capability and a verified demo terminal. Default is off. Account, owner, bridge, worker, execution-account ID, login and server remain scoped. Prop/live leases are rejected.
- Native M1/M5/M15 broker history seeds/reconciles the existing intelligence module. Real millisecond bid/ask history feeds local decisions; incomplete/overflowed or stale evidence fails closed. Delayed broker reads use an updated observation clock. No continuous Turbo ticks are published to Supabase.
- All five engines can produce local entries. Independent engine candidates use the same account headroom; flagship additions remain inside the original basket allowance. Native account-currency profit/margin calculations, actual min/step/max volume, stop distances and supported IOC/FOK policy constrain sizing. Reference-entry drift, costs, expired decisions and account limits are checked before submission.
- Attached broker SL/TP is required. Actual history deals reconcile entry/exit volumes, fees, carry and position identifiers. Partial capture is marked only after observed exit fills. Management includes stop/target/invalidation, trailing, partial capture, basket targets/locks, expiry and recovery closures.
- Durable write-ahead checkpoints precede sends/actions. Permission state contains no credentials. Audit JSONL receives deterministic event IDs; compact checkpoints do not repeatedly embed old mark events. Unknown sends are never blindly resubmitted. Definite terminal rejections release reservations; unresolved requests retain them.
- Native terminal operations are serialized between the legacy command loop and the local worker. Legacy new-entry commands also check fresh shared-account headroom while Turbo is attached. Neither local nor legacy HTTP requests hold this native lock. Cloud permission refresh and local protection run on separate threads.

## Protection defaults and boundaries

Daily loss defaults to 1.5% and may be configured only within 1-2% through this initial lease. Peak-equity drawdown, session profit/trailing locks, margin and total open-risk caps are persisted and enforced locally. Equity bands reduce the per-decision percentage cap from 0.25% to 0.20% to 0.15%; administrator limits can be stricter. These are conservative demo controls, not tested return profiles. Daily baseline is first observed equity for that UTC day, persisted across restarts; it is not a reconstructed midnight valuation. Deposits/withdrawals do not silently reset locks.

Missing/stale account-bound economic-calendar evidence blocks new entries. Shock detection adds a 60-second entry cooldown. Weekend restrictions reuse the existing policy. Lease/network loss blocks new entries while retaining owned protection; finite subscription expiry or explicit revocation requests owned closure. Pausing/disabling entries retains management. Native stops remain essential during terminal/network outages; no requested exit price or loss ceiling is guaranteed through gaps.

Profit, margin and conversion use observed native calculations. Where no direct quote/account FX pair exists, a compatible cent-account conversion is derived from native LONG/SHORT profit probes instead of assuming a 100x multiplier. This is functionally checked, not certification of an actual cent broker. Accounts without complete stop/risk evidence cannot admit new Turbo entries.

Hedging account mode is verified, and owned tickets remain isolated from Standard/Forex/manual positions. Netting execution/scaling remains blocked because shared-ticket attribution is not broker-qualified. Opposite-direction experimental hedges remain disabled in the initial runtime lease, despite the period-5 controller's tested bounded hedge support. Real account-wide drawdown blocks entries and closes Turbo-owned exposure; unrelated positions are not liquidated by this module.

## Configuration for number 7 / activation

The existing connected account's admin-owned `policy_overrides.gold_turbo` supplies:

- `enabled`, `strategy_ids` (the five exact exported Turbo IDs), `risk_pct`, `daily_loss_pct`, `total_loss_pct`, `max_open_risk_pct`, `max_margin_pct`.
- Explicit `commission_quote_per_lot_per_side` and `slippage_quote_per_side` in XAUUSD quote units; these must be configured from the intended account, not inferred as zero.
- Optional `basket_target_pct` (0.4 remains experimental), `session_profit_lock_pct`, `session_trailing_pct`, and `expiry_policy: "CLOSE"`.

Number 7 must expose this through existing admin controls; this period did not activate/configure any customer. Agent activation additionally uses existing pairing/account/bridge variables, `MT5_NEWS_CONTEXT_PATH` for the existing calendar export, and the local feature flag. Deploy the modified existing mt5-bridge function and agent only during the authorized activation process. No new schema migration is required for these fields.

## Targeted verification

- 136 Gold Turbo Python checks, including 16 new adapter integration checks: entries, sizing, SL/TP, observed cent conversion, partial-fill feedback, orphan quarantine, permission expiry/revoke, shared risk, restart identity and delayed feed timestamps.
- Additional changed-boundary checks: native protection payloads, runtime resilience, managed positions, agent core, economic calendar and expiry. Combined targeted Python selection: **166 passed**.
- `node --test tests/operations/goldTurboLease.test.mjs`: **5 passed** (scope, finite expiry, live/Prop rejection, entitlement and configuration limits).
- Python compileall and Node syntax checks for the changed Edge Function/shared lease module passed. No full-repository suite or real provider test was run.

Next: number 7, existing admin configuration/selection/monitoring/export. Before connected demo qualification, verify actual broker fills, fees, stops/freeze levels, calendars, slippage, recovery and journal isolation. Historical entry/basket evaluation remains numbers 8-9.
