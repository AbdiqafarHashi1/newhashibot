# HashiBot Final V2 Recovery Report

**Certification date:** 2026-07-21 (UTC)
**Scope:** final static reconciliation of every non-dependency file under `v2/` against the active root application, root Supabase functions, migrations, tests, and recovery documentation.
**Safety boundary:** this work did not deploy, execute SQL, enable cron, change authentication or subscriptions, touch credentials, or promote a research strategy.

## 1. Executive decision

The V2 Recovery Project is **COMPLETE**.

All useful implemented V2 behavior is now either represented by an equal or stronger root owner, or has already been translated into a root-owned compatibility domain during Recovery Phases 1–4. The remaining V2 material is either an abandoned duplicate runtime, a placeholder, a superseded implementation, or a roadmap item deliberately kept dormant. There are **no `PARTIALLY RECOVERED` or `MISSING` V2 capabilities**, so this final phase makes no production behavior change and adds no runtime module, migration, provider, writer, or execution path.

The repository has transitioned from **Recovery Mode back to Normal HashiBot Development**. Future work must be selected from the root roadmap and production evidence, not from the abandoned V2 workspace.

## 2. Method and classification rules

The audit:

1. enumerated every V2 file outside generated `node_modules` and `.tmp` content (Appendix A);
2. read every implementation domain, test family, schema/deployment group, and its supporting documentation;
3. compared those capabilities with root entry points and root ownership;
4. traced the root frontend, scanner, signal writer, paper lifecycle, execution truth, provider monitors, Telegram routing, diagnostics, analytics, and tests;
5. searched executable root code and configuration for V2 imports; and
6. treated an aspirational V2 document or placeholder as a capability only when it defined a distinct architectural responsibility.

Each capability below has exactly one recovery classification:

- **FULLY RECOVERED** — translated into root with equivalent or stronger behavior.
- **PARTIALLY RECOVERED** — only part of an implemented V2 capability exists in root and recovery is still required.
- **ALREADY EXISTED** — root already had the equal or stronger connected capability.
- **OBSOLETE** — the V2 implementation duplicates or conflicts with current root ownership.
- **INTENTIONALLY NOT RECOVERED** — valid future/research material deliberately excluded from production recovery.
- **MISSING** — an implemented V2 capability has no root equivalent and must be recovered.

Architecture verification uses a separate status vocabulary. A root subsystem may be `PARTIAL` or `DEFERRED BY DESIGN` on the product roadmap without implying that an implemented V2 capability remains recoverable.

## 3. Complete V2 inventory summary

| V2 area | Inventory | Material found | Final disposition |
|---|---:|---|---|
| Workspace/config | 5 files | Workspace README, package manifests, TypeScript config, Netlify config | Reference only; root package/build is authoritative |
| `apps/` | 17 files | Telegram/admin/customer shells and a separate web runtime | Placeholders or obsolete duplicate frontend |
| `deploy/` | 19 files | Deployment prose, scripts, SQL package notes, environment and operations checklists | Root operations already stronger; retain as historical reference |
| `docs/` | 39 files | Contracts, target architecture, subsystem designs, UI/platform audit | Design evidence reconciled below; not executable ownership |
| `execution/` | 21 files | Provider contracts/adapters, planner, command queue, protection, truth repositories | Useful invariants recovered or root already stronger; duplicate runtime excluded |
| `hashibridge/` | 10 files | Protocol/core stubs, desktop/queue/updater shells, MT5 provider and EA prototype | Deferred roadmap/reference; not production-certified |
| `packages/` | 19 files | Candles, indicators, events, Forex, market data, cache, state machines, Telegram, types/UI | Domain behavior recovered selectively; alternate infrastructure excluded |
| `scripts/` | 2 files | V2 Telegram verification scripts | Superseded by root focused tests and routing ownership |
| `services/` | 17 files | Arbitrator, HashiCore, risk, monitoring, certification, orchestration, research, signal mode | Pure domains recovered; alternate runtime/service ownership excluded |
| `strategies/` | 18 files | Four crypto and four Forex implementations plus registry | Professional framework and valuable strategy intent recovered; research stays dormant |
| `supabase/` | 41 files | 19 Edge/shared files, 10 migrations, and schema/policy/seed/verification docs | Separate backend/schema is obsolete; no SQL copied or executed |
| `tests/` | 34 files | Contract, engine, execution, frontend, runtime, MT5, platform, strategy, Telegram tests | Invariants mapped to root suites; abandoned runtime tests remain reference |

Generated dependency contents under `v2/node_modules/` were dependency artifacts, not authored capability, and were not classified as product code. The complete authored/configuration path manifest is in Appendix A; no authored V2 area was skipped.

## 4. Recovery classification

