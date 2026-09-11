# Phase 2 — Connected Research Pipeline

Date: 2026-09-09. Status: **PARTIAL** pending deployment, connected-Windows verification, complete strategy declarations, and full per-dataset UX. No real-money or prop execution behavior was enabled.

## 1. Phase 1 starting state

Phase 1 established canonical types, validation, a basic IndexedDB cache, cache-first service, provider adapters, and the agent-side `FETCH_HISTORY` terminal method. Browser enqueue/await, pagination, session-aware gaps, multi-timeframe orchestration, persistent research context, lookahead helpers, and UI adoption were missing. Backtest and Prop Clearance still shared in-memory feeds but Backtest downloaded directly and auto-ran synthetic data.

## 2. MT5 browser transport implementation

`createMT5BrowserTransport` calls the authenticated existing `mt5-accounts` Edge Function. It enqueues `FETCH_HISTORY`, retains the returned command ID, polls that exact ID with a bounded timeout, and maps `QUEUED`, `CLAIMED`, `COMPLETED`, `FAILED`, `TIMED_OUT`, `BRIDGE_OFFLINE`, and `MT5_OFFLINE`. The existing `mt5_commands` table, enqueue RPC, bridge claim, agent processor, and acknowledgement are reused. No second command queue exists. `RUNNING` is a supported client state but the queue currently exposes only claimed state.

## 3. Security/authorization model

The Edge Function validates the bearer JWT, looks up the selected account, and uses the pre-existing owner-or-admin check. Enqueue runs through the caller-JWT `enqueue_mt5_command` RPC. Phase 2 adds only `FETCH_HISTORY` to that RPC's operation allow-list. The endpoint validates contract version, conservative symbol syntax, seven native timeframes, ordered finite dates, and a five-year maximum. Status reads are scoped by account, operation, command UUID, and the same owner/admin gate. Bridge credentials and the service-role key never enter the browser.

## 4. Real bridge/terminal status semantics

The status response separates cloud reachability, bridge lease/heartbeat, terminal reachability, terminal authentication, selected account, broker/server, and last heartbeat. Bridge ONLINE requires a live registry status and unexpired lease. Terminal/authentication are UNKNOWN unless heartbeat `connection_info` provides explicit booleans. No optimistic defaults are used. Missing MT5 data never changes provider; service errors retain requested/cached/missing ranges.

## 5. Connected MT5 verification results or exact external test procedure

This Linux environment has no MetaTrader5 package or user's Windows terminal, so no connected result is claimed. Unit verification covers all timeframe constants and suffix resolution output.

External procedure:

1. Deploy migration `20260909010000_phase2_mt5_history_command.sql` and the updated `mt5-accounts` and `mt5-bridge` functions.
2. Update/restart the Windows HashiBot MT5 agent from this revision; confirm its heartbeat is current and MT5 is logged in to the selected account.
3. Open Admin → Backtest Lab, choose **MT5 — BROKER NATIVE**, paste the real account UUID, choose M5, M15, then H1, and click **Download & Auto-Sync**.
4. Test EURUSD and XAUUSD on seven days, then a larger period. Do not enter a suffix: agent discovery resolves `EURUSD`, `EURUSDm`, `EURUSD.a`, `XAUUSD`, `GOLD`, or another broker name.
5. In browser developer tools call `verifyMT5History(createMT5BrowserTransport(), accountId)` if a machine-readable matrix is required. Record canonical/resolved symbols, broker/server, requested/returned bounds, count, spread/tick/real-volume presence, and elapsed milliseconds returned by the helper.
6. Stop the bridge and rerun a fully cached request (must succeed), then extend the end date (must report BRIDGE_OFFLINE and missing coverage).

## 6. SharedResearchContext implementation

The v2 context persists lightweight selection in `localStorage`; bars never do. It includes provider, account/broker/server/environment, symbols, primary and required timeframes, evaluation and warm-up data ranges, dataset keys, strategy/version, execution model, and mode. Mode switching changes only `mode`, preserving datasets and dates.

## 7. Multi-timeframe architecture

`ensureResearchData` expands the cross-product of symbols and required timeframes and asks the one `HistoricalDataService` for each request. Dataset identity includes provider, environment, account, broker, server, canonical/source symbol, and timeframe. M1/M5/M15/M30/H1/H4/D1 coexist without key collision. Single, multi-asset, and Prop receive the same feed objects produced from those canonical datasets.

## 8. Strategy-required timeframe resolution

A small canonical registry currently declares requirements for FXTrendPullback, GoldVolatilityBreakout, LondonBreakout, and CryptoCompressionBreakout; unknown strategies retain the selected primary timeframe. The resolver unions all selected-strategy requirements and computes the largest warm-up. This registry is intentionally data metadata, not strategy logic. Remaining strategies need audited declarations before certification.

## 9. Native vs derived timeframe handling

