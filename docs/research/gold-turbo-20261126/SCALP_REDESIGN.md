# Scalp-structure redesign: measured comparison

Implemented and functionally tested; mixed historical results. Gold Turbo remains personal-demo-only, inactive, not profitability validated or commercially qualified. No paid/live activation. No return guarantee.

## What changed

- Micro persistent bursts place their initial stop beyond the observed five-second bid extreme rather than an arbitrary offset inside that path. Minimum/maximum stop distances and original risk allowance still apply; sizing can decrease or reject the trade. No existing stop is widened.
- Momentum strong-candle continuation now requires an ordered completed impulse breakout, a completed retest of the prior boundary, and live reclaim. Compression breakout stays separate. This replaces first-extension candle chasing; it does not extend holding time.
- Flagship adds M5 support/resistance rejection with observed developing-M1 wick and tick confirmation. Its target is capped at the observed range midpoint. No future pivot or invented tick path.
- Flagship admission now records the selected underlying engine admission. Range/Trend structural anchors and the selected engine cooldown therefore persist through the existing recursive runtime checkpoint. Previously only the wrapper recorded admission.
- Trend now rejects an opposing M15 swing at entry because its existing exit manager already invalidates that same condition. The regression reproduces this entry/exit contradiction; historical immediate exits prompted inspection, but not every such exit is attributed to this cause.
- Range entry rules and every risk limit, account cap, cost scenario, basket target and holding-time maximum are unchanged. All five strategy IDs remain selectable; the original 16 configurations and 1,159-trade ledger are unchanged.

## Fixed comparison

Reference: bd7a937b595601cedbd09cc11b13b01001fb15f1. One frozen candidate was compared on development October 6/14/22 and additional October 29/30, 08:00–16:00 UTC. Additional dates were specified before running the candidate on them. October was already used in prior research; this is not pristine external validation. Candidate module hashes match between both runs. No return-driven parameter sweep or second candidate was selected from these results.

Four account sizes ($100/$500/$1,000/$25,000), eight independent/custom/adaptive lineups, real retained Exness bid/ask quotes. USD hedging-account scenario: 100 oz/lot, .01 minimum/step, 1:100 leverage, $3.50/lot/side commission, adverse $0.02/oz slippage each side, .10 minimum stop distance. Five-second decision/management cadence; native stop/target crossings inspect every original quote. No interpolation, tick fabrication or future completed bars. Forced flat at selected-session end. Zero latency, no partial-fill simulation, no historical news calendar: explicit clear-news scenario only. These remain important qualification gaps.

Risk remains .25/.20/.15% by account equity, 1.5% daily loss lock, 8% peak loss lock, 1% aggregate open risk and 20% margin. No martingale, increased leverage, wider permitted risk or extended holding periods.

## $25,000 measured results

Returns below include scenario costs and are cumulative within each separate selected-session period, not daily or monthly returns. Both periods start from the same specified capital independently; do not add percentages and call that a continuous monthly backtest.

| Lineup | Reference development | Redesign development | Reference Oct 29–30 | Redesign Oct 29–30 | New additional baskets / orders |
| --- | ---: | ---: | ---: | ---: | ---: |
| micro-scalper | -0.08% | -0.08% | -0.26% | -0.26% | 7 / 7 |
| momentum-scalper | -0.65% | +0.00% | -0.20% | -0.05% | 1 / 1 |
| range-scalper | +0.79% | +0.79% | -0.44% | -0.44% | 9 / 9 |
| trend-scalper | -0.03% | -0.03% | +0.84% | +0.84% | 8 / 8 |
| price-action-basket | -0.39% | -0.10% | -0.49% | -0.25% | 29 / 32 |
| momentum-trend | -0.67% | -0.03% | +0.64% | +0.79% | 9 / 9 |
| micro-range-basket | -0.01% | +0.28% | -0.75% | -0.57% | 33 / 35 |
| adaptive-all-five | -0.30% | +0.43% | -0.75% | -0.20% | 38 / 40 |

Adaptive development: 56 baskets, 60 orders, +0.4341% net return, 1.4862% drawdown, 1.10-minute volume-weighted exit holding time. Additional days: 38 baskets, 40 orders, -0.2028% return, 1.0134% drawdown and 1.34-minute holding time. Reference additional participation was 33 baskets/43 orders. This improvement did not come from turning the adaptive engine into swing trading.

Trend was +0.8413% on the additional days, exactly the same as the reference; this is not a newly created performance gain. Momentum+Trend improved from +0.6391% to +0.7890%, mainly because losing Momentum exposure decreased. Trend average hold on those days was 28.41 minutes, within its unchanged 45-minute maximum. Its development return was -0.0270%. These limited positive observations are not proof of stable monthly profits.

## Evidence that remains weak

- Micro standalone returns were unchanged in both periods and remain negative. Its structural-stop change did not demonstrate a financial improvement on these executed entries.
- Momentum produced no executable retest-model candidate in these sessions; its one additional-day filled entry was Compression Breakout and lost money. The new retest model has functional fixture coverage, not evidence of historical profitability. Participation is inadequate and this remains unresolved.
- The added M5 rejection model filled once in the additional Flagship run. That is far too little to validate its edge.
- Range was positive on development, negative on additional days. Flagship standalone still lost on both periods. Adaptive became positive on development but stayed negative on the additional dates.
- Multiple changes were tested as one fixed bundle. Individual profit effects were not isolated by ablation and must not be attributed solely to one fix.
- $100 remained inactive under the standard-lot scenario. At $500/$1,000, additional-day candidate returns were negative for Micro/Range/Flagship/adaptive; Momentum/Trend had no fills. There is no small-account profitability validation, and compatible cent contracts still require broker evidence.
- No complete-month performance, median month, profitable-month percentage, survival probability, robust execution-latency estimate, or 20% monthly expectation is established. Full PF/expectancy/win-rate/margin/fee/holding metrics are retained for every case. Subscription subtraction remains a scenario, not a customer monthly-profit estimate.

## Verification and delivery

182 targeted Python checks plus five replay accounting/causality checks pass, including seven new redesign regressions: long/short tick-extreme stops, ordered completed breakout/retest, missing interval rejection, entry/exit context consistency, selected-source admission/checkpointing, M5 rejection target geometry and unchanged holding caps. Changed Python files compile and whitespace checks pass. No full-repository test suite was run.

128 account/basket/flat-volume audits passed across reference/candidate and both periods (32 cases each). Equal dates, quotes, cadence, costs and risk assumptions are checked. comparison.json retains every result, source hashes and entry/exit reason counts. receipts.json.gz preserves full fills, entry plans, basket IDs and source data/assumption metadata. Prior period-8 and period-9 evidence is unchanged. Raw October data remains preserved for reuse; no new download.

## Remaining acceptance requirements

This is a working, tested scalp redesign with measurable improvement in combined execution, not completion of the positive-edge goal. Do not activate paid/live Turbo or claim all five profitable. Momentum opportunity formation and Micro/Flagship expectancy still need defensible design work; any further variant must treat these now-observed dates as development evidence. Broader chronological data, cost/latency stress, actual broker specifications, historical news and sustained native demo fills are still needed before qualification. Keep profitable observations as candidates to investigate rather than claiming a validated commercial portfolio.

Reproduce the new candidate with replay.py --output .tmp/gold-turbo-redesign-development.json and --days 29,30 --output .tmp/gold-turbo-redesign-candidate-additional.json. Set GOLD_TURBO_AGENT_PATH to a bd7a937b source checkout for the reference additional run. redesign_report.py creates the audited comparison using the preserved period-9 candidate development receipts.
