# Release 1 conditional analysis and signal service — 29 October 2026

## Product boundary

USD29/month is an analysis/signals subscription. Customer execution certification is not its launch gate. The service must still distinguish waiting setups, confirmed conditions, paper fills, actual orders and measured performance. No promise of profitability, guaranteed daily trades, or exhaustive market coverage is made. The earlier reserve-cost and actual-rate studies are retained unchanged; this product change does not reclassify their failures as successes.

Two broad tracks run in the existing market-scanner: Intraday (15-minute confirmation, closed 1-hour context, up to12-hour paper hold) and Swing (1-hour confirmation, closed4-hour context, up to7-day paper hold). Both distinguish observed trend-pullback conditions from balanced-range rejection. These are new conditional hypotheses, not empirically approved profitable strategies. This is not a sub-minute scalp service.

Fixed ten-symbol watchlist: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, LINK, AVAX and LTC. Existing bounded provider budgets remain. A budget below ten rejects activation rather than silently claiming complete coverage. Fresh closed OHLCV is required. The scanner samples on invocation, not continuous ticks. Existing cron definitions are preserved and inactive schedules are not activated. “24/7” requires a deployed healthy recurrent scanner and publication worker; neither uptime nor the observation of every formation is claimed by code tests.

## Connected flow

Existing authenticated/internal scanner → existing public candle transport/cache → existing closed-candle admission → conditional rules → the SAME arbitrateActiveScanner authority → strongest-first cross-symbol batch → service-only transactional store → immutable canonical lifecycle event/outbox → existing bounded canonical reporting worker and Telegram transport → VIP Crypto.

The conditional branch is mutually exclusive with legacy Crypto signal/execution adoption inside the scanner. Forex remains on its existing adapter/path; no new Forex approval or data is invented. Setup records are canonical analysis/lifecycle evidence, deliberately not inserted as executable signals. No customer/account is selected and no provider-order endpoint is called. The existing registry-based trade strategies and research receipts remain intact. Conditional hypotheses are distinct from qualified trade-strategy approval.

Opposing track directions on one asset abstain. One open setup per asset, three open setups globally including legacy active crypto signals, at most three creations/hour and a four-hour per-asset quiet interval constrain crowding. Existing open paper positions are not replaced by higher-ranked newcomers. Rule scores rank current setups; they are not win probabilities. No quota forces an alert.

WAITING → ARMED only after a completed candle closes beyond the declared boundary. ARMED → paper ACTIVE at the next candle open, with a0.25 initial-R chase limit; crossing invalidation cancels. The next-open result is observable by this implementation when that bar completes, so it is not an immediate streaming fill notification. TP1 realizes50%; TP2 closes the rest; original stop remains. Stops win ambiguous same-bar target/stop ordering. Gaps through stops use adverse open. A fixed25bps round-trip modeled reserve is charged once at closure. It is not verified funding, spread, borrow cost or provider execution and may be insufficient over long holds. Missing bars produce DATA_GAP and unknown outcome rather than a fabricated TP/stop. Closed/expired/invalidated/gap states are terminal. Delayed waiting/confirmation notices are held if superseded or expired.

Atomic version fencing and immutable plan comparisons protect transitions. State update and publication enqueue roll back together. Identical retry is idempotent, changed same-version content conflicts, stale version loses the fence. Existing delivery-part reservations, ambiguity reconciliation and no-blind-resend rules are reused. No exactly-once claim.

## AI agents and proof

Reuse existing Content & Proof, Growth & Engagement and Customer Guide roles, not a new collection of signal publishers. Deterministic rules own conditions and outcomes. AI can write an evidence-backed explanation; it cannot mark an entry/target as reached or authorize an order.

The existing Agents Hub evidence selector now offers a complete previous UTC-day **creation cohort**. Content & Proof loads every setup in that interval from the database (bounded10000; incomplete/truncated loads block), with current outcomes as of generation: wins, losses, break-even, no entry and unresolved states. This is not a period portfolio return. The same cohort can drive text drafts and private SVG proof documents. The complete query snapshot is hashed; the AI receives aggregate counts and only a bounded reference sample, avoiding an unbounded prompt. Exact approval still binds draft, artifact, destination and offer. The artifact becomes a separately reserved delivery part; its private bytes are hash-checked before Telegram document upload. SVG is sent as a document, not falsely described as a provider screenshot or inline PNG. Free artifact delivery is blocked pending separate redaction. Existing signed admin previews remain.

The existing intelligence/catalyst paths remain responsible for sourced market context/news. This change adds no clairvoyant predictions, no unverified headline fabrication, no claim of watching every listing, and no autonomous growth/acquisition result. Proof jobs still use existing approvals and worker invocation; no schedule or destination is auto-enabled.

## Operations and configuration

Admin → Signals shows stored conditional setups, conditions, status, modeled results and references, alongside the existing delivery queue. Empty or backend-error states do not imply healthy runtime. Existing scanner status/heartbeat pages remain authoritative for invocation health.

Apply forward migrations in existing order, then20261029031319_conditional_signal_service.sql. It was generated with `npx supabase migration new conditional_signal_service`; the first offline attempt had no cached CLI and failed without schema changes. Configure `CONDITIONAL_SIGNALS_ENABLED=TRUE` only for the intended Release1 analysis-mode window, crypto scanner enabled, ten-symbol/provider budget, approved bot destination and recurrent invocations. Flag defaults off. This is separate from execution enablement. Supabase/Auth, deployed migration chain, Telegram permissions, Storage/AI configuration, commerce fulfillment and remote smoke validation remain external tasks; do not enable provider execution for this release.

## Verification

Nine conditional tests pass, including actual single-session embedded PostgreSQL execution of the new migration and the repository's canonical enqueue RPC: concrete store transitions, real canonical consumer audience/render/send loop with injected delivery, atomic outbox/rollback failure injection, idempotency/conflicts, grants/RLS, cap enforcement, restart, independent partial accounting, source/freshness checks, opposing arbitration and complete-cohort proof. Telegram is an injected transport in tests. This is NOT independent PostgreSQL-session concurrency, deployed Auth/PostgREST/Storage, genuine forward performance or real delivery proof.

Application and cloud typechecks, build, PhaseO, PhaseM, Release1 and Telegram suites pass. Edge discovery and explicit scanner/agent endpoint bundles pass. The first UI import unnecessarily pulled the whole backend evaluator graph into strict app checking and exposed14 diagnostics; the UI now reads its safe stored projection without importing the backend engine and app checking passes. The first database cap test expected three fresh admissions after an earlier creation; the hourly gate correctly allowed only two. The corrected test isolates the open-cap assertion and retains the hourly behavior. No underlying safety gate was loosened.

Authenticated visual review and deployed end-to-end smoke: NOT_RUN. No remote migration, deployment, schedule activation, external message, payment or provider order was performed. This document records connected repository code, not an announcement that production is running or that new hypotheses are profitable.