MT5 requests every requirement natively. `aggregateCandles` is an explicit research utility only: its output has `derived=true`, source dataset/timeframe, target timeframe, and `UTC_ALIGNED_COMPLETE_INTERVALS_V1`. Derived data is not inserted as broker-native or promoted to certification. The deterministic spread policy is the final source bar's stored spread; volume fields sum.

## 10. Higher-timeframe lookahead protections

Aggregation uses UTC target boundaries, validates an integer timeframe ratio, demands every contiguous source bar, and excludes a bucket until its close is at or before `asOf`. `lastCompletedCandleAsOf` selects by explicit close time rather than array position. `evaluationBars` removes warm-up bars from reportable evaluation input.

## 11. Backtest Lab migration

The compact Research Data Manager selects explicit SIMULATION, MT5, Binance, or Bybit sources and exposes pipeline state. Real sync calls `ensureResearchData`; the former direct `/api/market-data/history` call was removed. Single Strategy's “live” branch now reads only the canonical feed supplied by the parent and cannot independently download. Initial auto-run/sync was removed. Synthetic generation remains only behind the explicit SIMULATION label.

## 12. Prop Clearance migration

Prop Clearance continues to receive the exact parent feed collection and rules are unchanged. It now recognizes only `*:CANONICAL_CACHE` or explicit broker CSV as real research input; Yahoo/ambiguous `live_feed` labels no longer qualify. It does not fetch independently. Its generated sample remains a clearly described sample fixture.

## 13. One-click data-resolution workflow

Sync/RUN foundation resolves strategy requirements, persists context, expands symbol/timeframe requests, checks cache, fetches only missing intervals, validates, caches, and maps the primary dataset into existing engine bars. Progress reports named states rather than invented percentages. A completely cached request never invokes its adapter.

## 14. Binance pagination

Public spot klines page chronologically from `startTime`, obey 1,000 rows, advance one native interval, cap pages, reject non-advancing responses, retry bounded transient/rate-limit statuses with exponential backoff, accept AbortSignal, deduplicate boundaries, sort, and exclude an open final candle unless explicitly requested.

## 15. Bybit pagination

Public V5 linear klines use the same guarantees, map native interval names, handle reverse-ordered pages deterministically, validate `retCode`, and advance from the maximum returned timestamp. Execution clients remain untouched.

## 16. Market session handling

The framework distinguishes CRYPTO 24/7, weekday FOREX, and configurable METALS. Weekend closures are omitted from required-gap ranges and counted separately rather than penalized. Metals weekdays are initially UNKNOWN_SESSION because broker breaks and holidays vary; callers can supply overrides. This is an honest foundation, not a complete holiday calendar.

## 17. IndexedDB hardening

Schema v2 performs guarded object-store/index upgrades, rejects blocked upgrades, writes configurable 2,000-bar transactions, translates quota failures without deleting data, and exposes dataset/symbol/timeframe/bar/storage-estimate/last-sync statistics. Dataset deletion is explicit. Deterministic `put` prevents boundary duplicates and unrelated datasets are not rewritten.

## 18. Research Data Manager UX

Backtest Lab now has one compact source/account/progress panel rather than a new page. Existing dataset cards show mapped feed source/count/state. Detailed per-timeframe coverage tables, verification/delete buttons, and status evidence visualization remain incremental UX work; underlying APIs exist.

## 19. Exact data parity evidence

All three current modes receive `multiAssetFeeds` from the same parent state. Real entries are mapped once from `ResearchDataBundle` canonical datasets. Single Strategy no longer fetches; Prop Clearance never fetched and now rejects old ambiguous sources. Deterministic tests prove stable keys across modes, isolation across timeframe/provider/broker, and offline cache reuse.

## 20. Full strategy/live dependency inventory

