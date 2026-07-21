# HashiBot V2-to-Live Runtime Recovery Audit

**Audit date:** 2026-07-19 (UTC)
**Scope:** repository-wide static evidence audit; no deployment, SQL execution, cron change, or runtime mutation was performed.
**Decision supplied by project owner:** `v2/` is abandoned; the production product is the root application and root Supabase runtime.

## Executive conclusion

The repository contains **two independent systems**. The active product is the root Vite application (`index.html` → `src/main.tsx` → `src/App.tsx`) backed by the root `supabase/functions` and root `supabase/migrations`. The abandoned system has its own package, build, frontend, Edge Functions, schema, and deploy configuration under `v2/`.

No root application, root Edge Function, root deployment script, root TypeScript configuration, or root test imports a module from `v2/`. A repository search found references to `v2/` only in documentation and Binance API versioned URLs such as `/fapi/v2/...`; those URLs are not source imports. **The evidenced live runtime therefore has no code dependency on `v2/`.**

This conclusion has two important configuration caveats. First, `v2/netlify.toml` is the only checked-in Netlify file and explicitly builds from `v2`. It is evidence that V2 *could* be deployed if a hosting project selects that file, not evidence that it currently is deployed. Conversely, the repository contains no root Netlify/Vercel configuration that proves the external frontend host's base directory. Second, the only GitHub workflow is named `.github/workflows/deploy-supabase-functions.yml.disabled`; GitHub will not treat that suffix as a workflow. The root deploy script itself unambiguously discovers only root `supabase/functions`, but the repository does **not** prove that it runs automatically. The owner-supplied correction, root Bolt template configuration, root package, and root HTML establish the intended active frontend, but the actual hosting dashboard and function release process must be checked read-only before recovery.

### Honest disconnected-work estimate

Tracked V2 material comprises approximately:

- **2,745 lines** of runtime/application code across `v2/apps`, `packages`, `services`, `strategies`, `execution`, `hashibridge`, and `supabase/functions`;
- **1,442 lines** of tests;
- **1,453 lines** of V2 migrations; and
- **1,720 lines** of documentation/deployment material.

Thus roughly **5,640 lines of implemented code, tests, and schema** (or **7,360 lines including documentation/runbooks**) are disconnected from the root production build. Line count is not completion: several V2 files are placeholders, mock/in-memory implementations, or contracts. By subsystem, approximately **60–70% of the recent V2 effort is useful design/test material**, **20–30% is adaptable implementation**, and **less than 15% is safe to port verbatim**. The highest-value disconnected work is the typed strategy/indicator framework, immutable arbitrator, crypto certification/paper truth, professional Telegram delivery semantics, Forex strategies/Signal Mode contracts, and risk/capital tests. V2 deployment/schema/frontend work should not be used to replace the live product.

## Method and classification rules

Evidence was obtained by tracing imports and calls, reading both package/build configurations, enumerating tracked files, inspecting Edge Function database writes and inter-function HTTP calls, locating UI invocations, reading migrations without executing them, and using path-scoped `git log`.

Classifications:

- **ALREADY_LIVE** — materially equivalent behavior is in the root runtime and is reachable from a live entry point.
- **PARTIALLY_LIVE** — the root contains a reachable equivalent, but V2 has distinct/newer semantics or coverage.
- **V2_ONLY** — no materially equivalent reachable root implementation was found.
- **OBSOLETE** — conflicts with the corrected architecture or duplicates a more mature root subsystem.
- **UNKNOWN** — repository evidence cannot establish runtime/deployment state.

Recommendations use **PORTED** only for narrowly movable behavior, **ADAPTED** for translation into root contracts/schema, **IGNORED** for deliberately unused work, **DELETED_LATER** only after recovery and retention approval, and **RETAINED_AS_REFERENCE** for useful evidence that should not enter the runtime.

---

# Part 1 — Active live runtime

## 1. Frontend entry and production build

```text
root package.json: build = vite build
  → vite.config.ts
  → index.html (#root, /src/main.tsx)
  → src/main.tsx (ReactDOM.createRoot)
  → src/App.tsx (BrowserRouter and public/customer/admin routes)
  → src/contexts/AuthContext.tsx
  → src/components/guards/RequireAuth.tsx and admin guard
  → src/pages/**
  → src/lib/supabase.ts / src/lib/supabaseEnv.ts
  → root Supabase project and /functions/v1/**
```

`tsconfig.app.json` includes only `src`; Vite's default root is repository root. Accordingly the browser production bundle includes the dependency graph rooted at `index.html`/`src/main.tsx` plus imported assets. It does **not** include `v2`, `supabase`, `tests`, `reports`, or `docs`. Root Edge Functions are separately deployed, not bundled into the frontend.

## 2. Admin Manual Scan call chain

Primary visible path:

```text
src/App.tsx route /admin/control-room
  → src/pages/admin/ControlRoom.tsx::runScanner()
  → authenticated POST {SUPABASE_URL}/functions/v1/market-scanner
  → supabase/functions/market-scanner/index.ts request handler
  → authorize admin/internal invocation
  → read scanner_config, symbols, strategy_configs, modes
  → insert scanner_runs
  → fetch Binance crypto or TwelveData Forex candles
  → calculate indicators
  → evaluate configured strategies
  → insert strategy_candidates / rejected_setups
  → arbitrate accepted candidates within the scan loop
  → insert canonical signal row (candidate/arbitrator/run provenance embedded)
  → optionally insert paper_execution_intents
  → route Telegram event
  → update provider_status, scanner_config, scanner_runs
```

There is also an operator path: `src/pages/admin/operator/OperatorPanel.tsx` sends `run_scanner_now` through `src/lib/operatorRuntime.ts` to `supabase/functions/admin-operator-action/index.ts`, which invokes the same root `market-scanner`. It is a control façade, not a second scanner.

## 3. Scheduled scanner and cron call chain

```text
repository migration definitions (root supabase/migrations; prepared final cron is not applied by this audit)
  → pg_cron/net.http call to /functions/v1/scheduled-market-scanner
  → supabase/functions/scheduled-market-scanner/index.ts
  → custom cron/internal authentication
  → insert scheduled scanner_runs proof row
  → check scanner_config is_enabled + schedule_enabled
  → POST /functions/v1/market-scanner
       body: run_type=scheduled, source, market_mode=crypto_only, scanner_run_id
  → POST /functions/v1/evaluate-signal-outcomes
  → aggregate scanner/outcome/Telegram metrics
  → finish scanner_runs proof and heartbeat diagnostics
```

