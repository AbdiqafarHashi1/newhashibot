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

Release1 schedule installation now includes scanner, outcomes, canonical reporting, commerce recovery, membership, intelligence and the acquisition worker. They install paused. Acquisition quiet-hour/frequency waits reschedule without burning send attempts; confirmed retryable responses resume on the same delivery identity. Uncertain submissions remain held for reconciliation. Existing internal secrets required by these workers are shown through setup checks; retain them rather than rotating unnecessarily. Starting schedules can process queued work.

After credentials and restored services are available, the operator still performs deployed smoke checks: channel identity/permissions, bot webhook, one setup lifecycle, Free/VIP isolation, a controlled payment→entitlement→two-channel membership lifecycle, renewal/expiry/removal and one approved partner delivery. Those checks cannot be completed against an inactive project or absent payment configuration. Setup fields are not proof of successful delivery.

## Verification boundary

Backend channel changes use service-only, administrator-scoped compare-and-set RPCs. Channel identities are separate across audiences. Identity changes clear permission verification and invalidate default-destination approvals. Free/Admin publishers read saved mappings and preserve legacy environment mappings only until a saved chat ID exists. Split VIP never falls back to a shared room. An unavailable backend produces unavailable state, not healthy empty data.

Local SQL tests exercise >1,000-customer counts, duplicate exclusion, channel mutation fences, audience separation and role denial. Browser tests use intercepted fixtures and an admin presentation shell, never actual backend authorization, credentials, payments or posts. Native migration and real provider rehearsals are separately reported in PR269.