| # | V2 capability and principal references | Root comparison | Classification | Reason / action |
|---:|---|---|---|---|
| 1 | Shared contracts and types (`packages/types`, `docs/CONTRACTS.md`) | Root runtime contracts and trade-truth types are connected and stricter | FULLY RECOVERED | Phase 1–3 translations retained root vocabulary and validation |
| 2 | Explicit state-machine primitives (`packages/state-machines`) | Root signal, paper, order, protection, and recovery transitions have guarded vocabularies | FULLY RECOVERED | No second state-machine owner required |
| 3 | Shared indicator engine (`packages/indicator-engine`) | Root `_shared/indicator-engine.ts` owns exact scanner-compatible formulas and validation | FULLY RECOVERED | Phase 4 recovered valuable pure calculations without formula drift |
| 4 | Professional strategy contract/registry (`strategies/index.ts`) | Root `_shared/professional-strategies.ts` is the single reusable registry connected to the scanner | FULLY RECOVERED | Phase 1 preserved six live evaluators and added fail-closed research posture |
| 5 | Crypto strategy/certification intent | Root registry, compatibility evaluators, `CryptoCertification`, and strategy/execution suites cover it | FULLY RECOVERED | Production strategies remain unchanged; two V2-only ideas are research-only |
| 6 | Forex domain and Signal Mode contracts | Root Forex domain, research strategies, scanner flags/provider budget and diagnostics are stronger | FULLY RECOVERED | Phase 2 translated domain value into the existing scanner |
| 7 | Arbitrator and immutable candidate decision (`services/arbitrator`) | Root shared arbitrator is pure, immutable, deterministic, fail-closed, and connected | FULLY RECOVERED | Phase 4 replaced no writer and preserved legacy ordering |
| 8 | Deterministic paper lifecycle/certification | Root shared paper domain plus existing outcome writer and paper-intent synchronization cover V2 behavior | FULLY RECOVERED | Phase 3 recovered the implemented deterministic behavior; richer durable metrics are a new roadmap enhancement, not missing V2 parity |
| 9 | Professional Telegram semantics | Root professional formatter, router, orchestrator/send ownership and truth-before-delivery flow are connected | FULLY RECOVERED | Phase 3 recovered lifecycle/deduplication semantics without a second platform |
| 10 | Customer/admin SaaS platform | Root React application, auth guards, customer/admin routes, package/permission readers existed and are connected | ALREADY EXISTED | V2 apps were mostly shells and are not stronger |
| 11 | Binance provider/execution/protection | Root testnet execution and monitor are substantially more operational and truth-oriented | ALREADY EXISTED | V2 injectable adapter is insufficient as a replacement |
| 12 | Bybit provider monitoring and routing contract | Root provider-neutral router, Bybit provider helper, monitor and admin surface existed | ALREADY EXISTED | Standalone entry parity remains a root roadmap question, not a V2 recovery requirement |
| 13 | Risk/capital/portfolio policy | Root scanner risk gates, capital analytics/hardness, execution governor and prop rules existed | ALREADY EXISTED | Connected root policy is stronger despite distributed implementation |
| 14 | Protection and recovery desired-state behavior | Root ProtectionEngine/RecoveryEngine, exchange monitors and trade truth already verify/repair provider state | ALREADY EXISTED | Root implementation is operationally stronger |
| 15 | Monitoring/provider/runtime health | Root provider status, monitor truth, runtime proof, supervisors and admin diagnostics existed | ALREADY EXISTED | V2 monitoring service is predominantly in-memory contracts |
| 16 | Analytics/reporting/certification truth | Root performance pages, reporting domain, capital analytics and certification suites existed | ALREADY EXISTED | Root database truth stores remain authoritative |
| 17 | Security/configuration/retention | Root auth, RLS migrations, secret docs, internal auth, audit and retention material existed | ALREADY EXISTED | V2 security/config packages are documentation placeholders |
| 18 | Deployment and operations guidance | Root deploy/check scripts and production/runbook documentation existed | ALREADY EXISTED | V2 scripts target the abandoned package and must not be used |
| 19 | Alternate HashiCore runtime (`services/hashicore`) | Root Edge runtime is the production owner | OBSOLETE | Activating it creates a second runtime/trading brain |
| 20 | V2 market-intelligence scanner/candle runtime | Root `market-scanner` is the only scanner and owns persistence/provider budgets | OBSOLETE | In-memory V2 composition cannot coexist as another scanner |
| 21 | V2 execution orchestrator/planner/command queue | Root execution functions, orders/events and operator actions are authoritative | OBSOLETE | Importing the queue wholesale would introduce second command/execution truth |
| 22 | V2 trade-truth repositories and schema | Root trade-truth service plus `execution_orders`/`trade_management_truth` are authoritative | OBSOLETE | Separate tables/repositories would split execution truth |
| 23 | V2 Binance/Bybit/mock adapter runtime | Root server-side providers and monitors own exchange interaction | OBSOLETE | Useful contract ideas are already covered; runtime adapter duplication is prohibited |
| 24 | V2 Edge Function platform (`v2/supabase/functions`) | Root functions already own API, runtime, Telegram, monitoring and MT5 boundaries | OBSOLETE | Deploying these creates a second backend and inconsistent auth/schema |
| 25 | V2 migrations/seeds/staging SQL | Root migration history is production schema truth | OBSOLETE | V2 assumes a fresh independent project; SQL was not executed or copied |
| 26 | V2 web runtime/UI system | Root Vite React app is the active frontend | OBSOLETE | V2 shell is a second incomplete frontend/runtime |
| 27 | Research Lab service/API/schema | Root deliberately does not activate the V2 lab | INTENTIONALLY NOT RECOVERED | Research graduation is future work requiring root-native design and evidence |
| 28 | Six dormant research strategies | Definitions are present in root but disabled, shadow, non-publishable | INTENTIONALLY NOT RECOVERED | “Not recovered” here means not promoted; production recovery explicitly forbids promotion |
| 29 | Full HashiBridge desktop/EA/updater/local queue | Root keeps an MT5 provider/bridge boundary but not this prototype platform | INTENTIONALLY NOT RECOVERED | Requires a separately scoped MT5 certification phase; V2 artifacts are prototypes/placeholders |
| 30 | Per-customer executor-manager environments | Root has customer/account controls but no V2-style dedicated executor fleet | INTENTIONALLY NOT RECOVERED | SaaS scale/isolation rollout is a roadmap decision, not safe recovery work |
| 31 | Event bus/runtime cache/mock-data infrastructure | Root uses direct Edge boundaries and durable Supabase facts | INTENTIONALLY NOT RECOVERED | Introducing alternate runtime memory/communication would redesign production |
| 32 | V2 deployment/bootstrap/reset automation | Retained only as abandoned-workspace reference | INTENTIONALLY NOT RECOVERED | It targets V2 paths/schema and could mutate a separate platform |