The current scheduled wrapper calls the canonical root scanner rather than containing an independent V2 pipeline. It forces `market_mode: crypto_only` in its body, while effective root scanner flags are also resolved from environment and `scanner_config`. Cron migrations exist in root history, but later prepared consolidation migrations and admin diagnostics distinguish configuration from proof. This audit did not query the database, so **whether any cron is presently registered or enabled is UNKNOWN** and must remain disabled during recovery.

## 4. Active Crypto scanner

`supabase/functions/market-scanner/index.ts` is the active crypto scanner. It reads active crypto symbols, fetches real Binance candles (with controlled demo behavior), computes its in-file indicators, and runs `MicroScalper`, `QuickScalp`, `CompressionBreakout`, and `SwingContinuation`. Its database-backed registry is the `strategy_configs` query plus the hard-coded evaluator dispatch and `STRATEGY_RISK_RULES`; this is a registry in behavior, but not a reusable module.

The scan loop persists candidates, rejections, signals, scanner proof, provider status, Telegram delivery, and optional paper intent. This monolithic function is mature and connected, but its strategy interface, indicator calculations, arbitration, and persistence are tightly coupled.

## 5. Active Forex scanner

The same root `market-scanner` contains the active, feature-flagged Forex Signal Mode path:

- activation requires both `SIGNAL_ENABLE_FOREX=true` and `scanner_config.scan_forex_enabled=true`;
- the supported production set is `EURUSD`, `GBPUSD`, and `USDJPY` on `15m` and `1h`;
- the canonical real provider is TwelveData, with no demo fallback for this C2 path;
- provider-call budgeting, cache hits, minimum scan interval, diagnostics, and provider status are recorded;
- active evaluators are `ForexMicroScalper` and `ForexSwingContinuation`;
- Finnhub remains a diagnostic-only path, and MT5 bridge helpers do not make MT5 the canonical Forex scanner.

This is **already live in code but runtime-disabled by default**. “Live” here means connected to the active runtime, not proof that production flags or provider credentials are enabled.

## 6. Active strategy registry

There is no standalone root registry. The effective registry is split across:

1. `strategy_configs` rows loaded by `market-scanner`;
2. named defaults/parameter readers inside that function;
3. explicit evaluator calls for four crypto and two Forex strategies; and
4. `STRATEGY_RISK_RULES` in the same file.

`src/pages/admin/StrategyConfig.tsx` is the admin configuration surface. This registry is production-connected but more fragile than V2's `createDefaultStrategyRegistry`/`StrategyRunner` abstraction.

## 7. Active arbitrator

The active arbitrator is an in-scan ranking/deduplication block in `market-scanner`, not a separately imported service. It gathers passing evaluations, forms `arbitrationCandidates`, chooses the highest score with deterministic strategy order, applies duplicate/active-signal guards, writes selected/rejected candidate arbitration metadata, and creates at most the permitted signal. V2's `services/arbitrator` is not called.

## 8. Immutable signal / persistence path

The active canonical signal persistence is:

```text
market-scanner approved arbitration result
  → signals insert (entry, stops, targets, strategy/version-like metadata, source/run provenance)
  → optional paper_execution_intents insert and signals.paper_execution_intent_id link
  → evaluate-signal-outcomes later updates signals and appends signal_updates on transition
  → consumers read signals by id; exchange execution validates the selected signal
```

The root schema and later runtime-contract code also establish `execution_orders` plus `trade_management_truth` as execution truth. `src/lib/runtime/tradeTruth/TradeTruthService.ts` is a typed service/repository layer; root monitors additionally call database RPC/upsert paths to reconcile actual provider state. “Immutable” is enforced chiefly by append-only provenance and controlled writers rather than a single root `ImmutableSignalEngine` class.

## 9. Paper trade and outcome lifecycle

Two related paths exist:

- **Signal outcome truth:** `supabase/functions/evaluate-signal-outcomes/index.ts` loads open signal states, obtains Binance or Forex prices, resolves TP/SL/expiry transitions, updates `signals`, appends `signal_updates`, and emits deduplicated outcome Telegram events. It does not write `signal_outcomes`.
- **Paper intent truth:** the scanner creates `paper_execution_intents` for enabled Personal/Prop modes and links the signal. No executable root writer outside `market-scanner` references that table, so an advancing paper-intent lifecycle is **not active**. Admin `TradingBrain.tsx` only counts intents. V2's deterministic paper lifecycle is therefore genuinely disconnected work, not an already-live lifecycle.
- **Exchange testnet truth:** `execution_orders` are created/routed for Binance/Bybit testnet, then monitors reconcile fills, protection, partial exits, closeout, PnL, and `trade_management_truth`.

Admin/customer readers include `OutcomeTracking.tsx`, `Performance.tsx`, `ActiveSignals.tsx`, `SignalHistory.tsx`, and `SignalDetail.tsx`. V2's deterministic `createPaperSignalPlan`/`advancePaperTrade`/`calculatePaperReport` is newer isolated testable logic, but is not the active writer.

## 10. Binance execution path

```text
approved root signals row
  → scanner optional paper_execution_intents OR admin/operator execution action
  → supabase/functions/binance-testnet-execution/index.ts
  → validate signal + execution settings + governor/risk/capital constraints
  → Binance USD-M testnet REST API
  → execution_orders + execution_events + protection identifiers
  → native SL/TP or managed fallback
  → supabase/functions/binance-testnet-monitor/index.ts
  → exchange positions/orders reconciliation
  → trade_management_truth + monitor/runtime proof + Telegram critical alerts
```

Frontend/admin entry points are `BinanceOperations.tsx`, `ProviderOperationsWorkspace.tsx`, `Execution.tsx`, and operator actions. Root code explicitly guards against live trading and names the environment/testnet. V2's Binance provider is a typed adapter with injectable transport, but is not deployed and is far less operationally complete than this root path.

## 11. Bybit execution path

Root provider abstractions exist in `src/lib/exchange/ExchangeProviderBybit.ts`, `executionRouter.ts`, and `tradeManagementCore.ts`. The production-connected server path is shared orchestration in `binance-testnet-execution` (provider-specific actions and supervisor routing) plus `supabase/functions/bybit-testnet-monitor/index.ts`, which talks to Bybit testnet, reconciles `execution_orders`, protection and `trade_management_truth`, and records monitor proof. `BybitOperations.tsx` and the provider workspace are the admin routes.

Compared with Binance, Bybit is **partially live**: monitoring/reconciliation and admin/provider contracts are connected, but the root has no independently named `bybit-testnet-execution` Edge Function and relies on shared orchestration/provider routing. V2's adapter does not close that production integration gap by itself.

