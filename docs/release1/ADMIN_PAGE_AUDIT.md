# Release 1 Admin page purpose audit

## Daily work: seven pages

| Page | Purpose | Owns |
| --- | --- | --- |
| `/admin/launch` | Activation and readiness | Checklist, recorded backend status, links to owning controls |
| `/admin/scanner` | Data and scanner operation | Activity/health, links to scanner settings, strategies and paper watches |
| `/admin/strategies` | Strategy configuration | Actual named evaluator settings and enabled state |
| `/admin/telegram` | Telegram service | Channels, content/agents, paper setups, learning, memberships, delivery, schedules |
| `/admin/customers` | Customer support | Search/pagination across all registered accounts, Free/VIP evidence, manual 30-day grant, personal link recovery |
| `/admin/commerce` | Payment operation | M-Pesa/Whop configuration, payment evidence and recovery |
| `/admin/growth-goal` | Acquisition | Two goals, prospects, follow-ups, campaigns and renewal links |

Advanced tools retain research, provider/execution account readiness, risk, positions, diagnostics, recovery and audits. They are not removed or automatically activated. Scanner diagnostics are collapsed on the Scanner page. The existing owner MT5 feed remains linked from Scanner.

## Consolidated duplicate routes

| Previous entry | Canonical destination |
| --- | --- |
| `/admin/onboarding`, `/admin/users`, `/admin/access-requests` | `/admin/customers` |
| `/admin/operator/telegram`, old Telegram links/test/requests | Telegram Hub and the appropriate tab |
| `/admin/operator/settings` | `/admin/scanner-config` |
| `/admin/checklist` | `/admin/launch` |
| `/admin/strategy-config` | `/admin/strategies` |
| `/admin/mission` | `/admin/mission-control` |
| `/admin/control-room` | `/admin/operator` (advanced operator diagnostics) |
| `/admin/customer-engines`, `/admin/fleet` | `/admin/customer-fleet` (execution readiness) |
| `/admin/signals` | `/admin/operator/signals` |
| `/admin/reporting` | `/admin/performance` |
| `/admin/scheduler` | Telegram Hub → Schedules |
| `/admin/retention` | Growth Funnel → Payments & renewal |
| `/admin/arbitrator` | `/admin/candidates` |
| `/admin/signals/new` | Telegram Hub → recorded setups |
| `/admin/runtime` | `/admin/runtime-truth` |
| `/admin/bridge` | `/admin/visual-bridge` |
| `/admin/providers/comparison` | `/admin/provider-comparison` |

Old URL redirects preserve authorization. Old source files/history are retained; obsolete receipt approval and execution-account forms are not the Release 1 access authority.

## One customer journey

1. Sign up or sign in through `/free` or `/vip`.
2. Successful Free enrollment or verified checkout continues to `/app/onboarding`.
3. That page shows current access, Telegram linking and channel membership in three steps. Owner-approved manual access uses the same page and same entitlement authority.
4. `/app/telegram` resolves the current bot on the server, creates a customer-scoped token through the existing RPC and opens the bot. The customer presses Start, receives personal invitations and requests to join.
5. The existing membership worker confirms each channel independently. Refreshing onboarding displays actual joined state. Billing shows provider subscriptions separately from owner allowances.

Customers do not need execution-provider questions to receive signals. The existing execution wizard remains at `/app/execution-onboarding`; execution-specific links point there. The old `/app/package-request` and `/vip/complete` URLs lead to the canonical VIP/onboarding flow. Account-profile workflow instructions link to the onboarding page instead of repeating a manual-admin approval process.

Admin support is intentionally separate from customer self-service: an owner can grant a registered account 30 days or recover a stuck personal Telegram link. Telegram Hub links to this one support form. It does not contain another grant/recovery editor.

## Deployment verification

The local CLI help confirms `db push --linked --dry-run`, `functions deploy --project-ref --use-api --jobs` and migration-list support. The 195 automatic migration identities are unique. The unchanged native PostgreSQL 15/17 migration-chain rehearsals and all function dependency bundles are checked in CI. Existing deployment runner checks reject a wrong project, changed migration bytes or an unreadable/different dry-run list and preserve function JWT settings.

Actual remote `db push`/function deployment still follows restoration and comparison of the existing project's migration ledger. No database reset, secret replacement or activation is part of this UI audit. Frontend deployment is separate from those backend commands. Browser fixtures prove navigation/presentation only; actual customer/payment/membership receipts are verified after restoration.


## Browser endpoint audit

The installed Supabase JavaScript client is exercised with a captured fetch in the operations tests. Browser-facing launch endpoints allow its real request headers, including `apikey` and `x-client-info`; Free enrollment also allows its idempotency header. Telegram membership reconciliation now answers OPTIONS before authentication, includes CORS on responses and keeps authenticated Admin/worker checks on POST. This fixes a browser transport problem without changing permission or entitlement authority. Payment recovery remains owned by the provider panel; the duplicated membership metric/reconcile block was removed from Payments.