### Classification totals

| Classification | Count |
|---|---:|
| FULLY RECOVERED | 9 |
| PARTIALLY RECOVERED | 0 |
| ALREADY EXISTED | 9 |
| OBSOLETE | 8 |
| INTENTIONALLY NOT RECOVERED | 6 |
| MISSING | 0 |
| **Total** | **32** |

## 5. Remaining implementation performed

No runtime implementation was warranted. Because the exhaustive comparison produced zero `PARTIALLY RECOVERED` and zero `MISSING` capabilities, adding code would violate the prohibition against duplicate ownership or expand the product beyond recovery.

This phase adds only this certification report. It neither changes production behavior nor claims that every future roadmap subsystem is complete.

## 6. Root versus final HashiBot architecture

| Domain | Subsystem | Status | Root owner / explanation | Further implementation? |
|---|---|---|---|---|
| Core | HashiCore runtime | COMPLETE (different implementation) | Root Edge functions and shared domains form the connected runtime rather than a monolithic HashiCore service | Consolidate only when production evidence justifies it; no V2 port |
| Core | Strategy framework | COMPLETE | `_shared/professional-strategies.ts` contract and compatibility adapter | Normal maintenance only |
| Core | Strategy registry | COMPLETE | One root professional registry; database configuration feeds it | No second registry |
| Core | Shared indicator engine | COMPLETE | `_shared/indicator-engine.ts`; scanner delegates parity formulas | Remaining legacy calculations may be extracted only with golden parity fixtures |
| Core | Shared arbitrator | COMPLETE | `_shared/arbitrator.ts`, called by the scanner | No second brain |
| Core | Scanner | COMPLETE (different implementation) | One `market-scanner` handles configured crypto and feature-gated Forex modes; scheduled function is a wrapper | Architecture says one per market; shared root scanner is an intentional stronger singleton |
| Core | Signal truth | COMPLETE | `signals`, append-only updates/provenance, one scanner publication boundary | Preserve single writer |
| Trading | Binance | COMPLETE | Testnet execution, native/managed protection, reconciliation monitor and proof | Live trading remains outside this recovery |
| Trading | Bybit | PARTIAL | Provider abstraction and monitoring are connected; entry orchestration is less independently complete than Binance | Continue provider-parity roadmap, not V2 adapter recovery |
| Trading | MT5 architecture | DEFERRED BY DESIGN | Root provider contract and `mt5-bridge` boundary exist; desktop/EA platform is not certified | Dedicated MT5/HashiBridge implementation and certification phase |
| Trading | Paper lifecycle | COMPLETE (different implementation) | Pure deterministic lifecycle plus signal outcome writer and paper-intent synchronization | Durable MFE/MAE/version evidence is an optional reviewed schema enhancement |
| Trading | Execution lifecycle | COMPLETE | `execution_orders`, events, provider execution and reconciliation | Continue hardening from runtime proof |
| Trading | Protection | COMPLETE | Provider-native/managed protection and desired-vs-actual reconciliation | Normal hardening |
| Trading | Recovery | COMPLETE | Recovery engine, monitors and repair/verification paths | Normal hardening |
| Trading | Monitoring | COMPLETE | Provider monitors, runtime/monitor truth and operator surfaces | Normal operations |
| Risk | Risk Engine | COMPLETE (different implementation) | Distributed scanner/execution/prop policy is connected rather than one V2 class | Consolidation is optional and must preserve behavior |
| Risk | Capital Manager | COMPLETE (different implementation) | Capital analytics/hardness and execution governor own allocation gates | Normal roadmap work |
| Risk | Certification | COMPLETE | Strategy, crypto, runtime, provider and final-readiness certification suites | Profitability is not certified by this report |
| Customer | Customer execution model | PARTIAL | Customer/account settings and execution records exist; dedicated executor isolation is not fully realized | SaaS execution-isolation roadmap |
| Customer | Admin architecture | COMPLETE | Root guarded admin routes and operator/provider control surfaces | Normal product development |
| Customer | SaaS architecture | PARTIAL | Auth, access, packages and customer UI exist; billing/tenant automation is not a fully proven production platform | Product roadmap, not V2 recovery |
| Customer | Packages | COMPLETE | Root package/access model and readers | Normal maintenance |
| Customer | Permissions | COMPLETE | Auth guards, RLS history and admin/internal authorization | Continue security review |
| Customer | Multi-account execution | PARTIAL | Provider/account routing contracts exist; full customer-isolated fleet is deferred | Dedicated roadmap phase |
| Telegram | Signal delivery | COMPLETE | Professional formatter through canonical router/orchestrator/send path | Preserve one route |
| Telegram | Lifecycle delivery | COMPLETE | Outcome truth precedes deduplicated lifecycle notification | Normal maintenance |
| Telegram | Reporting | COMPLETE (different implementation) | Root reporting reads canonical signal/execution truth | Normal product work |
| Telegram | Admin routing | COMPLETE | Root channel configuration/router owns admin destinations | No second platform |
| Telegram | Execution routing | COMPLETE | Execution events use root Telegram brain/router boundaries | No provider-local Telegram owner |
| Runtime | Diagnostics | COMPLETE | Scanner, strategy, indicator, arbitrator, operator and monitor diagnostics | Persist only reviewed high-value evidence |
| Runtime | Provider health | COMPLETE | Provider status and provider monitors | Normal hardening |
| Runtime | Runtime proof | COMPLETE | Runtime truth/certification and monitor proof | Environment proof still requires deployment-time checks |
| Runtime | Monitoring | COMPLETE | One root monitoring ownership spread across provider-specific monitors and shared truth | Do not deploy V2 monitor service |
| Runtime | Recovery | COMPLETE | Root recovery/supervision owners | Normal hardening |
| Runtime | Runtime ownership | COMPLETE | Root package, Vite entry and root Supabase functions are authoritative | External hosting configuration must continue to point at root |
| Reporting | Analytics | COMPLETE | Capital/performance analytics and database truth readers | Normal roadmap work |
| Reporting | Performance | COMPLETE (different implementation) | Root performance UI/reports use canonical records | Profitability conclusions excluded |
| Reporting | Certification | COMPLETE | Focused recovery/runtime/execution suites and documents | Continue release certification |
| Reporting | Truth stores | COMPLETE | Signals are signal truth; execution orders/trade management are execution truth | Never introduce V2 tables as peers |
| Platform | Research Lab | DEFERRED BY DESIGN | Research definitions are fail-closed; no active V2 lab | Build root-native only after roadmap approval |
| Platform | Retention/operations | COMPLETE (different implementation) | Root migrations/docs/runbooks and deploy validation supersede V2 package | Actual scheduled jobs must be verified operationally, not assumed from source |