## 12. Telegram routing and delivery

```text
signal/outcome/execution/intelligence/admin event
  → supabase/functions/_shared/telegram-router.ts::routeTelegramEvent
  → channel decision (admin/free/VIP/customer), dedupe/cooldown and entitlement context
  → telegram-orchestrator and/or telegram-send/telegram-test
  → Telegram Bot API
  → telegram_deliveries (status, destination, retries/error, provider message id)
  → admin TelegramLogs/TelegramTest/TelegramLinks and customer TelegramSetup
```

`market-scanner`, `evaluate-signal-outcomes`, execution monitoring, and intelligence import the shared router. `telegram-orchestrator` is a webhook/orchestration entry; `telegram-send` is authenticated manual delivery; `telegram-test` is diagnostic. The root implementation preserves current links, subscriptions and tables. V2 adds cleaner delivery-queue, dead-letter, lifecycle-key, preferences, weekly-card, and paper-truth semantics but uses V2-specific platform tables/contracts.

## 13. Admin diagnostics

The root admin router exposes Control Room, Scanner Status/Config, Scheduler Guide/Proof Debug, Candidates, Rejected Setups, Signals/Outcomes/Performance, provider health/comparison/workspaces, Binance/Bybit/MT5 operations, Telegram logs/test/links, audit logs, retention, backtest lab, and the operator command center. `src/hooks/useAdminLiveState.ts` composes database proof from scanner runs/config, provider status, executions, trade truth, Telegram delivery health, outcomes, and runtime events. `admin-operator-action`, `admin-scheduler-action`, `admin-bootstrap`, and provider functions perform server-authorized diagnostics/actions.

V2's web admin mostly renders API/mock-backed shells and its `services/monitoring/index.ts` is explicitly placeholder-only. Root admin is therefore the system to preserve.

## 14. Reporting

Active reporting consists of database views/tables created by root migrations and root UI readers:

- `src/pages/admin/Performance.tsx` reads `signal_analytics_view`, outcomes and execution truth;
- `ProviderComparison.tsx` reads provider parity/performance;
- customer dashboard/history/detail pages report entitled signal truth;
- `src/lib/runtime/reporting/index.ts` defines canonical event/idempotency semantics, but is a small foundation rather than a scheduled report worker;
- Telegram/intelligence functions provide event-driven briefs/updates.

V2's weekly performance renderer and research/report concepts are useful, but there is no connected V2 reporting worker.

## 15. Deployment configuration

| Unit | Evidence | Effective scope |
|---|---|---|
| Root frontend | root `package.json`, `vite.config.ts`, `index.html`, `.bolt/config.json` | `src` import graph built to root `dist` |
| Root Edge Functions | root `npm run check:edge-functions` and `scripts/deploy-supabase-functions.mjs`; `.github/workflows/deploy-supabase-functions.yml.disabled` contains a workflow definition but is disabled by filename | scripts dynamically discover only `supabase/functions/*/index.ts` and exclude `_shared`; automatic deployment is not evidenced |
| Function auth | `supabase/config.toml` | root per-function JWT settings |
| Root database | `supabase/migrations/**` | migration history; prepared migrations are repository artifacts and not proof of application |
| Abandoned V2 frontend | `v2/netlify.toml`, `v2/package.json` | explicitly changes base to `v2` and publishes `apps/web-runtime/dist` |
| Abandoned V2 backend | `v2/supabase/**` and V2 deploy docs | not discovered by the root deploy workflow/script |

## 16. Production build inclusion and V2 import confirmation

**Root frontend build includes:** `index.html`, imported `src/**`, dependencies from root `node_modules`, and Vite-resolved static assets.
**Root function deployment includes:** each root `supabase/functions/<name>/index.ts` and its root `_shared` imports.
**Not included:** `v2/**`, root tests, reports, docs, or migrations in browser assets.

**Confirmation:** no executable file outside `v2` imports from it. Root package scripts never `cd v2`; root Edge deploy discovery is anchored to `supabase/functions`; root TS includes only `src`; root Vite entry is `/src/main.tsx`. Production dependency on V2 is therefore **NO**, subject only to the external hosting-dashboard caveat described above.

---

# Part 2 — Full V2 subsystem inventory

The inventory groups closely coupled files but covers every meaningful V2 area. “Latest commits” are path-scoped most-recent related commits.

