# HashiBot Phase 6 — Market Intelligence and Communication

## Certification scope

Phase 6 extends the established ROOT Telegram platform; it does not replace routing, delivery, scheduling, execution, provider, strategy, or arbitrator ownership. `telegram-router.ts` remains the only Telegram delivery boundary and `intelligence-engine.ts` remains the live data collector.

## Audit and reuse decision

| Capability | Decision |
|---|---|
| ROOT router, channel policy, dedupe and delivery ledger | Reuse unchanged |
| Intelligence feeds and canonical reporting | Reuse; never recalculate report truth |
| Existing signal lifecycle renderer | Reuse for live lifecycle delivery |
| Briefing scheduler/orchestrator | Reuse; Phase 6 content is scheduler-agnostic |
| Content vocabulary, news hygiene, evidence separation | Completed in the Phase 6 content domain |
| Editorial approval, version history, search and retention | Added as a compact control-plane schema |

## Content architecture

`professional-content.ts` is a transport-agnostic content domain used before the existing renderer/router. It supplies a catalog covering briefings, news, analysis, signals, lifecycle events, canonical reports, education, customer lifecycle, operations, broadcasts and alerts. Output is mobile-sized, timestamped, sanitized and capped at Telegram's 4,096-character limit.

The editorial store contains rendered content plus compact evidence and metadata. Draft, approval, scheduling, publishing, disabling and rejection states support preview and approval workflows. A generated search vector and composite indexes support paginated category/status/date filters without polling. History is append-only and batch-retained for 365 days.

## News pipeline

Inputs require a title, named source and valid publication time. The pipeline removes spam, rejects future or older-than-seven-day records, normalizes whitespace, extracts supported asset tags, fingerprints near-identical headlines, retains the strongest duplicate, applies explicit importance plus time decay, and emits freshness and confidence. It only summarizes supplied text and never returns scraped article bodies.

## Evidence-based analysis

Analysis strictly separates facts, attributed evidence, interpretation, possible scenarios and invalidation. Missing evidence produces an explicit insufficient-data result. Scenarios are labeled as possibilities, never predictions. Funding, OI, ETF, whale, liquidation, macro, structure, momentum, trend, volatility and correlation observations can be supplied as attributed evidence points. Forex and MT5 use the same neutral evidence contract when their future providers supply observations.

## Template catalog

The catalog includes morning, midday, evening, weekend and weekly briefings; pulse, calendar, watchlist and digest; ranked/breaking news; asset/regime/funding/OI/structure commentary; signal explanations; all requested lifecycle states; daily through customer reports; beginner and professional education; complete customer lifecycle messages; and operational/admin communications.

Performance templates must consume existing canonical reporting outputs. They must not derive win rate, P&L, execution, delivery or customer totals from Telegram records.

## Scheduling and publishing

Existing scheduling invokes content generation. Approved records may transition to `scheduled`; a worker claims due records and passes `rendered_text` to the ROOT router. `published_at` is written only after accepted router delivery. Test publication must target the admin channel and record `test_published` history. Deployments should avoid fixed-interval browser polling.

## Deployment

1. Apply `20260722010000_phase6_professional_content.sql` after existing migrations.
2. Deploy shared Edge Function sources through the existing deployment script.
3. Verify Telegram bot and admin/free/VIP chat secrets already required by ROOT routing.
4. Configure licensed news/feed endpoints; absent feeds must remain unavailable rather than synthesized.
5. Run typecheck, build, Edge Function static checks and Phase 6 tests.

## Production-readiness decision

The code-level Phase 6 content domain is deployment-ready and the Telegram foundation is preserved. Production certification remains conditional on migration application, licensed production feed configuration, secret verification, a live admin-channel test publication, and observed scheduled delivery. Future Forex and MT5 content is contract-compatible but must not be published until their attributed data feeds are enabled.
