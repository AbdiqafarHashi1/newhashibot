# PR #259 deletion review

Compared GitHub PR #259 at b661bab against main de55838. About 10,760 deleted lines were reported; this is not 10,760 deleted backend features. The biggest reductions replace separate admin implementations with shared components. However, the earlier replacements were too thin in places. Financial detail and structured parameter guidance have been restored in this follow-up.

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