### Intentional architecture differences

- The target V2 document described one scanner per market. Root intentionally uses **one canonical scanner function** with market modes, shared writers, and provider-specific branches. This is a stronger singleton for current scale and avoids duplicated signal truth.
- Root uses connected Edge-function owners rather than one in-memory HashiCore process or a V2 command-queue worker. This is intentional; changing it would be a redesign.
- Risk, capital, protection, recovery, and monitoring are cohesive responsibilities but not all housed in one class. Connected truth and one writer matter more than matching V2 file layout.
- Customer-isolated executors, a full MT5 desktop bridge, and the Research Lab remain roadmap items. V2 contains prototypes/contracts, not production-certified solutions.

## 7. Final ownership map and duplicate audit

| Responsibility | Sole root owner |
|---|---|
| Production application/runtime | Root `index.html` → `src/main.tsx` / root Supabase functions |
| Scanner | `supabase/functions/market-scanner/index.ts` |
| Scheduled invocation | `scheduled-market-scanner` wrapper invoking the same scanner |
| Strategy registry | `supabase/functions/_shared/professional-strategies.ts` |
| Indicator engine | `supabase/functions/_shared/indicator-engine.ts` |
| Arbitration | `supabase/functions/_shared/arbitrator.ts` |
| Signal truth/writer | Root `signals` path in `market-scanner` and controlled outcome transitions |
| Paper lifecycle | `_shared/paper-trade-lifecycle.ts` with `evaluate-signal-outcomes` as connected writer |
| Execution truth | `execution_orders`, execution events, `trade_management_truth`, root trade-truth service |
| Provider execution/monitoring | Root provider router, execution function and provider monitors |
| Telegram | `_shared/professional-telegram.ts` + `_shared/telegram-router.ts` → orchestrator/send |
| Runtime monitoring/proof | Root monitors, runtime truth/certification and operator truth |
| Reporting/analytics | Root reporting library, analytics libraries and canonical database readers |

