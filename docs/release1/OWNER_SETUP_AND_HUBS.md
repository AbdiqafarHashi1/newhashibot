# Release 1 owner setup and two admin hubs

## Main pages

- `/admin/telegram`: Telegram Hub. Channels & health; content/destinations; setups & follow-ups; members/access; delivery/recovery; schedules. Historical Telegram links/requests/test routes redirect to the matching hub section.
- `/admin/growth-goal`: Growth Funnel. Separate goals for 1,000 recorded confirmed Free channel members and 1,000 current verified-paying VIP Signals customers; prospects/follow-ups; campaigns/acquisition; payment connections and renewals. Historical Agents Hub routes open the campaigns tab.

Free enrollments are displayed separately from confirmed Free members. A VIP customer counts once even when present in both paid channels. Execution products, trials, manual grants, expired entitlements and duplicate rows do not increase paid progress. Last-30-day acquisition activity is separate from current goal totals.

## Owner inputs

1. Restore the existing Supabase project `uqiwbzfcntlcyyewawfc`, preserving its database, Vault and existing secrets. Do not create a replacement project or reset it.
2. Telegram: confirm existing Free/Crypto/Admin mappings and supply Forex/Gold VIP's numeric channel ID or @username. Save in Channels & health, then verify and enable. Subscriber bots need post/invite/approve/remove permissions; Admin needs posting. Use the explicit test button for actual delivery. Register the membership webhook from this page once bot and webhook secrets are present.
3. M-Pesa: approved Till/Daraja business pairing, consumer key/secret, business shortcode, Express passkey and receiving Till. Enter these in Growth Funnel → Payments & renewal. Sandbox first; preserve existing secrets by leaving unchanged secret fields blank.
4. Whop: company/account ID, API key, webhook signing secret and USD29 recurring monthly VIP plan ID, entered in the same payment panel.
5. AI: supported Gemini key in the server secret store; choose the actual model and monthly budget in the content/acquisition role settings. Bot/webhook/worker/AI configuration presence is visible in Telegram Hub without exposing secrets.
6. Partner Telegram destinations: IDs/@usernames and permission for the bot to publish. Configure and verify in Telegram Hub → Content & destinations. Approved evergreen education/upgrade posts may repeat daily for up to30 days.
7. Meta/TikTok: owner-run promotion and manual social content exports. Native automatic posting to other social APIs is not supplied merely by adding credentials, and is not required for this Release1 Telegram acquisition path.

## Deployment and activation after those inputs

The reviewed integration PR must be merged/deployed to make these pages public. Its existence is not production activation. Reconcile the restored project's applied migrations before `supabase db push`; preserve the repository's function JWT configuration when deploying functions. No production reset or blanket JWT disable.

Release1 schedule installation now includes scanner, outcomes, canonical reporting, commerce recovery, membership, intelligence the acquisition worker and an independent one-minute conditional watcher. They install paused. Acquisition quiet-hour/frequency waits reschedule without burning send attempts; confirmed retryable responses resume on the same delivery identity. Uncertain submissions remain held for reconciliation. Existing internal secrets required by these workers are shown through setup checks; retain them rather than rotating unnecessarily. Starting schedules can process queued work.

After credentials and restored services are available, the operator still performs deployed smoke checks: channel identity/permissions, bot webhook, one setup lifecycle, Free/VIP isolation, a controlled payment→entitlement→two-channel membership lifecycle, renewal/expiry/removal and one approved partner delivery. Those checks cannot be completed against an inactive project or absent payment configuration. Setup fields are not proof of successful delivery.

## Verification boundary

Backend channel changes use service-only, administrator-scoped compare-and-set RPCs. Channel identities are separate across audiences. Identity changes clear permission verification and invalidate default-destination approvals. Free/Admin publishers read saved mappings and preserve legacy environment mappings only until a saved chat ID exists. Split VIP never falls back to a shared room. An unavailable backend produces unavailable state, not healthy empty data.

