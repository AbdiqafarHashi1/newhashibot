# HashiBot V2 Professional Strategy Framework

## Audit classification

| Area audited | Classification | Why |
| --- | --- | --- |
| `v2/strategies/index.ts` V2 candidate shell | Reuse & Improve | Kept the registry/runner idea and deterministic no-execution boundary, but replaced the thin scoring model with identity, health, certification, metrics, grades, feature/indicator snapshots, expiry and richer reason codes. |
| Strategy subfolder exports | Reuse As-Is | The folders are stable import boundaries, so they continue to re-export the canonical framework strategies. |
| V1 scanner/backtest reports under `reports/strategy`, `reports/strategies`, and `reports/backtests` | Inspiration Only | They document parity, expiry, calibration and scanner lessons, but V2 strategies must not copy scanner-specific or curve-fit behavior. |
| Current signal/scoring/arbitrator docs | Replace Completely for this layer | Candidate grading is now local to the strategy and winner selection remains outside this package. |
| Existing filters such as warmup, timeframe, market, spread/session and RR guards | Reuse & Improve | The guards became deterministic framework-level rejection reason codes. |
| Indicator calculations inside strategies | Replace Completely | Strategies consume `IndicatorSnapshot`, `ExtendedIndicatorSnapshot.marketFeatures`, and closed candles only. |

## Framework contract

Every strategy exposes identity, version, supported market/timeframes, warmup requirements, required indicators, required market features, entry evaluation, exit recommendation, expiry rules, confidence/score/grade, risk classification, reason codes, debug output, metrics, health and certification status.

Strategies produce deterministic candidates only. They do not execute trades, choose a winner, call exchanges, call Supabase, send Telegram messages, or mutate capital/risk state.

## Production strategies

Crypto:

1. MicroScalper — short-duration continuation with trend, momentum, liquidity, volume, volatility and compression-breakout readiness gates.
2. Compression Breakout — expansion after compression with closed-candle breakout and volume/Donchian/Bollinger confirmation.
3. Crypto Trend Pullback — continuation inside established crypto trends with pullback quality and structure gates.
4. Reversal Exhaustion — high-confirmation exhaustion reversal using reversal probability, RSI extremes, volatility and structure.

Forex:

5. London Breakout — London-session Asian-range break with expansion and liquidity filters.
6. Forex Trend Pullback — session-aware pullback model with lower volatility/RR assumptions than crypto.
7. New York Continuation — NY/open-overlap continuation after London direction with trend, momentum and volume gates.
8. Swing Continuation — longer-duration HTF-aligned continuation with structure, pullback and stronger RR requirements.

## Metrics

Each strategy tracks generated/accepted/rejected counts, average confidence, average RR, expected hold time, regime/session distribution, per-symbol stats, per-timeframe stats and health.
