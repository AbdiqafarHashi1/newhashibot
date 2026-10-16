# PR #259 deletion review

Compared GitHub PR #259 at a21c8eb against main de55838. GitHub reports 10,867 deleted lines across 157 changed files, with zero file removals; this is not 10,760 deleted backend features. The biggest reductions replace separate admin implementations with shared components. However, the earlier replacements were too thin in places. Financial detail and structured parameter guidance have been restored in this follow-up.

| Old page | Lines removed in reviewed patch | Retained/replacement | Removed behavior |
| --- | ---: | --- | --- |
| StrategyConfig | 1,508 | Persisted configurations, all saved identities, thresholds, timeframes, raw parameters; restored market/enabled filters and structured fields/help for existing parameters | Local timer boosted AI score without backtest; champion templates could promote themselves |
| Risk | 1,371 | AccountPolicyOperations, canonical account Brain edits, stop/reconcile links; restored account financial evidence, decision history and incidents | Shared provider wallet attributed to fabricated system account; independent policy mutation |
| CustomerFleetOps | 1,322 | Existing OnboardingOperations, real customer drill-down, command history, canonical stop/reconcile authority | Browser execution-order inserts and direct legacy bot controls |
| Capital | 1,253 | Same account-specific capital/policy surface; restored financial and plan evidence | Hard-coded customer, invented reserves and fallback allocations; unrealized P&L relabelled daily/weekly P&L |
| Customers | 1,125 | Real profiles, canonical commerce, Telegram, provider/account drill-down | Browser-created subscriptions and execution enablement through legacy setup rows |
| AIAgentsCommand | 922 | Existing persisted agent/editorial job controls and portable worker controls | Calls to retired browser-authored AI endpoints |
| PropTradingPanel | 891 | Existing ProfessionalPropWorkspace and 100-window Backtest Lab; historical accounts remain a read-only archive | Legacy manual governor overrides and shared wallet assumptions |
| Execution | 878 | Canonical customer/provider setup and account policy surfaces | Browser execution toggles and unverified MT5 row creation |
| AccessRequests | 391 | Historical receipt/support archive and canonical commerce navigation | Receipt review as a paid-entitlement grant |
| Modes | 301 | Per-account Personal/Prop policy and actual strategy permissions | Independent global-account mode policy |
| UsersAccess | 226 | Same canonical customer operations surface | Duplicate customer/access editor |
| ManualSignal | 148 | Research/backtest route | Direct production signal insertion |

No public conversion page, approved pricing, registered production evaluator, historical database row, previous migration or existing cron definition is removed by these replacements. Database feature deletion was not used to reduce the patch. Retired unsafe actions are intentional behavior changes, not claims of UI parity.

## Restored detail

The account detail handler checks the server-held admin role and customer/account ownership. Financial reads use exact account/instance provider proof or verified owned MT5 mapping. Unknown numbers remain null. There is no execution_settings/global-wallet fallback. Balances, equity, available margin, unrealized P&L, recent Phase-D decisions, recorded plans and crypto protection/reconciliation incidents are visible under account controls. Historical or absent evidence is labelled by its observation timestamp; this is not a live financial feed certification.

Bybit available margin no longer uses deprecated availableToWithdraw/availableToBorrow fields. Account-level USD totals are stored separately from the existing USDT coin fields; unavailable cross/portfolio-margin totals remain unknown. See https://bybit-exchange.github.io/docs/v5/account/wallet-balance.

Strategy descriptions are editor guidance from the preserved metadata library. Structured controls only edit numeric parameters already present in the saved row. They do not install templates, manufacture metrics or certify an evaluator. Raw JSON remains available for other recorded parameters.

## Still required

The continuation adds bounded account-scoped provider outcome collectors and a canonical history loader with behavioral/database tests. The durable producer core and history consumption are now implemented and tested. Automatic assembly/publishing of complete observed provider policy context remains an integration blocker. Strict frontend typecheck now passes; no compiler checks were disabled. Remote Supabase, genuine providers and authenticated phone/desktop review remain unverified. Do not treat conflict-free as deployment approval.

## Growth and agent follow-up

The original Agents replacement did not preserve an effective evidence selector or campaign selection when queueing a job. Those controls are now added, along with saved campaign/destination editing, destination enablement, job pause/resume/cancel controls, visible partial-data failures and persistent success messages. Exact draft approval now queues delivery atomically and is idempotent; it cannot reset an in-flight delivery. Account finance reads now include the routing alias and current credential binding.

`/admin/growth-goal` has a dedicated task: track 1,000 distinct current paying customers across VIP Signals and Founding Auto Execution. Its service-only whole-database aggregate excludes trials, expired/revoked entitlements, missing verified payment references and duplicate products. Telegram link gaps, confirmed members, fulfillment backlog, agent approvals and uncertain deliveries are separate measures. The aggregate is tested with 1,201 people and duplicate entitlement rows, exceeding the UI's 100-row lists. This is an acquisition/activation overview, not an outreach CRM or proof of 1,000 customers acquired.

Customer directory, fleet, execution readiness and access routes now state their specific operational purpose while sharing canonical support reads. This source review does not certify every control on all 70 admin routes.

The connected Supabase project `uqiwbzfcntlcyyewawfc` reported INACTIVE during read-only inspection on 2026-10-16. No migration, deployment, live message or trade was submitted by this follow-up. Automatic complete provider policy-context assembly remains unfinished, as does an integrated outreach CRM/provider workflow. Legacy `customer-provisioning` still contains manual-review activation and a separate runtime-control path; it requires replacement with canonical verified-payment/readiness authority before claiming end-to-end onboarding. The new admin surfaces do not call its activation action.
