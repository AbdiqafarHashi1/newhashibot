# Mission 1 engineering checkpoint

Base: main `7adbde5cd4f01d9a274a0952434fe9e8d23b1612`. No deployment, promotion, provider orders, or profitability campaign.

## Implemented source paths

- `market-scanner/index.ts` and independent `conditional-watch/index.ts` use `watched-strategy-discovery.ts`, the existing named evaluator registry, and `entry-decision.ts`.
- Canonical decisions include identity, frozen strategy version, closed-data timestamp, net reward/risk, regime evidence, explicit reasons, and execution eligibility. A completed named evaluation inside its original entry zone is immediate; it does not wait for another candle.
- MicroScalper can admit its specific incomplete-body setup only when every other exposed named gate passes. Its original evaluator must subsequently confirm. Arbitrary evaluator rejections are never converted into watches.
- `frozen-strategy-confirmation.ts` resolves the original evaluator/version and parameters. The scanner and watcher pass the same higher-timeframe/reference context. Frozen plans are not rewritten.
- `conditional-signal-runtime.ts` loads all bounded open states, performs CAS expiry without candles, records arbitration rejections, and retains missing-data watches. `conditional-watch.ts` runs expiry even with discovery paused or unavailable feeds.
- `entry-regime.ts` reuses the existing causal classifier, distinguishes seven regimes, and enforces family/direction eligibility. `conditional-market.ts` explicitly models different liquidity reserves and FX/JPY/gold units; these are estimates, not observed costs.
- Immediate admission reuses the existing transactional watch ledger, qualified signal projection, and canonical publication outbox. Release projection failure rolls the transaction back. Telegram payloads carry the same confirmed signal ID as account execution.
- `20261104224012_mission1_entry_lifecycle.sql` preserves immutable setup fields, CAS, terminal fences and history/outbox transactions; adds no-candle expiry, safe unavailable-data evaluation, immediate admission proof, and genuine admin decision coverage.
- `ConditionalSignalsPanel.tsx` displays actual backend entry decisions/reasons and immediate counts.
- Research parameter injection is now definition-specific in the existing registry. No strategy IDs were added.

## Qualification boundary

The new entry policy requires BOTH a promoted immutable configuration and `params.entry_engine_version = 1`. This marker must be part of the configuration measured and approved in Mission 2. No existing approval silently approves this new entry policy. Core analysis configurations may still produce explicitly paper watches; their canonical customer entry decision is NO_TRADE/unqualified and execution projection remains blocked. Research/disabled and targetless/native-management-only evaluators are not promoted.

Core evaluator inventory remains four Crypto evaluators (MicroScalper, QuickScalp, CompressionBreakout, SwingContinuation) and six Forex/Gold evaluators (MicroScalper, SwingContinuation, LondonBreakout, NewYorkContinuation, TrendPullback, GoldVolatilityBreakout). Existing specialist research definitions remain in the catalog without new activation.

## Executed verification

- `node --import tsx --test --test-concurrency=2 tests/conditionalSignals/*.test.ts`: 57 passed / 0 failed / 1 optional native-runtime test skipped (58 total).
- New database pipeline: actual evaluator/discovery → atomic admission → measured signal projection → Telegram rendering → real account policy/risk/capital sizing → simulated provider receipt. Same signal identity; expired entitlement, no capital, replay, forged immediate entry, and revoked release rejection.
- Embedded PostgreSQL tests cover immutable history, expiry without a candle, terminal rejection, outbox rollback, release matching and idempotence. They do not establish independent-session concurrency.
- `npm run test:operations-readiness`: 113 TypeScript tests, 22 embedded DB tests, 8 Python tests passed.
- `npm run test:forex-production`, `test:gold-production`, `test:strategies`, `test:account-execution-controller`, `test:risk-engine`, `test:capital-allocation`, `test:trading-domain`, `test:production-eligibility-router`, `test:phase-m`: passed.
- `npm run typecheck`, `typecheck:account-authorization`, `check:edge-bundles` (39/39), `build`: passed. `npm run lint`: no errors, 34 existing warnings.
- `npm run typecheck:entry-engine`: passed, including the full production entry/discovery/watcher dependency graph under strict TypeScript. Optional distance defaults and unavailable Forex metadata were corrected without relaxing types.
- Narrow NodeNext checking of the expanded pipeline test reaches existing Deno/npm: runtime imports and extensionless test support imports; it is not a successful Deno runtime typecheck. Production engine-only typing and Edge bundling are separate checks.

## Remaining verification / known limitations — do not call Mission 1 complete

1. Native PostgreSQL cannot run locally (no Docker/non-root process support). GitHub PostgreSQL 15 CI applied all 201 migrations on the unchanged chain, then FAILED the new concurrent trading admission assertion. The draft is not merge-ready. Expanded native SQL evidence identified a real missing service_role SELECT grant on signals. This migration now explicitly grants only the worker table privileges needed by admission/projection. The immediate pipeline also passes under SET ROLE service_role, not just the test DB owner. Rerun PostgreSQL 15/17 before readiness claims.
2. `npm run test:phase-l-engineering` passes 20 engineering suites and explicitly defers 10 historical archive audits. CI now uses this engineering scope. Release 1 similarly has an explicit --engineering scope that defers its removed diagnosis archive audit; its strict default remains available. The original strict `test:phase-l` is unchanged and still fails without the authentic .gz archives intentionally removed from main for Bolt. No historical evidence is fabricated, restored into the deployable source, or represented as qualified.
3. Bounded genuine-candle HTTP acquisition failed. Controlled tests prove engineering behavior, not historical or broker qualification. No fresh real-data sanity check is claimed.
4. Account authorization now applies a shared conservative risk-factor budget to observed positions and the actual authorized new risk. Crypto market and shared FX/Gold currency factors do not assume opposite positions hedge. Admin controls may narrow maxCorrelatedRiskPct but cannot expand portfolio policy. Direct account-authority and risk-factor tests pass; cross-account/global-customer portfolio aggregation is not implemented or claimed.
5. The expanded production-module matrix now covers immediate SQL-to-account/provider simulation, persistent conditional confirmation through the genuine frozen evaluator, restart/recovery, invalidation, expiry, stale data and conflict suppression. Conditional customer execution across each provider and the exhaustive portfolio matrix still require additional integration coverage. Controlled clocks are injected at the external JS/embedded-DB clock boundary; frozen market evidence is not rewritten to make tests pass.
6. Live Supabase/Auth/Cron/PostgREST, Telegram delivery, MT5 bridge, Binance and Bybit connectivity were not activated or verified. These belong to the later deployment mission, not local engineering.

Continue from this checkpoint on the same branch. First finish native CI verification, close the production-path matrix and portfolio/arbitration audit; preserve research isolation and the Backtest Lab. No owner credentials are needed for remaining local work.