| Subsystem | Exact V2 files | Purpose and latest related commits | Root equivalent | Class | Action |
|---|---|---|---|---|---|
| Contracts/types/events/state | `packages/types/index.ts`, `types/executor-monitoring.ts`, `types/trade-management.ts`; `packages/events/index.ts`; `packages/state-machines/index.ts`; `docs/CONTRACTS.md`, `EVENTS.md`, `EVENT_BUS.md`, `STATE_MACHINES.md` | Typed IDs/domain records, in-memory event bus, transition definitions. `d46edab` (2026-07-05), later consumed through `b16185b`/`99cdebd`. | Root has `src/lib/runtimeContracts/**`, trade-truth types and DB states, but different shapes. | PARTIALLY_LIVE | **ADAPTED** contract-by-contract; never introduce a parallel event truth. |
| Market data/candles/cache | `packages/market-data/index.ts`, `candle-engine/index.ts`, `runtime-cache/index.ts`, `mock-data/index.ts`; `services/market-intelligence/index.ts`; associated docs | Provider feed contract, normalization, candle aggregation, in-memory cache/runtime. `f56a4b2`, `45ce52c`, `8975e44`, `fa6cf59` (2026-07-05). | Root scanner fetches/normalizes/persists candles but is monolithic; DB is root durable cache. | PARTIALLY_LIVE | **ADAPTED** behind root scanner interfaces; retain DB truth. |
| Indicators/features | `packages/indicator-engine/index.ts`; `docs/INDICATOR_ENGINE.md`, `MARKET_FEATURES.md` | Shared typed indicators, session/structure/feature calculations. `1539fde` (2026-07-05), expanded by certification/Forex commits. | Root scanner has in-file indicators sufficient for six live evaluators. | PARTIALLY_LIVE | **ADAPTED** with golden parity tests before replacing any formula. |
| Strategy framework/registry | `strategies/index.ts`; wrapper files and READMEs under `strategies/crypto/**` and `strategies/forex/**`; `docs/STRATEGY_CONTRACT.md`, `STRATEGY_FRAMEWORK.md`, `STRATEGY_PARAMETERS.md` | Typed `StrategyDefinition`, candidate/reject contract, metrics, lifecycle/certification, registry and runner. `3cf554d` (2026-07-05), `b16185b` (2026-07-18), `99cdebd` (2026-07-19). | Root DB config + hard-coded dispatch, no reusable registry. | PARTIALLY_LIVE | **ADAPTED** to root config names, results and persistence. |
| Crypto strategies | `strategies/index.ts`; `strategies/crypto/{micro-scalper,compression-breakout,trend-pullback,reversal-exhaustion}/{index.ts,README.md}`; `docs/CRYPTO_STRATEGIES.md` | Four isolated strategies: MicroScalper, Compression Breakout, Crypto Trend Pullback, Reversal Exhaustion. Latest `b16185b`; originals `3cf554d`. | Root has MicroScalper and CompressionBreakout equivalents, plus QuickScalp and SwingContinuation. No direct Reversal Exhaustion; trend-pullback semantics differ from SwingContinuation. | PARTIALLY_LIVE | **ADAPTED** individually: parity existing two; shadow-test new two. |
| Forex foundation/provider | `packages/forex/index.ts`; `docs/FOREX_STRATEGIES.md`; relevant provider use in `services/signal-mode/index.ts` | Instrument metadata, provider contract, credit/rate diagnostics, session and candle snapshot types. `99cdebd` (2026-07-19). | Root TwelveData provider/budget/throttle is connected, more operational but not modular. | PARTIALLY_LIVE | **ADAPTED** types/diagnostics around root provider; do not replace live fetch path wholesale. |
| Forex strategies | `strategies/forex/index.ts`; `forex/{london-breakout,new-york-continuation,swing-continuation,trend-pullback}/{index.ts,README.md}`; additional Phase 4 strategies in `strategies/index.ts` | London breakout, NY continuation, Forex swing/trend pullback and additional session momentum/breakout/gold constructs. `99cdebd` latest; some generic foundations `3cf554d`. | Root only ForexMicroScalper and ForexSwingContinuation. | V2_ONLY (except swing concept) | **ADAPTED**, one strategy per phase, initially shadow/research-only. Note V2 `swingContinuation` is incorrectly identified as crypto in the shared registry and must not be copied blindly. |
| Scanner/HashiCore runtime | `services/hashicore/index.ts`, `README.md`; `services/market-intelligence/index.ts`; `packages/events/index.ts`; runtime/cache engines | Event-driven feed → candles → indicators → strategies pipeline. `4e51c29` (2026-07-05). | Root Edge scanner is mature, persistent and deployed. V2 runtime is in-memory/composition code without a production worker or root DB adapter. | PARTIALLY_LIVE | **RETAINED_AS_REFERENCE**; adapt seams into root scanner, not a second scanner. |
| Arbitrator/immutable signal | `services/arbitrator/index.ts`; overlapping brain classes in `services/hashicore/index.ts`; `docs/ARBITRATOR.md`, `IMMUTABLE_SIGNAL.md`, `TRADING_BRAIN.md` | Candidate validation/ranking, active cache, deterministic immutable signal engine and lifecycle. `a4905d7` (2026-07-05). | Root in-scan arbitration and signal/provenance DB writers are connected. | PARTIALLY_LIVE | **ADAPTED** as pure decision module behind existing root writer. |
| Crypto certification/paper truth | `services/crypto-certification/index.ts`; `tests/execution/crypto-certification.test.ts`; `docs/CRYPTO_PHASE2_CERTIFICATION_REPORT.md` | Approved-strategy certification, scanner mapping, stable signal/trade IDs, deterministic paper plan/advance/report, protection certification. `b16185b` and `1cc586e` (2026-07-18). | Root has `src/lib/exchange/CryptoCertification.ts`, execution tests, scanner outcomes/paper intents, but V2's isolated strategy certification and deterministic paper simulator are not connected. | PARTIALLY_LIVE | **ADAPTED** into root certification/test layers; reconcile IDs/statuses with existing rows. |
| Unified Forex Signal Mode | `services/signal-mode/index.ts`; `tests/signal-mode/forex-signal-mode.test.ts`; integrations in `packages/telegram-platform/index.ts`, `strategies/index.ts`, `packages/forex/index.ts` | Provider-budgeted scanner facade, unified immutable truth, Telegram publisher, admin snapshot/report/config. `99cdebd` (2026-07-19). | Root already has connected Forex flags/provider/budget/scanner/signals/Telegram/admin proof, with only two strategies. | PARTIALLY_LIVE | **ADAPTED** selectively (contracts/reporting/strategy breadth); ignore parallel scanner/truth/publisher. |
| Risk/capital/portfolio | `services/risk-engine/index.ts`, `README.md`; capital/risk classes also in `services/hashicore/index.ts`; `docs/RISK_ENGINE.md`, `CAPITAL_MANAGER.md`, `PORTFOLIO_RULES.md` | Pure risk decisions, profile modes, sizing, exposure/correlation, locks, allocation, metrics/events. `328b9d1` (2026-07-05). | Root has scanner risk rules, capital analytics/hardness, execution governor, prop rules and DB settings; behavior is distributed but connected. | PARTIALLY_LIVE | **ADAPTED** as pure policy functions after parity mapping; root settings remain source of truth. |
| Execution provider contract | `execution/exchange-provider.ts`, `trade-management-core.ts`, `trade-truth-store.ts`; `docs/ADAPTER_CONTRACT.md` | Provider-neutral results/account/order/protection contract, lifecycle management, in-memory/durable repository interfaces. `23a5ac9`, `48116d8`; certification update `b16185b`. | Root provider interface/router/trade core plus much richer execution orders/trade truth. | PARTIALLY_LIVE | **RETAINED_AS_REFERENCE**; adapt only missing invariants/tests. |
| Planner/orchestrator/command queue | `execution/planner/index.ts`, `executor-runtime/planner.ts`, `command-queue/index.ts`, `services/execution-orchestrator/{index.ts,README.md}`, `services/executor-manager/index.ts`, `execution/repositories/*.ts`; command-queue/trade-truth migrations | Plans per customer/account, durable idempotent command queue, claim/retry worker, repository adapters and executor controls. `7b40c11`, `2e0c2f9`, `c64060e`, `fa0f4a9` (2026-07-05). | Root has direct Edge orchestration, execution orders/events, operator actions and supervisors, but not the V2 command queue model. | V2_ONLY / PARTIALLY_LIVE | **RETAINED_AS_REFERENCE** initially; only **ADAPT** queue semantics if root reliability analysis proves a gap. V2 tables must not be introduced wholesale. |
| Binance adapter | `execution/adapters/binance/{index.ts,provider.ts,README.md}` | Typed adapter with injected transport and testnet/live metadata. `3a972e4` (2026-07-05). | Root Binance testnet Edge execution/monitor is substantially more complete and live. | OBSOLETE as runtime; useful contract tests | **RETAINED_AS_REFERENCE**; port tests/invariants only. |
| Bybit adapter | `execution/adapters/bybit/{index.ts,provider.ts,README.md}` | Typed Bybit adapter with safety/protection calls. `3a972e4` (2026-07-05). | Root monitoring/truth/admin exists; entry orchestration is less standalone than Binance. | PARTIALLY_LIVE | **ADAPTED** only behind root server-side provider routing; never deploy V2 adapter as parallel worker. |
| MT5/HashiBridge | `execution/adapters/mt5/**`; all `hashibridge/**`; `services/mt5-platform/index.ts`; `apps/web-runtime/mt5/index.ts`; V2 MT5 Edge Functions and migrations; protocol/MT5 docs | Desktop agent, EA, protocol, local replay queue, MT5 provider, registration/health/recovery Edge APIs. `8c6980a`, `1472141` (2026-07-06). | Root has MT5 bridge function, provider helper, admin personal/prop pages and root Forex migration, but not equivalent full desktop/EA platform proof. | V2_ONLY / PARTIALLY_LIVE | **RETAINED_AS_REFERENCE**, then separately **ADAPTED** only after crypto/Forex recovery; outside immediate Signal Mode recovery. |
| Protection | `execution/protection/index.ts`; protection portions of providers/trade core/certification; `docs/STATE_MACHINES.md` | Pure protection plan, stop replacement, partials/profit lock and state transitions. `240d1c0` (2026-07-05), used by `b16185b`. | Root Binance/Bybit monitors, `ProtectionEngine.ts`, supervisor and trade truth are substantially more operational. | ALREADY_LIVE | **RETAINED_AS_REFERENCE** and port only pure regression cases. |
| Recovery | `supabase/functions/executor-recovery`, `executor-restart`, pause/resume/start/stop; `mt5-recovery`; hardening helpers; deploy operations/reset docs | V2 executor/MT5 lifecycle recovery and ops endpoints. `fa0f4a9`, `1472141`, `d1d1aa5` (2026-07-05/06). | Root `RecoveryEngine.ts`, supervisors, operator action, provider monitors and recovery migrations are connected and broader for crypto. | ALREADY_LIVE for crypto; V2_ONLY for HashiBridge | **IGNORED** for crypto, **RETAINED_AS_REFERENCE** for future MT5. |
| Telegram platform | `packages/telegram-platform/index.ts`; `apps/telegram-platform/{index.ts,README.md}`; `supabase/functions/telegram-platform/index.ts`; `scripts/telegram-flow-verify.*`; Telegram migration/docs/deploy docs | Bot/channel manager, templates, queue/retry/dead-letter, preferences, lifecycle idempotency, news, professional dispatcher, weekly cards; platform Edge facade/schema. `d347f30` (2026-07-05), `1cc586e` (2026-07-18), `99cdebd` (2026-07-19). | Root shared router, deliveries, links, orchestrator, subscriptions and admin/customer UI are connected. | PARTIALLY_LIVE | **ADAPTED** behavior-by-behavior into root router/tables; never migrate users/links to V2 schema. |
| Reporting/research | `services/research-lab/{index.ts,README.md}`, `supabase/functions/research-lab/index.ts`, research migration; `docs/RESEARCH_LAB.md`; report helpers in Telegram/Signal Mode | Dataset/experiment concepts, API, weekly/signal reports. `31287aa` (2026-07-05), `99cdebd` (2026-07-19). | Root BacktestLab/Performance/provider analytics are connected and richer in UI; scheduled professional report composition is limited. | PARTIALLY_LIVE | **ADAPTED** report renderers/query concepts only; research schema **RETAINED_AS_REFERENCE**. |
| Monitoring/admin diagnostics | `services/monitoring/index.ts` (placeholder); `services/executor-manager/index.ts`; `apps/web-admin/**`; `supabase/functions/{monitoring-summary,provider-health,queue-health,runtime-health,platform-api}/**`; monitoring migrations/docs | V2 health APIs and UI shell. `fa0f4a9`, UI commits through `44dce05` (2026-07-06). | Root admin/live-state/operator/provider diagnostics are substantially more complete and production-connected. | OBSOLETE (except monitoring contracts) | **IGNORED** as UI/runtime; retain endpoint response ideas. |
| Customer/frontend runtime | `apps/web-customer/**`, `web-admin/**`, `web-runtime/**`; `packages/ui/**`; `netlify.toml`; frontend/UI docs | Separate V2-rendered frontend, auth/router/API client and generated static build. `42a2c97`, `b812628`, `44dce05` (2026-07-05/06). | Root React app is active and much richer. V2 uses mock/API shell patterns and separate React 19 package. | OBSOLETE | **DELETED_LATER** only after archive policy; no port except isolated copy/design review. |
| V2 platform schema/security/storage | all `v2/supabase/migrations/**`, policies/schema/seed docs, `_shared/hardening.ts`, platform Edge APIs | Fresh-project V2 schema, RLS, retention, V1 compatibility, command/truth/platform tables. `bbf826f` through `c4f5404` (2026-07-05–07). | Root database contains users, subscriptions, signals, Telegram and exchange history and must be preserved. | OBSOLETE as migration target | **RETAINED_AS_REFERENCE**; do not execute. Translate only required deltas into new root repository migrations. |
| Deployment package | `v2/netlify.toml`; all `v2/deploy/**` and scripts | Independent V2 build/bootstrap/reset/deploy/smoke package. `2f86efa`, `f2cb5ed`, `c4f5404`. | Root Vite and root Edge workflow are active; V2 reset/bootstrap is unsafe for existing production. | OBSOLETE | **IGNORED**, then **DELETED_LATER** after recovery/archive approval. |
| Tests | every file under `v2/tests/**` (contract, market/indicator/candle, strategy, arbitrator, HashiCore, risk, execution/queue/planner/providers/protection/trade truth/certification/monitoring, Forex Signal Mode, Telegram, MT5, platform, frontend, research) | 31 tracked test files / ~1,442 lines; tests primarily execute isolated TypeScript and static SQL/source assertions. Latest relevant commits follow each subsystem through `99cdebd`. | Root has 17 test files concentrated on execution/runtime/analytics/recovery, but little isolated strategy/Forex coverage. | V2_ONLY / PARTIALLY_LIVE | **PORTED** after adapting imports/fixtures to root; do not count static source-string tests as production certification. |
| Documentation | `v2/README.md`; every `v2/docs/**`; every Markdown file under `v2/deploy`, subsystem READMEs | Architecture, contracts, certification, Telegram, Forex, platform/UI and ops guidance. | Root docs describe live deployment/runtime but contain older V2-directed decisions that now conflict with the correction. | UNKNOWN/OBSOLETE depending document | **RETAINED_AS_REFERENCE** with an “abandoned” banner in a later docs-only cleanup; update root canonical docs during each port. |

