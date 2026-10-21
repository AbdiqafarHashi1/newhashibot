# Release 1: Signals VIP — launch gate (2026-10-21)

**Scope:** scanner → canonical signal → FREE/VIP Telegram → verified payment → entitlement → access/renewal/revocation. No auto-execution expansion.

## Evidence at kickoff
- PR #260 and #261 merged; PR #262 open and not approved for production.
- Crypto calibration (docs/research/SCANNER_CALIBRATION.md) failed validation/holdout and stressed-cost gates. Do not enable adaptive policy or promote its losing configuration.
- PR #262 reports Forex and leverage research failing economic promotion. Do not merge solely to enable strategies; separate correctness fixes and retest.
- Commercial runbook currently describes **manual M-Pesa approval**, not fully automated Daraja settlement. Whop payload/signature verification is a deployment blocker until validated.
- Telegram commercial runbook explicitly says production cron is not enabled; expiry/revocation reconciliation therefore needs verified scheduling and operator alerts.

## Acceptance checklist (all required before paid public launch)
- [ ] Confirm Supabase project is active; compare migration ledger; apply only reviewed missing migrations.
- [ ] Confirm scanner scheduling, fresh data, no duplicate signals, durable signal truth and admin failure visibility.
- [ ] Promote no strategy without a predeclared untouched holdout, cost-stress pass and controlled forward evidence. Publish no profit claims from research.
- [ ] Test Telegram router FREE, VIP, ADMIN and TEST channel isolation, idempotency, retry and dead-letter paths.
- [ ] Test customer signup → payment evidence → pending → **verified** approval/settlement → ACTIVE entitlement → Telegram numeric-ID link → private invitation.
- [ ] Test denied, duplicate, late, revoked, expired, renewed and restored access; schedule bounded reconciliation and alert on failure.
- [ ] Test Whop signed webhook or manual M-Pesa approval path end to end; never treat browser redirect or screenshot alone as settled payment.
- [ ] Run staging tests with test customers/channels, then production smoke checks; record timestamps and evidence links.
- [ ] Confirm support, refund policy, honest performance disclosures, and launch owner sign-off.

## Release rule
A functional paid VIP path and a strategy-performance gate are **independent**. Payment/Telegram plumbing may be deployed while trading qualification stays disabled. Public launch must not promise profitable or timely signals if none pass.

## Deferred
MT5/Binance/Bybit customer auto-execution, bridge installers, prop challenges and new account-brain features.
