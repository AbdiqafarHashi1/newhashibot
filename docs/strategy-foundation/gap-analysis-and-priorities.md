# Gap Analysis and Phase 1B Priorities

## Cross-cutting gaps

| Area | Gap | Consequence | Phase 1B direction (no economics change) |
|---|---|---|---|
| Documentation | Identity/capability metadata exists only through runtime construction and this audit. | Drift between code, UI, backtest and operator understanding. | Add validated manifests and an inventory parity test. |
| Parameters | DB values, loader defaults, evaluator defaults and runtime overrides form multiple truth layers. | A candidate is not reproducible from stored strategy name/version alone. | Persist config source, resolved values, version/hash with every evaluation. |
| Duplicate logic | Candle validation, ATR checks, score grading, candidate construction, entry bands and rejection builders repeat. | Reason/precision behavior can diverge. | Extract pure common helpers only behind characterization tests. |
| Indicators | Some evaluators use supplied snapshots; others recompute indicators. Indicator version is absent. | Backtest/live and cross-strategy parity cannot be proven. | Version indicator engine and store input boundary/output snapshot. |
| Qualification | Eligibility, evaluator gates, distance guard and arbitration-adjacent filters are dispersed. | Silent gaps and ambiguous rejection stages. | Emit ordered gate ledger with stage and canonical reason. |
| Liquidity/news | Crypto has no explicit spread/order-book/news input; live Forex lacks research preflight parity. | Strategy may qualify in conditions contrary to its thesis. | Certify context availability; initially report `unknown`, do not invent or add a live gate. |
| Risk | Strategy proposal and downstream account sizing are not formally separated. | Levels can be mistaken for complete risk authorization. | Define `StrategyPlan` then immutable `SizedExecutionPlan`. |
| Protection | Strategy-specific partial/BE/trailing intent is absent. | Shared behavior may not match strategy lifecycle assumptions. | Record current shared policy/version per plan; do not alter behavior. |
| Reporting | No universal evaluation-to-order-to-exit correlation ID. | Incomplete funnel and outcome attribution. | Introduce immutable correlation and event taxonomy. |
| Archive | Config/indicator/data provenance is insufficient for replay. | Cannot reproduce a historical decision exactly. | Archive hashes/references and terminal event sequence under retention rules. |
| Research | Fixed-confidence shadow strategies do not use a comparable score surface. | Shadow comparison can mislead. | Label confidence provenance; certification must not treat fixed values as calibrated. |

## Per-strategy gaps

| Strategy | Documentation / parameters | Duplicate/shared opportunity | Lifecycle, risk, protection and reporting gaps |
|---|---|---|---|
| MicroScalper | 5m overrides and fallback vs DB resolution are complex; liquidity assumption undocumented before this audit. | Share trend/momentum/ATR gates and HTF context contract. | HTF-fetch failure becomes rejection indirectly; no config/data hash; management intent not attached. |
| QuickScalp | Least explicit metadata; compact lifecycle and “quick” horizon not a formal invariant. | Shares much of MicroScalper indicator, grading and candidate logic. | Cost/slippage sensitivity absent; expiry and time exit need one certified source. |
| CompressionBreakout | Box/retest/early-breakout modes occupy one evaluator with many tunables. | Reusable compression, breakout freshness and structure components. | No higher-timeframe obstacle/liquidity context; false-break outcome classification not canonical. |
| SwingContinuation | “Quality reclaim” vs strict reclaim is nuanced and not versioned as a mode. | Pullback/reclaim logic overlaps CryptoTrendPullback and Forex continuations. | Structural invalidation thesis not a field; shared management may outlive intended continuation. |
| CryptoTrendPullback | Fixed parameters/confidence and generic research config. | Can reuse canonical pullback context rather than duplicate basic checks. | Shadow-only outcome funnel/retention unclear; no liquidity/reclaim evidence. |
| ReversalExhaustion | Edge is intentionally minimal; no divergence/trend definition. | Shared extreme/structure context and research result builder. | Highest trend-opposition risk; outcome labels should distinguish failed reversal vs no reversion. |
| ForexMicroScalper | Scanner defaults 15m/1h while evaluator accepts 5m/15m: effective fallback is 15m. Loader/evaluator RR defaults differ. | Unify Forex context, precision, session and spread preflight with research strategies. | Live evaluator does not receive authoritative spread/provider/freshness context; MT5 symbol mapping lineage absent from result. |
| ForexSwingContinuation | Loader min RR 1.4 vs evaluator default 1.45; XAUUSD inclusion blurs FX vs metal thesis. | Share Forex trend/pullback context and pip-aware plan builder. | No authoritative session/spread gate in evaluator; correlation/portfolio currency risk is downstream and unlinked. |
| London Breakout | Asian range uses UTC close-hour logic while session engine is timezone/DST-aware; range day boundary intent needs formalization. | Share session-range builder and common Forex candidate/preflight. | Holiday input ownership, gap handling and breakout failure outcome not certified. |
| New York Continuation | “Session move” uses recent bars, not an explicit London/session-open anchor. | Share session-anchor and continuation state. | Reversal-at-open risk and news context absent; shadow outcome linkage incomplete. |
| Forex Trend Pullback | Fixed confidence and simplistic EMA trend/pullback state. | Strong overlap with live ForexSwingContinuation; compare intentionally before consolidation. | No explicit correlated exposure/news; swing invalidation is evidence, not typed intent. |
| Gold Volatility Breakout | Static 2.5 price-unit stop floor and fixed thresholds require provenance, not optimization in 1A/1B. | Share breakout/compression primitives while preserving gold precision. | Metals risk class is evidence only; contract/lot specification, spread shock and news lineage are absent. |

