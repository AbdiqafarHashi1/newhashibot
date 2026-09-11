# Prompt 1 — Canonical Research Pipeline Completion

## Status

**PROMPT 1 STATUS: PASS.** The actual Backtest Lab can run raw synchronized HistoricalDataService feeds through `candidate-pipeline-replay/v1`, and can run the same feeds with the Prop Account Brain active before each candidate. This is research evidence only; it does not enable publishing, qualification campaigns, customer routing, or real execution.

## Forex and metals

The existing MT5 bridge remains the broker-history source. The Single Strategy caller now routes London Breakout, New York Continuation, FX Trend Pullback, and Gold Volatility Breakout through the candidate pipeline instead of creating its own candidate or risk result. Missing higher timeframes are deterministically aggregated from a lower native timeframe and the canonical market view exposes only closed candles.

## Crypto

Binance and Bybit adapters remain the exchange-history owners. The raw pipeline selector exposes both canonical crypto IDs without renaming them. Their registry status remains `RESEARCH_ONLY`. Crypto cost intent records maker/taker selection, fee rates, exchange slippage, quantity step, minimum quantity, and optional funding separately from the forex cost model.

## Candidate-level multi-asset replay

At each chronological candle close the engine first applies scheduled closes, builds decision-time market views, collects canonical candidates, invokes the canonical arbitrator, creates a current account snapshot, calculates canonical risk and capital, applies portfolio and optional Prop constraints, and only then creates a plan and canonical replay. A computed future result is not applied to capital/equity until its close timestamp. Rejected candidate IDs never enter completed results.

Constraints include one active trade per symbol, maximum concurrency, total open risk, capital availability, symbol exposure, strategy exposure, and portfolio exposure. Output includes accepted canonical results, rejects, R/PnL/PF/expectancy/drawdown, peak risk/concurrency, contributions, monthly results, exposure/capital timelines, quality evidence, regimes, and a deterministic run hash.

## Prop modes

`FAST_PROP_REPLAY` continues to use persisted canonical completed trades for reproducible accounting. `FULL_PROP_PIPELINE_REPLAY` evaluates the Prop gate before every candidate and updates Prop account truth only as accepted trades close. A daily safety lock blocks later candidates, a soft guard reduces later canonical risk/capital, and blocked entries do not disable lifecycle management for already accepted trades. The pipeline is provider-independent, so MT5 forex/metals and exchange crypto can use a compatible Prop profile without conflating firm rules with execution-provider assumptions.

## Regime, walk-forward, stress, and quality

Every accepted candidate receives `decision-regime/v1` evidence containing timestamp, source timeframe, lookback, transparent inputs, classification, and the last input candle time. The last input must be closed before the decision.

Walk-forward UI controls now accept independent positive training, test, and step values in days, weeks, or months. Window code rejects invalid durations and continues to aggregate only test-window trades.

Path-aware stress retains the actual canonical plan and observation path. Entry delay replays from the next real observation; exit delay and worse fill reference an actual subsequent candle. Missing path evidence throws rather than inventing a price.

New HistoricalDataService feeds carry their quality report into the browser feed and new single canonical `backtest_runs` persist it. Older results display `QUALITY_EVIDENCE_UNAVAILABLE`.

## Operator workflow

1. Sync MT5, Binance, or Bybit history in Backtest Lab.
2. Select an exact canonical registry strategy in **Research & Strategy Validation**.
3. Select **SINGLE**, **MULTI ASSET**, or **PORTFOLIO** and run **RUN RAW-BAR CANONICAL PIPELINE**.
4. Inspect accepted trades, rejects, exposure/capital and regime evidence.
5. Select **FULL PROP PIPELINE** and run the $100K research profile replay, or use **FAST PROP** for a persisted completed-trade run.
6. Use custom walk-forward controls and retained-path stresses before certification.

## Tests and boundaries

The focused Prompt 1 suite proves Binance and Bybit candle inputs create canonical crypto completed trades with exchange costs, simultaneous candidates are arbitrated before results, rejects cannot become trades, account snapshots precede outcomes, ordering is deterministic, regime evidence has no future candle, retained-path stress uses real observations, daily Prop safety blocks, soft guard reduces risk, and Fast/Full modes remain distinct.

Qualification campaigns, onboarding, production strategy-set routing, connected Windows MT5 proof, and real-money execution are deliberately outside Prompt 1.