Local SQL tests exercise >1,000-customer counts, duplicate exclusion, channel mutation fences, audience separation and role denial. Browser tests use intercepted fixtures and an admin presentation shell, never actual backend authorization, credentials, payments or posts. Native migration and real provider rehearsals are separately reported in PR269.

## Crypto and Forex/Gold watch lifecycle

Engineering parity is implemented in the integration branch; the earlier Crypto-only conditional gap was implementation work, not an owner-input blocker. Live operation is separately unverified until deployed data and delivery checks run.

The independent `conditional-watch` worker visits all 32 asset/timeframe streams every minute: ten Crypto assets and EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, XAUUSD, each on 15m Intraday and 1h Swing. Discovery respects the market toggles and `CONDITIONAL_SIGNALS_ENABLED` (enabled unless explicitly FALSE). Existing open plans remain managed when discovery is paused. Scanner admission failures/throttles do not disable this worker. Fixed-universe scanner budgets default to all 16 assets in conditional mode; explicit smaller budgets fail visibly.

A conditional setup freezes its originating strategy/variant, price plan, context-validation parameters, source, cost reserve and expiry. The watcher checks the original thesis and closed-candle trigger, cancels invalidated/expired watches, checks the next observed open and chase limit, then tracks 50% TP1 and remaining TP2, original stop and time stop. A mutable bar contributes only its open; outcomes use completed candles. Same-candle ambiguity uses the stop first. Restart/retry uses current database state and version-fenced atomic history/outbox writes.

Forex/Gold has independent throughput/capacity and a separate daily Free sample selected before its outcome. Market-specific VIP routing is enforced by both outbox and delivery worker. Free samples retain their own subsequent lifecycle, analysis and upgrade invitations. General source-backed news/analysis is stored as intelligence evidence; it is not represented as an entered paper trade. Intelligence can reference the recorded live setup IDs, with only sampled references exposed to Free.

Crypto uses a frozen 25bps paper cost reserve; Forex/Gold uses a disclosed pip reserve, excluding unobserved swaps. These are models, not broker spread/fill claims. Known New York weekly FX closure and Gold daily maintenance are handled separately from unexplained gaps; broker holidays are not assumed. A confirmation into a closure cannot obtain a later invented next-open entry.

Feed failures persist monotonic asset health and an Admin-only incident with affected setup references. Missing candles or source changes cannot generate assumed outcomes. The Setups & follow-ups tab shows each market/track, strategy history and 32-stream health, including stale watcher timestamps. The owner can connect the existing dedicated MT5 data feed once Supabase is restored; no customer execution terminal is adopted as the scanner source.

## Named strategy intelligence and scalp extension

The watcher now runs 48 base asset streams (5m, 15m, 1h across the 16 assets). Configured additional supported frames and previously open setups are retained. The scanner and independent watcher share the actual named evaluator catalog and conditional adapter. See `STRATEGY_WATCH_COVERAGE.md` for the precise publication boundary.

Ten primary evaluator strategies are connected to their own original plans, with 20 additional research definitions included in coverage diagnostics. Enabled database configuration is respected; no missing row is treated as permission to enable a named strategy. Existing broad conditional Intraday/Swing profiles continue alongside named candidates. Per-asset arbitration, opposing-direction holds and separate track capacity still apply.

The Setups & follow-ups page now includes Scalp totals, named-strategy coverage and source/original-plan inspection. Context snapshots at admission and confirmation preserve source IDs and distinguish unavailable news or stale quotes from known observations. The applied paper holding limit uses the evaluator-reported limit when present, otherwise the configured limit; both the original plan and applied frozen limit are retained.


## Four-hour Free guide and manual 30-day VIP