## Potential duplication versus legitimate variants

- **MicroScalper vs QuickScalp:** related momentum family; preserve separate identities until lifecycle/outcome evidence proves duplication.
- **SwingContinuation vs CryptoTrendPullback:** same regime family, but live strategy has richer reclaim/scoring. Treat the research version as a baseline, not an accidental alias.
- **ForexSwingContinuation vs Forex Trend Pullback/New York Continuation:** share continuation primitives but differ by session and entry narrative. Extract primitives, not a mega-strategy.
- **CompressionBreakout vs London/Gold breakouts:** common compression/breakout vocabulary; session, instrument and range construction are materially different.

## Phase 1B recommended priorities

### P0 — Freeze and prove truth

1. Add a machine-readable manifest for all 12 identities, versions, lifecycle/publication state, symbols, timeframes and dependency capabilities.
2. Characterize current evaluator and scanner boundaries with golden parity fixtures from deterministic repository fixtures—not mock market outcomes and not live calls.
3. Resolve and persist effective configuration provenance (without changing values): DB/fallback/override, complete resolved parameter set, version and hash.
4. Assign an evaluation/correlation ID and closed-candle/data-source boundary to every result, including rejections and research observations.

### P1 — Certify the contract and funnel

5. Introduce the versioned `StrategyPlan` envelope alongside the legacy payload; prove field-level parity before downstream adoption.
6. Emit a canonical qualification gate ledger and reason taxonomy without changing pass/fail decisions.
7. Prove candidate → qualification → arbitration transitions, including every silent skip, research exclusion and duplicate decision.
8. Freeze the approved plan and prove arbitration cannot mutate its economic levels.

### P2 — Certify downstream lifecycle

9. Produce a `SizedExecutionPlan` lineage record showing risk, leverage, capital basis and guard decisions separately from strategy intent.
10. Trace idempotent plan → order → fill → protection coverage across each active venue path without changing venue behavior.
11. Version and attach current partial, break-even, trailing and time-exit policy; verify each management transition and terminal exit.
12. Reconcile operator/customer reporting and analytics to canonical lifecycle facts, then prove archival reproducibility and retention.

### P3 — Prepare later research (not Phase 1B optimization)

13. Unify live Forex with `ForexMarketContext` in a separately parity-certified change.
14. Extract common pure primitives after characterization, one family at a time.
15. Only after lifecycle certification, design research for liquidity/news features, regime fitness, parameter consistency and profitability.

## Explicit non-priorities

Phase 1B should not tune thresholds, add indicators, merge strategies, change arbitration weights, alter execution/protection, enable research publication, deploy, or update database rows. Those activities would obscure whether lifecycle differences came from certification work or changed trading behavior.