| Subsystem | Backtest implementation / dependencies | Live/scanner implementation / dependencies | Difference / Phase 3 consequence |
|---|---|---|---|
| Indicators and warm-up | `backtest/evaluators.ts`, `simulationEngine.ts`; pure browser arrays, implicit index warm-up | `_shared/indicator-engine.ts`; Deno input candle arrays | Duplicate formula/warm-up ownership; extract canonical pure indicator package. |
| Timeframe alignment / visibility | Mostly one selected feed/index; Phase 2 helpers are not evaluator-wired | `market-scanner/index.ts` obtains recent provider frames; strategy-specific access | Neither path shares a formal as-of view; canonical market-view builder must own close visibility. |
| Strategy definitions/parameters | `StrategyConfig.tsx`, `presetStorage.ts`, browser mutable defaults/localStorage | `_shared/professional-strategies.ts`, `forex-production-strategies.ts`, `strategy-plan.ts`; Deno/config rows | IDs and parameters overlap but executable code differs. Registry needs versioned schema and one evaluator implementation. |
| Required timeframes | Phase 2 research metadata registry, incomplete declarations | Implicit inside scanner/strategy requests | Move declarations beside canonical strategy definitions. |
| Candidate generation/scoring | `evaluators.ts` returns backtest candidates; simulation applies local scores | production strategies/`forex-signal.ts`, then `_shared/arbitrator.ts` | Shapes, thresholds and reasons differ; define one candidate contract and pure generator. |
| Arbitrator | `simulationEngine.ts` conflict policies/weights | `_shared/arbitrator.ts`, scanner orchestration; may use runtime/account state | Duplicated selection; canonical pure arbitrator with explicit state snapshot required. |
| Risk sizing | Browser environment/capital pool calculations in simulation | `_shared/professional-risk-engine.ts`, account execution brains; policy/Supabase state | Materially different. Live risk module must own shared calculation; replay injects historical account snapshots. |
| Capital allocation | `CapitalPoolManager.tsx` and simulation pools | `_shared/professional-capital-allocation.ts` | Duplicate allocation models; canonical capital allocator should be environment-neutral. |
| Stops/targets | Evaluators and simulation parameters calculate local prices/R | strategy-plan, production strategies and execution planning | Formula/order rounding differs; move intent calculations to canonical strategy plan, broker rounding to adapter. |
| Partial TP, breakeven, trailing | `simulationEngine.ts` candle outcome state | `_shared/trade-management/*` lifecycle/policies; provider capabilities and runtime state | Backtest lifecycle is separate. Replay canonical trade-management events against candles in Phase 3. |
| Session filters | Browser environment flags/index timestamps | production forex strategies/provider/scanner session checks | Calendar/timezone behavior differs; canonical session service should be injected. |
| News filters | Limited/absent in backtest evaluator context | scanner/intelligence/news windows and account brains | Replay needs immutable event inputs or explicit “news unavailable” provenance. |
| One-active-symbol rules | simulation concurrent/conflict options | account brain/arbitrator/open-position queries | Live is stateful/Supabase dependent; canonical decision accepts explicit portfolio state. |
| Account/prop restrictions | Prop Clearance browser rules and `propRulesEngine.ts` | MT5 prop brain, risk engine, account policies | Similar intent, different code/state. Keep prop policy engine separate from strategy but shared between replay/live. |
| Execution assumptions | OHLC hit order, configured spread/slippage/fees | provider quote, symbol spec, execution planner/router | Backtest intrabar ambiguity is not live truth; canonical execution model must report assumptions. |
| Outcome calculation | simulation scans later candles and chooses local result | trade truth/outcome jobs and actual fills | Backtest theoretical outcome differs from fill truth; common lifecycle schema, distinct truthful observation adapters. |
| Environment/state | React/localStorage, pure-ish loops plus timers | Deno, Supabase, secrets, provider HTTP, account/position state | Canonical core must be pure TypeScript; adapters supply time, persistence, news, account, and broker capabilities. |

Canonical ownership recommendation: a single environment-neutral TypeScript domain package owns candle views, indicators, strategy evaluation, candidate contract, arbitrator, risk intents, capital intents, and trade-management state transitions. Browser replay and Deno live scanner become adapters that supply immutable inputs and persist/output decisions. Provider adapters alone own networking, credentials, symbol rounding, orders, and fills. Prop policy remains a shared policy input, not a second strategy brain.

## 21. Tests run

- `npm run test:historical-data`: Phase 1 regression passed.
- `npm run test:phase2-research`: aggregation, lookahead, sessions, context, isolation, pagination, boundary ordering, browser polling states and endpoint security contract passed.
- `npm run test:backtest-csv`: passed.
- `python -m unittest discover -s tests -p 'test_*.py'` from `mt5-agent`: passed, including seven mappings and unsupported rejection.
- focused Phase 2 TypeScript compile: passed with zero Phase 2-local errors.
- `npm run build`: passed.
- `npm run typecheck`: retains the documented pre-existing application baseline; Phase 2 introduces no errors in focused compilation.

## 22. Remaining simulated/legacy paths

Explicit SIMULATION feed generation and sample CSV remain. Standalone old scripts and server Yahoo endpoint still exist for legacy/non-migrated uses, but migrated Backtest components no longer call that history endpoint. Local mock/default MT5/cTrader account displays elsewhere remain non-broker truth.

## 23. Open risks

Deployment is required before browser MT5 transport works. Connected Windows proof is outstanding. Queue result JSON temporarily contains returned bars until existing command retention removes it; it is transport state, not a research warehouse, but very large responses may hit platform limits and should be chunk-streamed in a later protocol revision. Session holidays/metals breaks need broker calendars. Strategy requirement declarations are incomplete. The compact UI lacks full dataset rows/actions. Existing evaluators still do not consume Phase 2 multi-timeframe views, so data readiness is first-class but strategy parity is not.

## 24. Exact recommended Phase 3 architecture

Create one pure, versioned `trading-domain` package shared by browser and Edge/Deno. First move canonical candle-as-of views and indicators with golden parity tests; then strategy declarations/evaluators and candidate schema; then arbitrator/risk/capital/trade-management state machines. Make every environment dependency an injected adapter. Replay must feed the same domain entry point and persist decision traces; live scanner must call that entry point before existing execution adapters. Do not change execution enablement until shadow/replay golden traces match and connected MT5 history verification passes.