No duplicate root owner was removed in this phase: Phases 1–4 already integrated shared domains behind existing owners, and this audit found no second **active** implementation to consolidate. V2 duplicates remain inert reference material. Deleting that historical tree is a separate retention decision and is not necessary for runtime uniqueness.

## 8. Dormant and research-only modules

| Module/capability | State | Publication/execution boundary |
|---|---|---|
| `crypto.trend-pullback` | Research-only | disabled, `RESEARCH`, shadow, non-publishable |
| `crypto.reversal-exhaustion` | Research-only | disabled, `RESEARCH`, shadow, non-publishable |
| `forex.london-breakout` | Research-only | disabled, `RESEARCH`, shadow, non-publishable |
| `forex.new-york-continuation` | Research-only | disabled, `RESEARCH`, shadow, non-publishable |
| `forex.trend-pullback` | Research-only | disabled, `RESEARCH`, shadow, non-publishable |
| `gold.volatility-breakout` | Research-only | disabled, `RESEARCH`, shadow, non-publishable |
| Forex production mode | Intentionally dormant unless both gates are enabled | Existing environment and scanner-config gates; this audit changed neither |
| Full MT5/HashiBridge desktop platform | Deferred | Root bridge/provider boundary only; V2 desktop/EA prototype is not imported |
| Research Lab | Deferred | No V2 service/API/schema is active in root |
| V2 applications, functions, workers and deployment scripts | Abandoned/inert | Excluded from root build, tests and deploy discovery |

## 9. Proof of no runtime V2 imports

The executable-code search excludes documentation, reports, `.git`, and V2 itself. It finds no import, dynamic import, `require`, relative path, or runtime path into `v2/`. Remaining textual `/v2/` hits are:

- assertions in a root test that prohibit V2 imports;
- Binance REST endpoint versions such as `/fapi/v2/account`; and
- CryptoCompare's versioned `/data/v2/news` URL.

Those are third-party API versions, not repository module paths. Root TypeScript configuration includes root sources, and root Vite builds from root `index.html`; V2 also has its own separate package/config and is not part of root compilation.

## 10. V2 references used

Every path in Appendix A was inventoried. Detailed semantic comparison directly used:

- all `v2/docs/*.md`, platform/UI audits, and deployment documentation;
- all implementations under `v2/packages`, `v2/services`, `v2/strategies`, `v2/execution`, and `v2/hashibridge`;
- all V2 application and Supabase function entry points;
- all V2 migrations, seed/verification SQL (read only), schema/policy notes, and deployment scripts;
- all 34 V2 tests to identify claimed behavior and distinguish tested implementation from placeholders;
- `v2/package.json`, `tsconfig.json`, `netlify.toml`, lockfile, and workspace README to establish isolation.

The highest-value direct references translated during prior phases were the strategy registry and eight strategies, Forex domain and Signal Mode, crypto certification/paper lifecycle, Telegram platform, indicator engine, arbitrator, and their focused tests. No root runtime imports them.

## 11. Test results and known issues

| Command/check | Result | Notes |
|---|---|---|
| `npm run test:strategies` | PASS | Professional strategy compatibility |
| `npm run test:forex-recovery` | PASS | Forex foundation/research publication guards |
| `npm run test:paper-telegram` | PASS | Deterministic paper lifecycle and Telegram |
| `npm run test:indicators-arbitrator` | PASS | Shared indicator and arbitrator parity |
| `npm run test:phase1-runtime` | PASS | Runtime consolidation static certification |
| `npm run test:phase15-runtime` | PASS | Runtime truth certification |
| `npm run test:phase3-runtime` | PASS | Worker/monitor/reporting static suite |
| `npm run test:trade-truth` | PASS | Canonical trade-truth service |
| `npm run test:final-readiness` | PASS | Safety/auth/reporting readiness checks |
| `npm run test:final-cron` | PASS | Cron consolidation static checks; no cron was enabled |
| `npm run test:operator-actions` | PASS | Operator auth/timeout checks |
| `npm run test:analytics` | PASS | Capital analytics |
| `npm run test:recovery` | PASS | Recovery ownership/import guards |
| `npm run test:execution` | FAIL (pre-existing) | Focused compilation fails on NodeNext extension errors and `LegacyTradeTruthMappingResult.error` narrowing; no final-phase runtime file changed |
| `npm run check:edge-functions` | FAIL (pre-existing repository configuration) | Function/import checks pass until the validator expects the absent `.github/workflows/deploy-supabase-functions.yml`; only the checked-in `.yml.disabled` file exists |
| `npm run typecheck` | FAIL (pre-existing) | Existing customer/admin implicit-any and shape errors, unused compatibility arguments, certification nullability, and operator-state errors; this documentation-only phase introduced none |
| `npm run build` | PASS with warning | Production bundle succeeds; Rollup reports an existing chunk-size warning |
| no-V2-runtime-import `rg` search | PASS | Only prohibition tests and third-party API version URLs remain outside docs/reports/V2 |
| `git diff --cached --check` | PASS | Staged report has no whitespace errors |

