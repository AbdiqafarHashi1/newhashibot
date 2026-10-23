# Strategy certification — NOT CERTIFIED

23 October continuation: [new specialist rebuild, additional exchange history and final rejection results](regime/README.md). The earlier288-cell report below is retained as historical evidence.

Generated 2026-10-22T02:28:02.561Z. None promoted. Credentials and infrastructure cannot resolve this blocker.

288 independent historical scenario cells cover nine strategy families, two frozen profiles, markets and chronological periods. The full cell and regime metrics, source hashes, configuration hashes and rejection counts are in [strategy-evidence.json](strategy-evidence.json) and [strategy-results.csv](strategy-results.csv). These are research results, not certified customer returns.

## Protocol and limits

Fixed cost-aware stop/target safeguards, strict geometry, worst-zone-entry RR, closed-only higher timeframe context for 5m crypto. No tuning after validation/test.

Screening threshold: at least 30 resolved trades per split, profit factor ≥1.2, positive expectancy, nonzero declared costs and an untouched holdout. No existing archive period is untouched. Development/validation/historical-test labels do not turn previously examined data into new out-of-sample evidence. No strategy is eligible for promotion.

Chronology: Binance March development, June validation, September historical test; FX chronological 60/20/20 segments. Only closed candles enter the decision; fills begin at the next open; same-bar stop/target ambiguity resolves conservatively. One active trade per independent strategy/symbol scenario; partial targets and stop changes follow the replay engine. Profiles are fixed before validation/test, with no search over test outcomes.

Costs include crypto spread, fees, slippage and a funding reserve; Forex estimated spread/slippage. Exact per-market assumptions are in `scripts/release1/certify-signals.ts`. Candle data cannot establish depth, actual historical spreads or market impact. R/R and entry feasibility guards do not guarantee a fill.

| Strategy | Profile | Historical-test resolved trades (sum of independent cells) | Cell PF range | Cell expectancy R range |
|---|---|---:|---|---|
| crypto.compression-breakout | BASELINE | 34 | 0.341–0.561 | -0.413–-0.200 |
| crypto.compression-breakout | COST_AWARE_STRICT | 32 | 0.287–0.574 | -0.485–-0.194 |
| crypto.micro-scalper | BASELINE | 0 | undefined / no trades | undefined / no trades |
| crypto.micro-scalper | COST_AWARE_STRICT | 0 | undefined / no trades | undefined / no trades |
| crypto.quick-scalp | BASELINE | 0 | undefined / no trades | undefined / no trades |
| crypto.quick-scalp | COST_AWARE_STRICT | 0 | undefined / no trades | undefined / no trades |
| crypto.swing-continuation | BASELINE | 24 | 0.292–0.349 | -0.570–-0.521 |
| crypto.swing-continuation | COST_AWARE_STRICT | 21 | 0.284–0.390 | -0.564–-0.458 |
| forex.london-breakout | BASELINE | 1 | undefined / no trades | 1.426–1.426 |
| forex.london-breakout | COST_AWARE_STRICT | 1 | undefined / no trades | 1.426–1.426 |
| forex.micro-scalper | BASELINE | 179 | 0.538–1.039 | -0.250–0.015 |
| forex.micro-scalper | COST_AWARE_STRICT | 183 | 0.246–0.915 | -0.530–-0.042 |
| forex.new-york-continuation | BASELINE | 400 | 0.130–1.225 | -0.918–0.081 |
| forex.new-york-continuation | COST_AWARE_STRICT | 0 | undefined / no trades | undefined / no trades |
| forex.swing-continuation | BASELINE | 181 | 0.560–0.881 | -0.281–-0.065 |
| forex.swing-continuation | COST_AWARE_STRICT | 150 | 0.534–0.780 | -0.288–-0.107 |
| forex.trend-pullback | BASELINE | 247 | 0.120–1.377 | -0.798–0.165 |
| forex.trend-pullback | COST_AWARE_STRICT | 247 | 0.120–1.377 | -0.798–0.165 |

Counts above pool independent cells only to describe coverage; they are not portfolio results. Do not average profit factors or compound these cell returns together. Full rows include sample bars, win count/rate, trade counts, net R, modeled net return and realized maximum drawdown, plus regime-specific measurements. Undefined PF is retained rather than converted into infinity or zero.

## Rejections and required evidence

Some small cells exceed PF 1.2; sample, regime consistency and holdout requirements still fail. Zero qualified signals is an honest outcome, especially MicroScalper/QuickScalp; lowering gates to manufacture signals would invalidate the product.

- Bybit: no independent Bybit history or cost evidence. Binance results cannot certify Bybit.
- XAUUSD: no reliable Gold history in the supplied archive.
- Forex indicative OHLC does not establish executable broker results.
- New independent chronological holdout and forward observations are required after parameters freeze. Record source, market, session, regime, spread, latency and executable cost evidence.
- All existing historical dates were previously examined; none may be represented as untouched out-of-sample certification.

- All archived periods were previously examined. Historical test is not new out-of-sample certification.
- Forex uses indicative OHLC and estimated costs, not broker spreads/fills.
- Funding is a reserve; no historical funding/mark-price book.
- Each strategy/provider/symbol/timeframe evaluated independently with one active signal; not a combined portfolio-return claim.
- Next-open market entry assumption; not a limit-fill guarantee.
- Return/drawdown are realized-close simulations at 0.5% risk; no intrabar equity certification.

Reproduce: `npm run research:release1 -- /path/to/extracted/Hashibot-Research-Data-2026-10-18 /tmp/hashibot-strategy-results.json`. Original archive required; source SHA256s and engine hashes accompany the report. It is intentionally not a production promotion command.
