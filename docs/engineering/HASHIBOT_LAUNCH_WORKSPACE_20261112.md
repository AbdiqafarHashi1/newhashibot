# HashiBot launch workspace — 12 November 2026

Continuation of PR #271 over published head `dd7006d252eb865e7a2e2956ecde385bb035e5ff`. Mission 2 remains in progress. No production deployment, strategy promotion, payment, Telegram message, schedule or provider order is performed by this change.

## Completed application changes

- `/admin/launch` now presents the nine service journeys, their owning configuration pages, observations and concrete next steps. Missing queries remain unavailable, old observations expire, and a recorded failed run is not described as a healthy service. A bounded request can be refreshed without a stale response overwriting newer state.
- `/admin/research` is a primary navigation destination, reusing the existing genuine compressed evidence. It links data acquisition, scanner replay, calibration, providers and exports. The old redirect is replaced rather than duplicated.
- Research diagnostics separate candidates, confirmations, account entries, closed outcomes, fees, gross/net P&L, exit reasons and missing-history checks. Whole-account and symbol/track scopes are explicitly distinguished. Older evidence without new fields remains blank.
- Public Home, Signals and Features explain the actual product and lifecycle. Free/VIP/Execution retain their existing purchase/onboarding paths and prices. Hard-coded provider-live claims, fabricated strategy grades and unsupported performance aggregates are removed from the affected pages. Backend financial authorizations are unchanged.
- `/results` uses the published historical index, shows losing results and undefined metrics, and provides venue/entry filters, periods, cost assumptions and retry handling. It makes no customer-account performance claim.
- Owner Preview distinguishes published historical research from simulated account fixtures instead of stamping genuine archive studies as demonstration evidence. It can read only specifically named same-origin static Mission 2 research files. API access, provider calls, writes and external destinations remain blocked. Duplicate route entries are removed.
- The PWA no longer serves a stale cached research index/study after an update; research requests bypass its cache. A regression test exercises the actual worker handler.
- Local development accepts the preview host/port and uses the Node TS loader without a CLI IPC socket. Production Netlify remains a static build.

## Verification

- Application TypeScript and production web build passed. Existing large bundle warnings remain.
- All 33 Mission 2 tests passed.
- Ten targeted account-ledger and service-observation tests passed; six preview isolation/admin-shell tests passed; the owner-preview suite and purchase journey contracts passed. The complete operations readiness suite passed: 119 TypeScript, 22 database and 8 Python tests.
- Admin surface inventory passed (72 routes / 140 surfaces).
- Shared Chrome walkthrough verified the homepage, public evidence table and entry filter, admin navigation, unavailable-service display, compressed evidence loading and account-scenario changes. Connected backend behavior is not established by preview.
- The first CI browser run passed the admin research journey on desktop and phone, and exposed stale PWA evidence caching plus an obsolete copy-only assertion. Both were corrected; the public test now explicitly controls its network-failure condition and the customer test verifies checkout authentication rather than a marketing word.
- All 18 desktop/phone Release 1 browser checks passed on commit `b30d5c8`. Native PostgreSQL 15/17 rehearsal and lint passed on that commit. The additional published-research labeling regression must be read on the final head.

## Remaining engineering and activation

| Work | Concrete completion evidence |
| --- | --- |
| Improve strategies | Longer independent periods, recorded bounded hypotheses, adverse-cost tests and measured improvements in net outcomes; no profitability claim from tiny samples. |
| Hosted full-account research | Queue submission, canonical research authorization, atomically persisted account/funnel state, forced yield/restart and result exports through the existing worker. The current hosted canonical job remains policy-only. |
| Forex/Gold research | Genuine broker bid/ask, contract specifications and adequate tick granularity for rapid Gold. Existing indicative data does not replace this. |
| Bybit historical execution | Native venue specifications and fill/cost evidence; Binance prices under Bybit policy remain a controlled counterfactual. |
| Backend activation | Restore the existing Supabase project, reconcile its actual migration ledger and deploy the exact candidate functions before activating its schedules. |
| Owner demos | Connect Binance testnet, Bybit demo and MT5 demo; record authorized entry, native protection, closure, reconciliation and expiry behavior. |
| Customer service | Complete payment → entitlement → Telegram admission, renewal, expiry/removal and recovery; rehearse authenticated signup and onboarding on phone and desktop. |

Supabase project `uqiwbzfcntlcyyewawfc` was checked through the connected management API on 12 November and returned `INACTIVE`. It was not restored into an unknown old runtime. Credentials and merchant configuration are not present in this change. The domain and hosting remain unchanged.

## Completed policy comparison

Three ten-symbol, seven-day runs completed on the same source hash with January/February history and separate Binance/Bybit policy scenarios. Combined: 78 signals, 29 entries, -2.477% equity return. Immediate-only: 86 signals, 30 entries, -2.649%. Conditional-only: two signals and zero account entries. These results do not establish profitability. The compact published index contains 15 studies, including the original twelve, and all study/account payload checksums and links were checked. See `../research/mission2/WARMUP_POLICY_COMPARISON_20261112.md`.