## Exact V2-only work

The following has no complete equivalent in the active root runtime:

1. Reusable typed `StrategyDefinition`/`StrategyRunner` and registry lifecycle/certification metrics.
2. Crypto Reversal Exhaustion and the V2-specific Crypto Trend Pullback implementation.
3. V2 Forex London Breakout, New York Continuation, session-momentum, session-breakout, V2 trend-pullback, and gold-volatility strategy logic (some wrappers/names overlap and require correction).
4. Unified Signal Mode's isolated provider credit diagnostics, pure scanner facade, unified signal truth class, report builder, and admin snapshot (the end-to-end business flow itself already exists in root).
5. Deterministic stable paper signal/trade IDs and pure paper plan/advance/report simulator.
6. V2 risk engine's single pure decision object with exposure/correlation/sector calculations and decision hash.
7. Durable V2 command queue/idempotency/claim/retry design and worker repositories (not safe to deploy as V2 tables).
8. Professional Telegram dead-letter queue, optional-media downgrade, lifecycle-version key, customer-preference filter, weekly-card renderer, and paper-truth-specific dispatcher semantics.
9. Full HashiBridge desktop agent/EA/protocol/local replay/updater and its V2 MT5 APIs.
10. V2 research-lab experiment/dataset contracts.
11. The V2 standalone React runtime and fresh-project deployment package — V2-only, but obsolete under the corrected product decision.