Telegram Hub → Content & destinations has a four-hour upgrade/explainer preset. Enable the Growth role, select an active campaign pointing to `https://hashibot.app/vip` and a verified Free Telegram destination, preview the six English/Somali messages and enable. Six exact templates have staggered four-hour first runs and daily repetition. The existing five-minute agent worker handles delivery, retries, identity fences and destination policies; no extra cron or AI key is needed for this preset. The selected editorial destination is set to at least 240-minute spacing, so quiet-hour backlogs cannot burst promotional posts. This applies to other editorial jobs on that destination; canonical signal updates use their own queue. Configured quiet hours or delivery delays can defer posts. Standing bindings expire after 365 days (366 uses/template); re-enabling replaces the old program, and Pause cancels its jobs/revokes approvals. No invented deadlines, scarcity, live prices or performance claims are generated.

Telegram Hub → Members & access has **Manual VIP · 30 days**. The customer must first create a normal account through `/free`. Enter their exact account email and a reason/reference, then grant and copy the personal onboarding link. This creates an audited canonical manual entitlement with a 30-day end date and both VIP fulfillment requests. Retries retain existing current access rather than adding another 30 days. It creates no provider payment and does not increase the verified-paying customer goal. The existing membership authority, expiry/removal worker and Telegram identity binding apply. No public or ordinary-customer manual grant endpoint is exposed.

Invalidation cancels an unfilled setup; it does not itself open an opposite trade. A reversal must qualify under its own strategy and receive its own reference and confirmation/entry history. Completed-candle, context and chase checks remain in place. The existing strategies do not universally require a retest; the strategy-specific plan owns that requirement.

Subscriber copy rejects recognizable technical diagnostics at intelligence generation, generated-draft validation, canonical rendering and editorial transport. Upstream failures stay in operational evidence; a broken source cannot be turned into customer analysis. This is a guard against known diagnostic output, not a claim that outages are impossible.

## Activation checklist (owner and operator)

1. Owner: resume the existing project `uqiwbzfcntlcyyewawfc` without resetting it or replacing its Vault/secrets. It reported INACTIVE at the latest check on 30 October 2026.
2. Operator: merge the reviewed integration branch, release the frontend and compare the restored database migration ledger. Deploy from this exact source checkout, linked to the existing project. `supabase db push` and `supabase functions deploy` apply the backend; do not add a blanket JWT-disable flag. Preserve all existing configuration and credentials.
3. Owner: save/verify Free, Crypto VIP, Forex/Gold VIP and Admin channel identities in Telegram Hub. Give the bot the necessary post/invite/approve/remove permissions. Register the membership webhook and use explicit real-channel tests.
4. Owner: connect the dedicated MT5 feed for continuous Forex/Gold candles and quotes. Check each asset/timeframe health before advertising continuous Forex coverage. Crypto uses the recorded configured exchange source.
5. Owner: enter the approved M-Pesa Till/Daraja pairing and Whop $29 monthly plan in Growth Funnel → Payments & renewal. Verify/enable only matching product configurations. Secret fields stay in the authenticated setup screens/server store.
6. Operator with owner: run one actual payment → account entitlement → personal bot link → join/approval for both VIP rooms, plus renewal/expiry/removal and one manual 30-day grant. Existing fixture/provider tests passed; real deployed receipts are still required.
7. Operator: install Release 1 schedules paused, check secret presence and worker authorization, then activate the scanner, conditional watcher, intelligence, canonical delivery, membership, payment recovery and acquisition jobs. Check fresh heartbeats and one real setup lifecycle with audience isolation. Existing open paper plans continue when discovery is paused.
8. Owner: enable the Free four-hour guide and approved partner destinations. Share `/free` and `/vip` with campaign attribution in Meta/TikTok promotion. Automated partner Telegram publishing requires bot permissions; other social networks remain manual exports in this release.

The live `/free` and `/vip` URLs could not be independently fetched by the web tool during this check. Source routes and browser fixtures are verified separately; a successful frontend deployment and real public-route smoke check remain part of activation.
