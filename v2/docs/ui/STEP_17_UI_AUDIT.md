# Step 17 V2 UI Audit and Architecture

## Repository validation

All Step 17 implementation lives under `/v2`. The root React app remains legacy reference material only.

## Root app UI audit

| Area | Examples audited | Classification | Why |
|---|---|---|---|
| Public pages | `src/pages/public/Home.tsx`, `Pricing.tsx`, `Results.tsx`, `FAQ.tsx`, `SignalMode.tsx`, `PersonalEA.tsx`, `PropEA.tsx` | Reuse & Improve | Marketing structure, pricing/results/FAQ flows are useful, but V2 needs clearer platform boundaries and MT5/prop/research items must not be implemented as live V2 functionality. |
| Auth pages | `src/pages/auth/Login.tsx`, `Register.tsx`, `AdminSetup.tsx`, `src/contexts/AuthContext.tsx` | Reuse & Improve | Basic login/register/session ideas are useful; V2 adds role-aware redirects, pending, suspended, expired states, and strict admin/customer route guards. |
| Customer dashboard | `src/pages/app/Dashboard.tsx`, `Account.tsx`, `PackageRequest.tsx`, `TelegramSetup.tsx` | Reuse & Improve | Customer overview and package request flows inspired V2 descriptors; implementation is replaced so it uses V2 API boundaries and supports M-Pesa/account/executor/protection state. |
| Admin dashboard | `src/pages/admin/ControlRoom.tsx`, `Customers.tsx`, `UsersAccess.tsx`, `ProviderHealth.tsx`, `Execution.tsx`, `AuditLogs.tsx` | Reuse & Improve | Strong operator concepts are retained, but V2 separates engine health, queue health, protection, payment review, Telegram manager, and executor actions. |
| Package/subscription | `Pricing.tsx`, `PackageRequest.tsx`, `UsersAccess.tsx` | Reuse & Improve | Package flow remains, with manual M-Pesa review and subscription activation moved behind platform API actions. |
| Provider/account pages | `BinanceOperations.tsx`, `BybitOperations.tsx`, `ProviderOperationsWorkspace.tsx`, `ProviderComparison.tsx` | Inspiration Only | V2 UI must not call Binance/Bybit directly; it presents account setup references, permission warnings, status, and admin setup requests only. |
| Signal pages | `ActiveSignals.tsx`, `SignalHistory.tsx`, `SignalDetail.tsx`, `SignalsManager.tsx` | Reuse & Improve | Signal history/detail UX is useful; V2 includes strategy, grade, confidence, entry, SL/TP, and reason codes via platform read models. |
| Trade pages | `Execution.tsx`, execution reports/tests | Inspiration Only | V2 displays trade execution/protection/closed result state but does not import or mutate trading logic. |
| Monitoring pages | `ScannerStatus.tsx`, `ProviderHealth.tsx`, `Performance.tsx`, `OutcomeTracking.tsx` | Reuse & Improve | Monitoring concepts map to V2 engine, HashiCore, queue, worker, provider, protection, recovery, and alert dashboards. |
| Telegram pages | `TelegramSetup.tsx`, `TelegramLinks.tsx`, `TelegramLogs.tsx`, `TelegramTest.tsx` | Reuse & Improve | V2 keeps setup/log/test concepts and limits default channels to FREE, VIP, and ADMIN_OPS. |
| Components/layouts | `src/components/layout/*`, `src/components/ui/*`, `src/components/guards/RequireAuth.tsx` | Reuse & Improve | Layout, badges, stat cards, guards inspired V2 reusable descriptor components in `/v2/packages/ui`. |
| Hooks | `src/hooks/useAdminLiveState.ts` | Inspiration Only | Live-state idea is useful; direct V1 data assumptions are replaced by V2 API client boundaries. |
| Styling/theme | `src/index.css`, `tailwind.config.js` | Inspiration Only | Premium SaaS visual direction is reused conceptually; no root style files were modified. |
| Supabase patterns | `src/lib/supabase.ts`, `src/lib/supabaseEnv.ts` | Replace Completely | V2 UI consumes platform API contracts and must avoid direct raw V1 Supabase table access. |
| Exchange/trading libraries | `src/lib/exchange/*`, `src/lib/binanceTruthExecution.ts`, trade management libs | Replace Completely | Forbidden in UI. Trading/exchange logic stays out of `/v2/apps` UI. |

## V2 UI architecture

- `/v2/apps/web-customer` exports public and customer route descriptors, session guard helpers, account setup forms, M-Pesa forms, customer dashboards, signal/trade views, and status states.
- `/v2/apps/web-admin` exports admin route descriptors, guard helpers, M-Pesa review actions, Telegram manager, executor detail/actions, monitoring/protection, and system settings.
- `/v2/packages/ui` provides serializable reusable component descriptors for page headers, metrics, badges, forms, tables, cards, empty states, banners, and shell layouts.
- `/v2/packages/mock-data` remains a mock API adapter used for tests and local UI descriptors until live platform read APIs are wired.

## Reuse decisions

V2 reused concepts from the legacy UI, not root implementation. The replacement avoids V1 Supabase reads, direct Binance/Bybit imports, trading engine imports, MT5 implementation, Research Lab, and deployment UI.

## Remaining gaps

- Descriptors are ready for a renderer, but a full browser runtime/bundler is still future work.
- Real backend read endpoints for every dashboard card should replace mock adapters when platform APIs are certified.
- MT5 remains a future placeholder only.