## Exact already-live work

The root runtime already supplies and must not be rebuilt:

1. Customer/admin React application, auth, routes and subscription/access surfaces.
2. Manual and scheduled scanner entry points, scanner proof and configuration.
3. Binance crypto data scanning and four connected crypto evaluator paths.
4. Feature-flagged TwelveData Forex scanning, budgeting/throttling and two connected Forex evaluators.
5. Database strategy configuration and admin tuning.
6. Candidate persistence, arbitration, immutable signal/provenance persistence, duplicate guards and rejections.
7. Signal outcome transitions, paper-intent creation, signal updates and analytics readers (but not an active paper-intent advancement worker).
8. Binance testnet execution, native/managed protection, monitoring, closeout and runtime truth.
9. Bybit testnet monitoring/reconciliation, provider admin and shared execution/trade truth contracts.
10. Protection/recovery supervisors, operator actions, runtime proof and critical alerts.
11. Telegram links, subscription-aware routing, deliveries, manual/test/orchestrated sending and admin/customer UI.
12. Performance, outcome, provider comparison, backtest and customer reporting surfaces.
13. Root database migration history and root-only Edge deployment scripts (the checked-in workflow definition is presently disabled).

---

# Part 3 — Feature gap matrix

| Feature | Active live implementation | V2 implementation | Newer | More complete | Production dependencies | Migration risk | Recommended action |
|---|---|---|---|---|---|---|---|
| Crypto strategy framework | In-file evaluators + DB config in root `market-scanner` | Typed registry/runner/contracts in `v2/strategies` | V2 framework | V2 structurally; root operationally | strategy_configs, candidates, scanner UI | High: subtle formula/result drift | Adapt interface around root behavior; golden parity first. |
| Crypto strategies | MicroScalper, QuickScalp, CompressionBreakout, SwingContinuation | MicroScalper, Compression Breakout, Trend Pullback, Reversal Exhaustion | V2 updates are newer; sets differ | Neither supersedes the other | candles, config names, risk rules, arbitration | High | Preserve four root strategies; port only missing V2 strategies in shadow mode. |
| Strategy registry | DB rows + hard-coded dispatch | `createDefaultStrategyRegistry`, lifecycle/certification/metrics | V2 | V2 design; root connectivity | strategy_configs/admin schema | Medium-high | Adapt V2 registry to resolve root rows; one registry, no duplicate config store. |
| Scanner | 4,000+ line Edge Function with data, DB, Telegram, proof | composable in-memory HashiCore/event pipeline | Root operational; V2 cleaner | Root end-to-end | Supabase, Binance, TwelveData, flags, tables | Very high | Do not replace. Extract pure components incrementally. |
| Arbitrator | Inline ranking, duplicate guard and DB metadata | Pure `Arbitrator`, active cache, immutable engine | V2 abstraction | Root integration; V2 testability | candidates/signals/current uniqueness | High | Adapt pure decision logic behind existing writer and compare shadow decisions. |
| Signal truth | `signals`, `signal_updates`, `signal_outcomes`, run provenance | immutable in-memory signal engine + V2 trade truth schema | V2 abstraction | Root durable production truth | existing IDs, RLS, subscriptions, Telegram, execution FKs | Critical | Keep root tables/IDs; port invariants only. |
| Paper trading | paper-intent creation only; separate signal-outcome Edge worker + UI counts/analytics | deterministic plan/advance/report and stable IDs | V2 logic | V2 paper lifecycle; root signal-outcome integration | signals, intents, updates, prices, Telegram | High | Adapt simulator as pure oracle/tests, then add an explicit root paper lifecycle only after schema/status mapping. |
| Telegram | shared router, links, deliveries, entitlements, Bot API functions/UI | professional queue/templates/preferences/dead letters/news/reports | V2 semantics newer | Root integration; V2 queue behavior | users, links, subscriptions, channel IDs, delivery logs | Critical | Add V2 semantics one at a time to root router/table via migrations only if needed. |
| Binance | large testnet executor + monitor + protection/recovery/truth | typed injectable adapter | Root | Root by far | credentials, settings, execution orders, Binance testnet | Critical | Ignore V2 runtime adapter; port contract tests only. |
| Bybit | shared orchestration + dedicated monitor/admin/truth | typed injectable adapter | Mixed | Root operational monitoring; V2 entry adapter cleaner | credentials/settings/orders/Bybit testnet | Critical | Fill root entry gaps using adapted provider methods; retain root monitor/truth. |
| Protection | real exchange verification/repair, native/managed fallback | pure protection engine/plans | Root operational | Root | open positions/orders and monitors | Critical | Keep root; add pure regression tests only. |
| Recovery | operator/supervisors/monitors/root recovery engine | executor lifecycle APIs + MT5 recovery | Root for crypto; V2 for MT5 concept | Root for current product | providers, DB truth, Telegram alerts | Critical | No crypto port; defer MT5 recovery to separate program. |
| Reporting | active performance/outcome/provider/backtest/customer views | weekly renderer, Signal Mode report, research concepts | V2 renderers newer | Root data/UI | analytics views, entitlements | Medium | Adapt renderers to root queries and verified data; never fabricate V2 state. |
| Admin | broad root React/operator diagnostics and server actions | web shell + health/platform APIs; monitoring placeholder | Root | Root by far | auth/RBAC, all root tables/functions | High | Preserve root; selectively add diagnostics fields. |
| Forex | root TwelveData path, throttling/budget, two evaluators, persistence/Telegram/admin | modular provider types, more strategies, unified Signal Mode facade | V2 strategies newest; root integration newer/mature | Root operational, V2 breadth | TwelveData credits, root flags/tables/subscriptions | High | Keep root provider/scanner/truth; adapt one V2 strategy at a time. |
| Risk/capital | distributed scanner/executor/prop/governor rules | unified pure RiskEngine/CapitalManager | V2 design | Root operational; V2 policy breadth | settings, account truth, execution safety | Critical | Map rules and shadow decisions; never switch sizing atomically. |
| Execution queue | direct Edge actions/orders/events/supervisors | durable idempotent claim/retry queue | V2 design | Context-dependent | execution_orders/operator actions | Very high | Treat as future reliability enhancement, not recovery prerequisite. |

