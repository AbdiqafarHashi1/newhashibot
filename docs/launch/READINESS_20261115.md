# HashiBot readiness — 15 November 2026

The intended next milestone is owner onboarding and connected demo/testing on the existing HashiBot project. Local engineering preparation is substantially complete. Hosted activation and real payment, Telegram and broker observations remain outstanding. This document supersedes older counts and expiry-gap statements; it does not turn historical returns into customer forecasts.

## Current inventory

Fourteen exact configurations have reviewed costed canonical account evidence: five crypto, four Forex and five Gold. The original twelve stay selected by default. Gold compression and Gold RSI trailing are optional; no research-only configuration is added to the default bundle. Crypto swing/pullback covers ten assets; reviewed intraday crypto is DOGE and LTC; reviewed Forex is USDJPY and GBPUSD; Gold is XAUUSD. This is not full scalp/swing coverage on every market or asset.

Gold RSI trailing is integrated through strategy discovery, frozen confirmation, persistent signal management, historical account management, account selection, MT5 transport and the native agent. Its exact canonical evidence at $25,000 and 0.4% risk is +2.41%, 2.69% drawdown, 35 closed trades for 5 May–30 June; +5.90%, 4.33% drawdown, 99 closed trades for 5 July–31 October. These are total period returns and reused development history. The earlier native +21.50% six-month result is a different implementation/replay and cannot be attached to this preset. See `../research/demo-completion-20261114/RESULTS.md`.

## Ready in source and local checks

| Area | Prepared behavior | Remaining connected evidence |
|---|---|---|
| Scanner and signals | Real closed-bar inputs, immediate/conditional/no-trade decisions, automatic named confirmation, durable watches, arbitration, lifecycle and recorded outcomes | Fresh hosted data, scheduled runs and restart/retry observations |
| Telegram | Free/Crypto VIP/Forex VIP/Admin routing, message splitting, durable delivery records, membership and expiry flows | Bot/channel permissions; actual message delivery, admission, renewal and removal |
| Crypto execution | Account-scoped Binance/Bybit sandbox routing, risk/quantity/contract checks, native protection, monitor/reconciliation and exits | Actual venue acknowledgements, fills, costs, protection and recovery; currently flat-account/supported collateral entry scope |
| MT5 execution | Dedicated data-only feed, customer account/bridge binding, hedging demo entries, minimum-lot single-target handoff, maximum holding and persistent trailing | Actual customer-broker feed/contract and terminal observations; hedging demo market-entry scope |
| Expiry and renewal | Sandbox expiry pauses entries, scopes close/cancel to owned exposure, preserves protective access, retries and invalidates stale renewal commands | Real late fills, outages, restart and closure reconciliation on each provider; this is not general live-account expiry approval |
| Prop | Challenge/verification/funded onboarding; actual configured rule basis; capital-aware risk reduction; objective/continue or close-and-pause behavior | Real firm/account settings, terminal evidence and forward outcomes. Repeatable 30–40-day passing is not established |
| Payments/customer access | M-Pesa/Whop bindings, account/product entitlements, renewal/refund/expiry, owner demo access, signup/onboarding | Merchant test configuration and genuine payment/webhook/entitlement round trip |
| Public/customer/admin UI | Product pages, purchase/onboarding, launch workspace, exact strategy/evidence cards, provider/account controls, Telegram diagnostics and research reports | Current desktop/phone browser run and authenticated hosted workflows |

Conditional confirmation is automatic. There is no per-trade human approval step. A strategy score is not a probability of winning. Demo testing is warranted by the exact positive costed candidates and exercised engineering; dependable income or fast challenge passing has not been demonstrated.

For the first focused comparisons, the account chooser includes **Crypto · focused trend pullback** and **Gold · focused momentum · 15m**, plus the separate **Gold · focused RSI trailing** option. The first crypto configuration recorded +15.04% / +6.92% total period returns, PF 1.57 / 1.30, and maximum drawdown 8.45% / 8.47% at 0.5% risk (May–August 2025 and August–October 2026, $1,000 modeled capital). Gold M15 momentum recorded +5.39% / +10.94%, PF 1.36 / 1.51 and drawdown 4.28% / 4.96% at 0.5% risk (April–May and June–August 2025). These selected historical results support a focused demo comparison; they do not make every reviewed configuration equally strong, demonstrate current-broker costs or establish future returns. Forex-only and Prop bundle comparisons remain separate.

## Validation on this workspace

- Application and research TypeScript passed.
- 160 operations TypeScript tests, 29 database tests and eight operations Python tests passed before the additional evidence regression; that regression file then passed all five tests.
- 60 conditional-signal tests passed; one optional test skipped. 89 historical engine tests passed.
- 45 MT5 agent tests passed, including trailing and expiry.
- Full execution suite passed; chaos summary: 23 passes, two warnings, zero failures. These are local scenarios, not real broker receipts.
- Release 1 engineering checks passed, including actual SQL with mocked payment/Telegram endpoints.
- Production web build and 39 Edge dependency bundles passed. Existing large bundle warnings remain.
- Current browser run is blocked before page launch: installed system Chromium cannot create its singleton socket in this host. The missing bundled Chromium was also checked. No current desktop/phone pass is claimed; remote CI must resolve this.

## Activation handoff

The connected management API rechecked project `uqiwbzfcntlcyyewawfc` as **INACTIVE** on 15 November. Previous restoration hit a billing requirement; billing itself was not rechecked here.

1. Restore the existing Supabase project. Preserve domain, customer identities and existing data.
2. Inspect its actual migration ledger and stale schedules with the existing deployment inspector/planner. Apply the reviewed branch migrations and deploy matching functions, frontend and MT5 agent together. Do not enable stale entry schedules while reconciling.
3. Configure merchant test settings, Telegram routes/bot permissions, worker settings and separate Binance testnet, Bybit demo and MT5 personal/Prop demo accounts through existing setup pages.
4. Install the reviewed exact strategy bundle. Use focused account presets for first comparisons; do not infer combined returns by adding individual results. Gold minimum lots can prevent $500 accounts from participating within their risk budgets.
5. Verify fresh feed → setup/confirmation → Telegram → account decision → order/fill → native protection → management/exit → reconciled report. Exercise restart, duplicate delivery, uncertain submissions, expiry closure and renewal. Verify payment → correct access → renewal/expiry separately.

Owner activation can proceed once this branch's current CI/browser and native migration checks pass. Actual service onboarding/demo operation requires the deployed backend and these connected checks. Paid live launch additionally requires provider-specific observed execution behavior and a credible customer offer. A $100 monthly fee on $500 capital requires 20% profit just to cover software; no demonstrated modest-return strategy fixes that arithmetic.