The failures reproduce repository issues outside this phase's single documentation file and are not represented as recovery failures. No V2 test suite is treated as production certification: it compiles/runs the abandoned workspace and can only validate reference behavior. No SQL, cron, deployment, external exchange mutation, or credentialed smoke test is part of this static recovery certification.

## 12. Honest readiness assessment

**Recovery readiness:** complete. There is no valuable implemented V2 capability left that must be placed in the root runtime.

**Production readiness:** not asserted by recovery completion. Bybit entry parity, full MT5/HashiBridge delivery, customer-isolated executor fleets, SaaS operational completeness, durable advanced paper metrics, deployed environment proof, and research graduation remain either partial or deferred. They must proceed through normal roadmap design, review, testnet/shadow evidence, security review, and deployment controls.

**Recommended next phase:** resume the agreed root roadmap with **provider/customer execution isolation and provider parity**, prioritizing evidence-driven Bybit parity before a separately scoped MT5/HashiBridge certification phase. Research strategy promotion must remain later and pass replay, paper/shadow, risk, and certification gates.

There are **no remaining V2 capabilities requiring recovery**.

---

## Appendix A — Complete authored V2 path manifest

The following manifest covers every non-generated V2 file reviewed by this reconciliation. `v2/node_modules/**` and transient `.tmp/**` are intentionally omitted as generated dependencies/output.