---

# Part 4 — Phased recovery plan

## Non-negotiable guardrails for every phase

1. Root `src`, root `supabase/functions`, and root schema remain the only production runtime.
2. No V2 Edge Function, V2 migration, V2 Netlify build, V2 bootstrap, reset, or smoke script is executed against production.
3. Existing user/profile IDs, subscriptions, Telegram links/delivery history, signals, execution orders, Binance/Bybit settings/credentials, and trade truth remain untouched.
4. Cron remains disabled until Phase 9 certification. Manual invocation is the only scanner trigger during recovery.
5. No direct SQL is executed. Any necessary schema delta is a new, reviewed **root** repository migration with preflight, forward verification and rollback/compatibility plan.
6. Every behavior change uses existing root flags or a new default-off root feature flag. No phase creates a second scanner, arbitrator, signal table, Telegram router, or execution worker.
7. Each phase ends in a tagged/committed rollback point. Rollback means disabling the new flag/reverting code while retaining backward-compatible data.

## Phase 0 — Freeze and external deployment proof

**Work:** Mark V2 abandoned in canonical docs (without deletion); record root and V2 commit SHAs; inventory production host base directory/build command read-only; verify the frontend artifact loads root `src/App.tsx` version markers; inspect the root Supabase function list/config without deploying; record that cron is disabled. Reconcile the `v2/netlify.toml` ambiguity with actual hosting settings.

**Tests/checks:** root `npm run typecheck`, `npm run build`, `npm run check:edge-functions`, all root test scripts; `rg` no-import guard from root executable paths to V2. No network mutation.

**Rollback point:** documentation/evidence commit only. **Exit gate:** written proof of root frontend and root functions; otherwise stop.

## Phase 1 — Characterization harness around live behavior

**Work:** Build fixture/golden tests for current root crypto and Forex indicators, each live strategy, arbitration ordering, signal payloads, paper/outcome transitions, Telegram routing, and Binance/Bybit provider contracts. Adapt useful V2 fixtures but assert root outputs. Snapshot only synthetic/repository fixtures, never production data.

**Tests:** root unit suites plus deterministic repeated runs, malformed candle/provider failures, duplicate scan/idempotency cases, and type/build checks.

**Rollback:** tests only; revert harness if it misstates behavior. **Exit gate:** all currently supported strategies and writers have executable characterization.

## Phase 2 — Strategy contract and registry adaptation

**Work:** Introduce a root-owned pure strategy interface compatible with current `strategy_configs`, result/reason fields and scanner persistence. Wrap the existing six root evaluators first. Adapt selected V2 registry/runner concepts; do not import across `v2`. Keep the old dispatch available behind a default-old switch and compare old/new results in memory/log proof without extra signals.

**Tests:** exact parity for existing evaluator decisions, scores, stop/target/grade/reason outputs; disabled strategies; config overrides; deterministic arbitration input.

**Rollback:** switch to old dispatch/revert wrapper commit. **Exit gate:** zero signal payload divergence on the golden corpus.

## Phase 3 — Pure indicators and arbitrator

**Work:** Adapt V2 indicator/features and arbitrator into root modules only where they add value. Initially compute both legacy and adapted values; persist no second candidates/signals. Make root DB writer the sole writer. Preserve current duplicate keys, active-signal checks, IDs and strategy-order behavior.

**Tests:** numeric tolerance/golden indicator parity, stale/warmup/invalid candle cases, deterministic tie-breaking, duplicate opportunity, multi-strategy competition, and concurrency/idempotency tests.

**Rollback:** disable adapted calculation/arbitrator flags. **Exit gate:** shadow decisions match or every approved intentional difference is documented and certified.

## Phase 4 — Crypto certification and missing strategies

**Work:** Adapt V2 certification rules and deterministic paper oracle into root tests/services. Then add **one** missing crypto strategy (Trend Pullback first, Reversal Exhaustion second) as disabled research/shadow strategy rows. Do not rename or replace live root strategies. Promote only after replay, paper and false-positive review.

**Tests:** certification tests per strategy/timeframe/symbol; warmup, no-lookahead, closed-candle, RR, risk, duplicate and expiry; backtest/replay and paper outcomes; scanner payload compatibility.

**Rollback:** disable the individual strategy flag/config; no schema/data removal. **Exit gate:** explicit per-strategy certification and admin visibility.

## Phase 5 — Paper truth and professional Telegram semantics

**Work:** Reconcile V2 stable IDs and paper state transitions with existing root IDs/FKs; use V2 simulator only as a pure oracle until parity. Adapt queue retry/dead-letter, lifecycle-version idempotency, preferences and optional-media fallback into the **root** router/delivery writer. Preserve existing Telegram bot, links, destinations, subscriptions and `telegram_deliveries`. Add columns/tables only through a backward-compatible root migration if existing fields cannot represent the state.

