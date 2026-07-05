# 17 Migration Matrix

| V1 component/file/module | Current purpose | Classification | Target V2 destination | Reason | Dependencies | Risk | Reuse notes | Implementation notes |
|---|---|---:|---|---|---|---|---|---|
| package.json | Build/test scripts and dependencies | MODERNIZE | /v2/package.json | Useful baseline | Vite/TS/ESLint | low | Keep patterns | Split workspaces |
| src/App.tsx | Routing shell | MODERNIZE | /v2/apps/* | Good route inventory | React Router | medium | Recreate routes | Separate customer/admin |
| src/components/layout/* | Public/app/admin layouts | MODERNIZE | /v2/packages/ui | Reusable UX | React/Tailwind | low | Port after design | Decouple data |
| src/components/ui/* | UI primitives | KEEP | /v2/packages/ui | Generic | Tailwind | low | Keep style ideas | Add design tokens |
| src/contexts/AuthContext.tsx | Auth/profile state | MODERNIZE | /v2/apps/*/auth | Needs V2 roles/approvals | Supabase auth | medium | Concept only | Add account/executor scopes |
| src/pages/public/* | Marketing pages | MODERNIZE | /v2/apps/customer-web/public | Product copy exists | Router/UI | low | Reuse structure | Update positioning |
| src/pages/auth/* | Login/register/admin setup | MODERNIZE | /v2/apps/customer-web/auth | V2 approval/signup changes | Supabase auth | medium | Reuse flow ideas | Add package/trial gates |
| src/pages/app/* | Customer dashboard/signals/account | MODERNIZE | /v2/apps/customer-web | Product-aligned screens | Supabase tables | medium | Reuse UX | New APIs/snapshots |
| src/pages/admin/* | Admin operations | MODERNIZE | /v2/apps/admin-web | Rich operational UI | Supabase raw tables | high | Use as prototype | Rebuild data contracts |
| src/hooks/useAdminLiveState.ts | Admin live polling | REWRITE | /v2/apps/admin-web/api | Reads many raw tables | Supabase | high | Summary list reference | Use monitor snapshots |
| src/lib/supabase*.ts | Client config | MODERNIZE | /v2/packages/supabase-client | Useful env handling | Supabase | low | Keep guard ideas | No secrets in repo |
| src/lib/customerAccess.ts, packages.ts, botSetup.ts | Customer/package helpers | MODERNIZE | /v2/packages/domain | Useful concepts | Supabase tables | medium | Port logic after schema | Add billing approvals |
| src/lib/capital*.ts | Capital analytics/hardness | MODERNIZE | /v2/services/risk-capital | Good domain reference | tests | medium | Extract formulas | Fit V2 capital manager |
| src/lib/prop/* | Prop rules/signals | MODERNIZE | /v2/services/execution-planner | Needed V2 restrictions | domain types | medium | Reuse rules ideas | Planner owns decisions |
| src/lib/exchange/exchangeProvider.ts | Provider contract | MODERNIZE | /v2/packages/adapters | Good abstraction seed | provider impls | medium | Improve contract | Add command queue/state |
| src/lib/exchange/ExchangeProviderBinance.ts | Browser-side provider reference | REWRITE | /v2/services/adapters/binance | Production adapter must server-side | exchange API | high | Reference only | Customer keys vault |
| src/lib/exchange/ExchangeProviderBybit.ts | Bybit provider reference | REWRITE | /v2/services/adapters/bybit | Same | exchange API | high | Reference only | Certification required |
| src/lib/exchange/ExchangeProviderMT5.ts | MT5 placeholder/reference | REWRITE | /v2/services/adapters/mt5 + bridge | No HashiBridge/EA | bridge | high | Concept only | Build desktop app/EA |
| src/lib/exchange/executionRouter.ts | Provider routing | MOVE | /v2/services/execution-manager | Concept needed | provider contract | high | Reuse naming | Planner before adapter |
| src/lib/exchange/tradeManagementCore.ts | Trade management logic | MODERNIZE | /v2/services/trade-management | Useful tests | execution types | medium | Extract tested logic | Add state machines |
| src/lib/binanceTruthExecution.ts | UI/test support for execution | MODERNIZE | /v2/apps/admin-web + certification | Useful proof vocabulary | execution tables | medium | Reference | New API |
| src/lib/binanceTestnetMonitor.ts, monitorTruth.ts, operator*.ts | Monitoring/admin runtime helpers | MODERNIZE | /v2/services/monitoring + admin | Good concepts | tables/functions | medium | Reference | Runtime cache + snapshots |
| supabase/functions/market-scanner | Scanner/strategies/market data | REWRITE | /v2/services/hashicore | Monolithic, non-event-bus | Supabase/providers | very high | Mine formulas only | Split engines |
| supabase/functions/scheduled-market-scanner | Cron scanner wrapper | REMOVE | none/service scheduler | V2 services own runtime | pg_cron | high | None | Keep only maintenance cron |
| supabase/functions/binance-testnet-execution | Execution/testnet adapter | REWRITE | /v2/services/adapters/binance | Coupled/global credentials | Supabase/exchange | high | Reference order/protection | Command queue first |
| supabase/functions/binance/bybit monitors | Position monitor | MODERNIZE | /v2/services/monitoring/adapters | Useful checks | exchange APIs | high | Reference logic | Per customer/account |
| supabase/functions/telegram-* and _shared/telegram-router.ts | Telegram sending/routing | MODERNIZE/MOVE | /v2/services/telegram-platform | Mature subsystem | Telegram/Supabase | medium | Reuse templates/routing | Event consumer/outbox |
| supabase/functions/intelligence-* | News/intelligence events | DEFER | /v2/services/intelligence | Nice-to-have | providers/telegram | medium | Defer MVP | Isolate from trading core |
| supabase/functions/admin-* | Admin actions/bootstrap | MODERNIZE | /v2/apps/admin-web/api | Useful admin patterns | Supabase | medium | Reuse auth ideas | Strict RBAC/audit |
| supabase/functions/evaluate-signal-outcomes | Signal outcome evaluator | MODERNIZE | /v2/services/trade-management/research | Useful lifecycle/outcomes | market data | medium | Reference | Event-driven outcomes |
| supabase/migrations/* | V1 schema history | REWRITE | /v2/supabase/migrations | Too incremental/noisy | SQL/RLS | high | Reference table ideas | Fresh baseline |
| tests/analytics/* | Capital tests | MODERNIZE | /v2/tests/risk-capital | Useful coverage | TS | low | Port | Expand |
| tests/execution/* | Execution/provider tests | MODERNIZE | /v2/tests/certification | Useful proof cases | TS | medium | Port scenarios | Add full adapter cert |
| scripts/deploy/check-edge-functions.mjs | Deployment checks | MODERNIZE | /v2/scripts | Useful ops | Supabase CLI/API | low | Port | Workspace-aware |
| scripts/execution/* | Live proof/audit scripts | MODERNIZE | /v2/tests/certification/scripts | Useful manual checks | secrets/exchanges | medium | Port | No global customer keys |
| .env.example | Env template | MODERNIZE | /v2/.env.example + docs | Useful inventory | deployment | low | Recreate | No real project URL |
| .env.production | Environment-specific values | REMOVE | none | Should not be committed | deployment | medium | Do not port | Use secret manager |
