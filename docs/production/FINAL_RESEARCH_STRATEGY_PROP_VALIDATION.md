# Final Research, Strategy, and Prop Validation

## 1. Research architecture actually used

The Research & Strategy Validation workspace consumes persisted `CanonicalCompletedTradeResult` records from `backtest_runs`. It never creates signals or recomputes exits. All analyses retain the source run ID/hash, strategy/configuration versions, datasets, execution-cost record, and historical provenance.

## 2. Backtest workflow

The existing Single Strategy Backtest remains the run creator. Canonical production strategies use canonical replay and persist completed trades. The new workspace on Backtest Lab selects those runs and displays evidence-derived PnL, R, trade statistics, equity/drawdown summaries, monthly results, R distribution, costs, ambiguities, and sample warnings.

## 3. Historical data/data quality

HistoricalDataService remains the candle owner and its validation rejects invalid OHLC/non-finite bars and reports missing, duplicate, out-of-order, stale, and session intervals. Research-run validation additionally checks duplicate trade IDs, invalid chronology, non-finite results, and dataset lineage. Candle quality reports are not yet persisted into `backtest_runs`, so the UI cannot display every original candle-quality detail.

## 4. Cost model

Canonical results preserve spread, slippage, commission, financing, gross/net PnL, and gross/net R. Stress analysis changes costs externally and never changes strategy decisions. Baseline and stressed provenance remain visibly distinct. Entry/exit delay scenarios are not applied because persisted completed trades lack the future candle path required to do that without guessing.

## 5. OOS

The operator may select 60/40, 70/30, or 80/20 chronological splits. IS and OOS metrics remain separate, and PF, expectancy, return, drawdown, and trade-frequency deterioration are displayed. Configuration selection is not performed on OOS data.

## 6. Walk-forward

The current workspace evaluates fixed six-month training, one-month test, one-month step windows. Only test-window trades enter aggregate OOS results. Window boundaries, configuration version, metrics, trade counts, consistency, and profitable/losing window counts are retained. Custom window controls remain outstanding.

## 7. Parameter robustness

Robustness compares separately persisted runs of the same strategy with distinct configuration versions/hashes. It labels the observed surface `ROBUST`, `SENSITIVE`, or `FRAGILE` and never promotes or mutates the reference configuration. The UI does not yet launch bounded parameter variants itself.

## 8. Stress testing

Implemented scenarios are baseline, 1.25x/1.5x/2x spread, low/medium/high slippage, higher commission, deterministic missed-trade rate, and combined stress. Output includes net R, PF, expectancy, and drawdown. Delay/worse-fill scenarios require candle-path replay and remain disabled rather than fabricated.

## 9. Monte Carlo

Deterministic trade-order permutation and bootstrap engines consume only canonical completed trades. They return 5th/25th/50th/75th/95th percentiles for ending R/PnL, drawdown, and losing streak, plus empirical breach frequency. The UI exposes 100, 500, 1,000, and 5,000 simulations and labels results empirical rather than guaranteed.

## 10. Regime analysis

The current grouped view uses an explicit completed-trade excursion/outcome proxy because candle-regime labels are not persisted with the run. It is diagnostic only and cannot satisfy regime certification. Proper trend/range/volatility analysis requires persisting deterministic market-view regime labels at decision time.

## 11. Multi-asset

The workspace chronologically merges canonical completed trades from selected persisted runs, prevents same-symbol overlap, and records portfolio rejects. It does not rerun simultaneous canonical candidates from candles, so candidate-level multi-asset arbitration remains outside this UI.

## 12. Portfolio risk/capital

The portfolio view enforces configured concurrency, one-active-per-symbol, and aggregate open-risk-unit caps with explicit reject reasons. It is an analysis projection over completed trades, not a replacement for canonical risk/capital intent. Candidate-level canonical capital competition remains a blocker for full product PASS.

## 13. Strategy comparison

The sortable-source comparison table displays strategy/configuration, trade count, net R, PF, expectancy, and drawdown. No single metric automatically chooses a winner.

## 14. Prop challenge integration

Selected canonical research runs remain directly available to Prop Operations for Full Challenge, Multi-Challenge, Funded Survival, and payout-cycle simulation. Manual PnL remains debug-only.

## 15. Funded survival

Prop Operations supports 30/60/90/180/365-day funded evidence using the remaining chronological canonical trades. Results remain historical simulation evidence.

## 16. Strategy certification

Certification uses an explicit operator research policy, labelled `RESEARCH POLICY — NOT GUARANTEE`. It checks total/OOS samples, OOS PF and expectancy, drawdown, walk-forward consistency, OOS degradation, stressed PF, and Monte Carlo drawdown. It can recommend forward testing but never marks production approval automatically.

## 17. Research UI

Backtest Lab now contains one workspace with Overview, OOS, Walk Forward, Stress, Monte Carlo, Multi Asset, Comparison, Prop Validation, Certification, Trades, and Failures views. Charts show monthly net R, R distribution, and walk-forward OOS results; tables expose stress, portfolio rejects, comparisons, trades, regimes, and sessions.

## 18. Persistence/reproducibility

Analysis is appended to the originating `backtest_runs.result_summary`. Run hash, dataset IDs, strategy/configuration versions, execution model, and Monte Carlo seed are preserved. Identical run evidence and seed yield identical Monte Carlo output. No candle bulk data is added to Supabase.

## 19. Tests

The focused suite covers canonical metrics/costs, chronology and dataset quality, OOS isolation, walk-forward boundaries, stress impact, deterministic 1,000-run Monte Carlo percentiles, session/direction/group analysis, chronological portfolio rejection, robustness comparison, non-automatic certification, immutable forward configuration, and actual Backtest Lab UI wiring.

## 20. Product readiness

**RESEARCH PRODUCT STATUS: PARTIAL.** Canonical-run analysis, OOS, fixed walk-forward, cost stress, Monte Carlo, grouped analysis, comparison, certification policy, trade explorer, failure analysis, Prop handoff, persistence, and forward freeze work. Full PASS is blocked by candidate-level canonical multi-asset replay/capital competition, candle-derived regime persistence, UI-launched bounded parameter variants, custom walk-forward inputs, and candle-path delay/worse-fill stresses.

## 21. Forward-validation candidates

No strategy is pre-approved. A run becomes a `FORWARD_VALIDATION_CANDIDATE` only if its actual persisted evidence passes the configured research policy. The UI enables immutable export only in that state. Crypto strategies retain their registry `RESEARCH_ONLY` status.

## 22. Exact next operational step

Run each canonical forex/gold strategy over a sufficiently long broker-native dataset, inspect data-quality/sample warnings, execute OOS/walk-forward/stress/Monte Carlo/Prop validation, and explicitly freeze only policy-passing runs. Before declaring the overall research product complete, add decision-time regime labels and candidate-level chronological portfolio replay using canonical risk/capital. Do not begin connected MT5 forward validation until a real run earns the candidate status.