<!-- V2_MANIFEST_START -->
- `v2/README.md`
- `v2/apps/telegram-platform/README.md`
- `v2/apps/telegram-platform/index.ts`
- `v2/apps/web-admin/README.md`
- `v2/apps/web-admin/index.ts`
- `v2/apps/web-customer/README.md`
- `v2/apps/web-customer/index.ts`
- `v2/apps/web-runtime/README.md`
- `v2/apps/web-runtime/index.ts`
- `v2/apps/web-runtime/mt5/index.ts`
- `v2/apps/web-runtime/src/api-client.ts`
- `v2/apps/web-runtime/src/app.ts`
- `v2/apps/web-runtime/src/auth.ts`
- `v2/apps/web-runtime/src/components.ts`
- `v2/apps/web-runtime/src/layouts.ts`
- `v2/apps/web-runtime/src/pages.ts`
- `v2/apps/web-runtime/src/router.ts`
- `v2/apps/web-runtime/src/styles.ts`
- `v2/deploy/FULL_DEPLOYMENT_CHECKLIST.md`
- `v2/deploy/README.md`
- `v2/deploy/bootstrap.md`
- `v2/deploy/edge-functions.md`
- `v2/deploy/environment.md`
- `v2/deploy/netlify.md`
- `v2/deploy/operations-runbook.md`
- `v2/deploy/providers.md`
- `v2/deploy/reset-initialization.md`
- `v2/deploy/scripts/bootstrap-owner.sh`
- `v2/deploy/scripts/build-web-runtime.mjs`
- `v2/deploy/scripts/platform-reset.sh`
- `v2/deploy/scripts/smoke-test.sh`
- `v2/deploy/scripts/validate-deployment-package.mjs`
- `v2/deploy/secrets.md`
- `v2/deploy/smoke-test.md`
- `v2/deploy/sql/SQL_PACKAGE.md`
- `v2/deploy/storage.md`
- `v2/deploy/telegram.md`
- `v2/docs/ADAPTER_CONTRACT.md`
- `v2/docs/ADMIN_APP.md`
- `v2/docs/ARBITRATOR.md`
- `v2/docs/CANDLE_ENGINE.md`
- `v2/docs/CAPITAL_MANAGER.md`
- `v2/docs/COMMAND_QUEUE.md`
- `v2/docs/CONTRACTS.md`
- `v2/docs/CRYPTO_PHASE2_CERTIFICATION_REPORT.md`
- `v2/docs/CRYPTO_STRATEGIES.md`
- `v2/docs/CUSTOMER_APP.md`
- `v2/docs/EVENTS.md`
- `v2/docs/EVENT_BUS.md`
- `v2/docs/FOREX_STRATEGIES.md`
- `v2/docs/FRONTEND_MIGRATION.md`
- `v2/docs/HASHIBRIDGE_MT5_PLATFORM.md`
- `v2/docs/HASHIBRIDGE_PROTOCOL.md`
- `v2/docs/IMMUTABLE_SIGNAL.md`
- `v2/docs/INDICATOR_ENGINE.md`
- `v2/docs/MARKET_DATA_ENGINE.md`
- `v2/docs/MARKET_FEATURES.md`
- `v2/docs/NEXT_STEPS.md`
- `v2/docs/PORTFOLIO_RULES.md`
- `v2/docs/PROFESSIONAL_TELEGRAM_PHASE3.md`
- `v2/docs/README.md`
- `v2/docs/RESEARCH_LAB.md`
- `v2/docs/RISK_ENGINE.md`
- `v2/docs/RUNTIME_CACHE.md`
- `v2/docs/STATE_MACHINES.md`
- `v2/docs/STORAGE_EGRESS_GUARDRAILS.md`
- `v2/docs/STRATEGY_CONTRACT.md`
- `v2/docs/STRATEGY_FRAMEWORK.md`
- `v2/docs/STRATEGY_PARAMETERS.md`
- `v2/docs/TRADING_BRAIN.md`
- `v2/docs/UI_SYSTEM.md`
- `v2/docs/platform/final-hardening-audit.md`
- `v2/docs/platform/step-15-platform-foundation.md`
- `v2/docs/platform/step-16-telegram-platform.md`
- `v2/docs/ui/STEP_17_UI_AUDIT.md`
- `v2/docs/ui/STEP_18_FINAL_UI_PARITY.md`
- `v2/execution/adapters/binance/README.md`
- `v2/execution/adapters/binance/index.ts`
- `v2/execution/adapters/binance/provider.ts`
- `v2/execution/adapters/bybit/README.md`
- `v2/execution/adapters/bybit/index.ts`
- `v2/execution/adapters/bybit/provider.ts`
- `v2/execution/adapters/index.ts`
- `v2/execution/adapters/mock/index.ts`
- `v2/execution/adapters/mt5/README.md`
- `v2/execution/adapters/mt5/index.ts`
- `v2/execution/adapters/provider-adapter.ts`
- `v2/execution/command-queue/index.ts`
- `v2/execution/exchange-provider.ts`
- `v2/execution/executor-runtime/README.md`
- `v2/execution/executor-runtime/planner.ts`
- `v2/execution/planner/index.ts`
- `v2/execution/protection/index.ts`
- `v2/execution/repositories/supabase-command-queue-repository.ts`
- `v2/execution/repositories/supabase-trade-truth-repository.ts`
- `v2/execution/trade-management-core.ts`
- `v2/execution/trade-truth-store.ts`
- `v2/hashibridge/agent-ea/HashiAgentEA.mq5`
- `v2/hashibridge/agent-ea/README.md`
- `v2/hashibridge/core/index.ts`
- `v2/hashibridge/desktop-agent/index.ts`
- `v2/hashibridge/desktop-app/README.md`
- `v2/hashibridge/desktop-app/index.ts`
- `v2/hashibridge/local-queue/README.md`
- `v2/hashibridge/protocol/index.ts`
- `v2/hashibridge/provider/mt5-provider.ts`
- `v2/hashibridge/updater/README.md`
- `v2/netlify.toml`
- `v2/package-lock.json`
- `v2/package.json`
- `v2/packages/candle-engine/index.ts`
- `v2/packages/config/README.md`
- `v2/packages/events/index.ts`
- `v2/packages/forex/index.ts`
- `v2/packages/indicator-engine/index.ts`
- `v2/packages/logging/README.md`
- `v2/packages/market-data/index.ts`
- `v2/packages/mock-data/README.md`
- `v2/packages/mock-data/index.ts`
- `v2/packages/runtime-cache/index.ts`
- `v2/packages/security/README.md`
- `v2/packages/state-machines/index.ts`
- `v2/packages/supabase-client/README.md`
- `v2/packages/telegram-platform/index.ts`
- `v2/packages/types/executor-monitoring.ts`
- `v2/packages/types/index.ts`
- `v2/packages/types/trade-management.ts`
- `v2/packages/ui/README.md`
- `v2/packages/ui/index.ts`
- `v2/scripts/telegram-flow-verify.sh`
- `v2/scripts/telegram-flow-verify.ts`
- `v2/services/arbitrator/index.ts`
- `v2/services/crypto-certification/index.ts`
- `v2/services/execution-orchestrator/README.md`
- `v2/services/execution-orchestrator/index.ts`
- `v2/services/executor-manager/index.ts`
- `v2/services/hashicore/README.md`
- `v2/services/hashicore/index.ts`
- `v2/services/market-intelligence/README.md`
- `v2/services/market-intelligence/index.ts`
- `v2/services/monitoring/README.md`
- `v2/services/monitoring/index.ts`
- `v2/services/mt5-platform/index.ts`
- `v2/services/research-lab/README.md`
- `v2/services/research-lab/index.ts`
- `v2/services/risk-engine/README.md`
- `v2/services/risk-engine/index.ts`
- `v2/services/signal-mode/index.ts`
- `v2/strategies/crypto/compression-breakout/README.md`
- `v2/strategies/crypto/compression-breakout/index.ts`
- `v2/strategies/crypto/micro-scalper/README.md`
- `v2/strategies/crypto/micro-scalper/index.ts`
- `v2/strategies/crypto/reversal-exhaustion/README.md`
- `v2/strategies/crypto/reversal-exhaustion/index.ts`
- `v2/strategies/crypto/trend-pullback/README.md`
- `v2/strategies/crypto/trend-pullback/index.ts`
- `v2/strategies/forex/index.ts`
- `v2/strategies/forex/london-breakout/README.md`
- `v2/strategies/forex/london-breakout/index.ts`
- `v2/strategies/forex/new-york-continuation/README.md`
- `v2/strategies/forex/new-york-continuation/index.ts`
- `v2/strategies/forex/swing-continuation/README.md`
- `v2/strategies/forex/swing-continuation/index.ts`
- `v2/strategies/forex/trend-pullback/README.md`
- `v2/strategies/forex/trend-pullback/index.ts`
- `v2/strategies/index.ts`
- `v2/supabase/functions/README.md`
- `v2/supabase/functions/_shared/executor-runtime.ts`
- `v2/supabase/functions/_shared/hardening.ts`
- `v2/supabase/functions/_shared/hashibridge-edge.ts`
- `v2/supabase/functions/bridge-heartbeat/index.ts`
- `v2/supabase/functions/bridge-register/index.ts`
- `v2/supabase/functions/bridge-sync/index.ts`
- `v2/supabase/functions/executor-heartbeat/index.ts`
- `v2/supabase/functions/executor-pause/index.ts`
- `v2/supabase/functions/executor-recovery/index.ts`
- `v2/supabase/functions/executor-restart/index.ts`
- `v2/supabase/functions/executor-resume/index.ts`
- `v2/supabase/functions/executor-start/index.ts`
- `v2/supabase/functions/executor-stop/index.ts`
- `v2/supabase/functions/monitoring-summary/index.ts`
- `v2/supabase/functions/mt5-account-register/index.ts`
- `v2/supabase/functions/mt5-recovery/index.ts`
- `v2/supabase/functions/mt5-terminal-health/index.ts`
- `v2/supabase/functions/platform-api/index.ts`
- `v2/supabase/functions/provider-health/index.ts`
- `v2/supabase/functions/queue-health/index.ts`
- `v2/supabase/functions/research-lab/index.ts`
- `v2/supabase/functions/runtime-health/index.ts`
- `v2/supabase/functions/telegram-platform/index.ts`
- `v2/supabase/migrations/20260705080000_v2_platform_base_fresh_project.sql`
- `v2/supabase/migrations/20260705090000_v2_trade_truth_store.sql`
- `v2/supabase/migrations/20260705100000_v2_command_queue_idempotency.sql`
- `v2/supabase/migrations/20260705120000_platform_foundation.sql`
- `v2/supabase/migrations/20260705130000_telegram_platform.sql`
- `v2/supabase/migrations/20260705180000_executor_manager_monitoring.sql`
- `v2/supabase/migrations/20260705200000_mt5_hashibridge.sql`
- `v2/supabase/migrations/20260705210000_research_lab.sql`
- `v2/supabase/migrations/20260705230000_production_hardening_retention.sql`
- `v2/supabase/migrations/20260706090000_v1_frontend_compat_backend_foundation.sql`
- `v2/supabase/migrations/20260706110000_v1_frontend_staging_compatibility_expansion.sql`
- `v2/supabase/migrations/README.md`
- `v2/supabase/policies-docs/README.md`
- `v2/supabase/schema-docs/README.md`
- `v2/supabase/seed-docs/README.md`
- `v2/supabase/seed-docs/recovery_phase2_seed.sql`
- `v2/supabase/verification/phase4_staging_smoke.sql`
- `v2/tests/arbitrator/arbitrator.test.ts`
- `v2/tests/candle-engine.test.ts`
- `v2/tests/contract/contracts.test.ts`
- `v2/tests/execution/command-queue.test.ts`
- `v2/tests/execution/crypto-certification.test.ts`
- `v2/tests/execution/exchange-providers.test.ts`
- `v2/tests/execution/execution-planner.test.ts`
- `v2/tests/execution/execution-worker.test.ts`
- `v2/tests/execution/executor-manager-monitoring.test.ts`
- `v2/tests/execution/protection-engine.test.ts`
- `v2/tests/execution/trade-management.test.ts`
- `v2/tests/execution/trade-truth-store.test.ts`
- `v2/tests/forex/forex-foundation.test.ts`
- `v2/tests/frontend/final-ui-polish.test.ts`
- `v2/tests/frontend/frontend-shell.test.ts`
- `v2/tests/frontend/step17-ui.test.ts`
- `v2/tests/frontend/step17b-runtime.test.ts`
- `v2/tests/frontend/v2-polished-runtime.test.ts`
- `v2/tests/hashicore/no-forbidden-imports.test.ts`
- `v2/tests/hashicore/runtime-pipeline.test.ts`
- `v2/tests/hashicore/trading-brain.test.ts`
- `v2/tests/market-data.test.ts`
- `v2/tests/market-intelligence/indicator-engine-step10.test.ts`
- `v2/tests/market-intelligence/runtime.test.ts`
- `v2/tests/mt5/hashibridge-edge-functions.test.ts`
- `v2/tests/mt5/hashibridge-mt5.test.ts`
- `v2/tests/platform/final-hardening.test.ts`
- `v2/tests/platform/p0-fresh-project-contracts.test.ts`
- `v2/tests/platform/platform-foundation.test.ts`
- `v2/tests/research-lab.test.ts`
- `v2/tests/risk-engine/risk-engine.test.ts`
- `v2/tests/signal-mode/forex-signal-mode.test.ts`
- `v2/tests/strategies/strategies.test.ts`
- `v2/tests/telegram/telegram-platform.test.ts`
- `v2/tsconfig.json`
<!-- V2_MANIFEST_END -->