**Tests:** create→active→TP/SL/expired paths, restart/idempotency, duplicate event suppression, transient/permanent Telegram errors, channel entitlement, blocked demo, outcome delivery, and unchanged existing link flow.

**Rollback:** feature flags to old outcome/router behavior; additive migration remains dormant. **Exit gate:** no duplicate user messages and full audit trail.

## Phase 6 — Forex strategies through the live provider

**Work:** Keep root TwelveData provider, rate budget, symbols, flags and signal writer. Adapt one V2 Forex strategy at a time in this order: London Breakout, NY Continuation, Trend Pullback, then optional session momentum/breakout; defer XAUUSD Gold Volatility until provider/symbol certification. Correct V2 market identity errors during translation. Run shadow/manual only, then paper-only. The V2 unified scanner/publisher/truth classes are not ported because root already owns those responsibilities.

**Tests:** session/timezone/DST boundaries, spread/credit/rate-limit/provider failure, stale/closed candles, supported symbol/timeframe gates, no demo fallback, no-lookahead, arbitration with existing Forex strategies, root persistence/Telegram compatibility.

**Rollback:** per-strategy config disable. **Exit gate:** provider-cost budget and paper certification for each strategy.

## Phase 7 — Risk/capital policy consolidation

**Work:** Map every root scanner, execution governor, prop and provider constraint to a canonical table; adapt V2 pure exposure/correlation/capital calculations only where non-duplicative. Shadow old/new decisions with sanitized proof. Preserve database settings and hard live safety caps as authoritative. No execution behavior switches until exact approvals.

**Tests:** balance/margin extremes, daily/weekly/monthly loss, drawdown, cooldown, correlated/symbol/market exposure, leverage, invalid stops, concurrent reservations, Binance and Bybit sizing parity.

**Rollback:** default-old policy switch. **Exit gate:** no relaxation of a current safety guard and formal risk sign-off.

## Phase 8 — Provider gaps, reporting and deferred HashiBridge

**Work:** For Bybit, adapt only missing entry/protection adapter methods into root server-side orchestration while retaining root monitor/truth. For Binance, port tests only. Adapt verified weekly/Signal Mode report formatting to root analytics and entitlements. Treat HashiBridge/MT5 as a separate, later project with its own threat model and certification; do not make it a blocker for crypto/Forex Signal Mode recovery.

**Tests:** provider sandbox contract/reconciliation/protection, secret isolation, duplicate order prevention, report figures reconciled to root views, entitlement tests. MT5 requires separate desktop/EA integration tests if authorized later.

**Rollback:** provider/report flags off; root existing execution remains. **Exit gate:** no provider credentials or order lifecycle moved to V2 contracts/tables.

## Phase 9 — Final certification, controlled scheduler decision, and V2 detachment proof

**Work:** Run full root build/type/tests, manual end-to-end scans, paper outcomes, Telegram sandbox/approved test destination, and Binance/Bybit testnet certification. Re-run no-import/no-deploy-path checks. Confirm all desired V2 behavior now exists under root-owned modules and docs. Only after explicit operator approval should a **root migration/configuration process** enable one canonical schedule. Observe proof/heartbeats/failure handling before increasing cadence.

**Tests:** repeated manual E2E; failure injection; restart/idempotency; provider outage; database writer/RLS; subscription isolation; performance and rollback rehearsal. Then, and only then, one controlled scheduled run with documented approval.

**Rollback:** disable scheduler immediately, revert last feature flags, retain root data and previous root functions. **Exit gate:** one active root runtime, one scanner, one signal truth, one Telegram router, one execution truth, zero runtime/build/deployment dependency on `v2`.

## Phase 10 — Archive decision (not deletion in this task)

After a retention period and successful Phase 9, mark superseded V2 files with a final manifest of what was ported, adapted or rejected. Obtain explicit owner approval before deletion in a separate change. Preserve audit/certification evidence in root docs. The present instruction not to delete `v2/` remains controlling.

---

# Risks and open evidence gaps

| Risk/gap | Severity | Evidence-based mitigation |
|---|---:|---|
| External frontend host may still point at `v2/netlify.toml` despite owner correction | Critical | Phase 0 read-only host/artifact verification; do not infer deployed artifact from repository alone. |
| Root Edge deployment automation is disabled, while `scripts/check-edge-functions.mjs` still tries to read the unsuffixed workflow filename | High | Treat releases as UNKNOWN/manual; repair and certify root release automation in a later authorized code task before any deployment. |
| Cron state cannot be established without database inspection, which this task forbids | High | Treat as UNKNOWN and disabled; require approved read-only proof later, never execute SQL directly. |
| Root scanner is monolithic and changes can alter signal economics silently | Critical | Characterization and shadow comparison before extraction; one strategy at a time. |
| V2 and root IDs/statuses/schema differ | Critical | Root IDs/FKs remain canonical; adapters translate; additive migrations only. |
| Telegram changes can duplicate or misroute paid-user messages | Critical | Reuse root links/subscriptions/delivery ledger; lifecycle idempotency and sandbox destination tests. |
| Binance/Bybit changes can affect open testnet positions/protection | Critical | Do not replace root monitors; provider sandbox, reconciliation and rollback tests; live trading remains impossible. |
| V2 tests can overstate readiness because many are isolated/static and use mocks | High | Port behavior tests into root integration boundary and require real testnet/provider certification separately. |
| Strategy names/markets are not fully consistent in V2 | High | Explicit identity mapping; reject blind copy (notably the shared `swingContinuation` crypto identity under Forex wrappers). |
| V2 fresh-project migrations/reset scripts could damage existing production | Critical | Never execute them; translate reviewed deltas to root migrations with preflight and compatibility. |
| Root documentation contains earlier V2 migration assumptions | Medium | Make this audit the recovery authority; later update canonical architecture/deploy docs with abandonment banner. |
| “Already live” can be mistaken for “currently enabled/healthy” | High | This audit proves reachability in code, not environment flags, credentials, DB migration state or runtime health. Require runtime proof in certification. |

## Final disposition

The recovery should **not move the application to V2 and should not copy V2 wholesale into root**. Preserve the connected root product. Mine V2 for pure algorithms, contracts, tests and professional delivery semantics; translate each into root-owned modules behind existing root persistence and operational boundaries. V2 frontend, schema bootstrap, deployment and duplicate platform APIs are obsolete under the correction. The end state is the current root application strengthened by selected, certified V2 behavior, with V2 retained only as non-production historical reference until separately authorized for deletion.
