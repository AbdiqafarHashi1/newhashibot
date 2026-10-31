# Release 1 — tracks, subscriber content and acquisition

This update continues PR 269. Release 1 sells market analysis and conditional signals. The new conditional hypotheses have not established profitable forward performance. Paper results and customer fills remain distinct.

## Seven workstreams

1. **Track separation:** Intraday (15m/12h maximum) and Swing (1h/7d maximum) use the same scanner and arbitrator with independent admission. One open setup per symbol per track across ten symbols gives at most ten per track. The old shared three-open cap is removed. Three *new admissions per hour per track* and four-hour same-symbol/track quiet intervals limit crowding. Opposite directions on the same symbol abstain, including against already open conditional positions. Legacy executable signals retain their own authority.
2. **Publication:** concise setup-watch, confirmation, paper-entry, TP1, stop/target and expiry messages retain the exact reference. Missing bars/source changes remain unknown in admin and reports; technical diagnostics do not publish to subscribers. Losing published setups still receive truthful closure updates. Editorial-provider errors cannot turn into diagnostic subscriber drafts.
3. **Admin:** Signals has track counts, combined modeled closed R and chronological observation history. Existing Signals delivery queue, Launch Setup worker/heartbeat checks and Agents Hub remain the operating surfaces. The recent list is bounded; aggregate scope is the complete 31-day creation cohort plus older open setups. Combined R is not an account return.
4. **Reporting:** every persisted version receives an insert-only history snapshot in the same transaction. Existing records get explicitly marked recovered snapshots; absent older observations are not invented. Complete-cohort proof includes losses, no entries, unresolved outcomes and per-track aggregates. A service-only RPC returns one consistent JSON snapshot so API row limits cannot silently truncate the report.
5. **Deployment preparation:** forward migration `20261029053521_conditional_tracks_and_acquisition.sql`, existing migration history and JWT configuration are preserved. Local embedded SQL tests verify the additions. Native full-chain/deployed Auth/PostgREST/independent-session checks are separate. Supabase project `uqiwbzfcntlcyyewawfc` reported INACTIVE during this work, so remote migration reconciliation and actual Telegram rehearsal remain pending.
6. **Payment/access:** existing Daraja/Whop source-verification and entitlement/membership lifecycle are retained. Conditional analysis can satisfy the sale-policy service path only when `CONDITIONAL_SIGNALS_ENABLED` is not explicitly FALSE and `RELEASE1_ANALYSIS_SERVICE_VERIFIED=true` is set after a successful deployed rehearsal; `RELEASE1_SALES_ENABLED=true` is independently required. This neither promotes a strategy nor enables execution. No real payment was made.
7. **Acquisition:** admin can configure a partner Telegram group/channel ID or @username, verify bot posting permission with read-only API calls, attach a campaign and approve a draft. The existing durable worker publishes to that destination. Identity changes invalidate readiness/approvals. Campaign URLs carry utm_source and utm_campaign through the existing checkout attribution. Approved evergreen EDUCATION/UPGRADE_POST templates can repeat daily for 30 days, within existing destination limits and only while the role/campaign remains active. Other social platforms remain manual exports; Meta/TikTok promotion is owner-run. No arbitrary-group reach or acquired-customer count is claimed.

## Free and VIP

Free receives one qualifying daily conditional setup selection at most, keyed to the Nairobi calendar day. Selection is made at admission, before any outcome, from the strongest-first batch. The full original plan and its follow-ups remain attached to that choice, including losses; no winning-result cherry-picking. Each Free update includes a concise invitation to the full VIP stream. Existing sourced market briefs, education and recaps continue through the editorial path. There is no fabricated signal when no setup qualifies.

VIP receives all admitted setups for its market, both tracks, levels and lifecycle updates. The new conditional implementation is Crypto; existing Forex/Gold adapters are not upgraded or newly certified by this change. Price remains USD29/month or KES3500/30 days. Target counters are 1,000 paid and 1,000 Free, not a promise that traffic or conversion has already occurred.

## Activation sequence

Before the two deployment commands: restore the existing project, reconcile actual migration history, retain existing Telegram/Vault values, complete payment configuration and link the correct project. Never reset the production database or replay already applied migrations. The existing reviewed deployment tooling remains available.

```sh
supabase db push
supabase functions deploy
```

Use the repository's config.toml JWT settings; do not globally disable JWT verification or prune functions. These commands apply schema/code. Existing Launch Setup must also have the required recurrent scanner, canonical reporting, intelligence, commerce, membership and Phase O worker jobs configured and healthy. Credentials and the explicit service-verification/sales settings must be ready. Deployment alone does not prove that any job or channel is operating.

After deployment, rehearse one reference through watch → confirmation → paper entry → closure, Free/VIP scope, an unknown/admin-only case, payment → entitlement → both VIP audiences, expiry/removal, and one configured partner destination. Record actual receipts before enabling sales. An inactive database cannot supply this evidence.

## Verification record

- Application and cloud types; conditional lifecycle/SQL/acquisition suite; existing Telegram and Phase O suites; source-backed Daraja/Whop and membership lifecycle fixtures; operations-readiness suite.
- Fixed an existing CI failure: the simulation engine imported definitions through a UI page, which made Node load a gzip UI asset. It now imports the definitions module directly.
- Production frontend build and application/cloud types passed; all 38 Edge dependency bundles passed. App lint: zero errors, 27 existing warnings. Conditional/acquisition tests: 14 passed. Operations: 94 TypeScript, 13 embedded PostgreSQL and 7 Python tests passed. Release1, Telegram and Phase I/M/O/P suites passed.
- Local desktop/mobile browser rehearsal could not launch because Chromium was absent; its download returned truncated archives. Authenticated visual QA and remote CI remain separate/unverified.
- No remote SQL, deployment, schedule activation, external post, payment or customer order was performed.
