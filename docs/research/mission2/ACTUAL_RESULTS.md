# Mission 2 actual research results

Research remains in progress. No candidate is production-qualified or approved for demo automation by these screens. Passing engineering tests does not establish profitability.

## Comparable account results

$1,000 initial capital, 0.5% gross stop-distance risk, Binance hypothetical contract/cost profile. Costs are included in P&L but are not included in the initial stop-risk sizing budget. Each row is its own portfolio; overlapping rows must not be pooled as independent evidence.

| Experiment | Venue | Period | Signals | Entries | Closed | PF | Equity return % | Conservative DD % |
|---|---|---|---:|---:|---:|---:|---:|---:|
| ten-asset-week-baseline | SPOT | 2025-01-20–2025-01-27 | 90 | 29 | 28 | 0.412 | -5.937 | 6.791 |
| ten-asset-week-candidate | SPOT | 2025-01-20–2025-01-27 | 100 | 29 | 27 | 0.427 | -5.331 | 6.713 |
| immediate-only-week | SPOT | 2025-01-20–2025-01-27 | 97 | 26 | 26 | 0.497 | -3.786 | 5.584 |
| conditional-only-week | SPOT | 2025-01-20–2025-01-27 | 5 | 4 | 4 | undefined (no losses) | 0.833 | 0.630 |
| ten-asset-week-admission-control | SPOT | 2025-01-20–2025-01-27 | 150 | 35 | 35 | 0.587 | -4.002 | 5.708 |
| futures-week-baseline | USDT_PERPETUAL | 2025-01-20–2025-01-27 | 91 | 39 | 36 | 0.241 | -8.538 | 9.349 |
| confirmation-baseline | SPOT | 2025-03-17–2025-03-24 | 85 | 29 | 27 | 0.734 | -1.768 | 4.686 |
| reserved-holdout-baseline | SPOT | 2026-10-20–2026-10-27 | 77 | 12 | 9 | 0.817 | -0.686 | 4.281 |
| validation-baseline | SPOT | 2025-02-17–2025-02-24 | 78 | 29 | 26 | 0.549 | -2.477 | 4.976 |
| confirmation-net-rr-candidate | SPOT | 2025-03-17–2025-03-24 | 85 | 29 | 27 | 0.734 | -1.768 | 4.686 |
| reserved-holdout-net-rr-candidate | SPOT | 2026-10-20–2026-10-27 | 77 | 12 | 9 | 0.817 | -0.686 | 4.281 |
| validation-net-rr-candidate | SPOT | 2025-02-17–2025-02-24 | 79 | 30 | 27 | 0.710 | -1.355 | 4.324 |

## January scanner funnel

Counts are unique strategy/symbol/timeframe/closed-candle evaluations, not minute polling. Filter reasons may overlap.

| Raw candidates | Immediate | Conditional | Admitted | Confirmed | Watches triggered | Expired | Invalidated |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10592 | 1204 | 370 | 113 | 90 | 1 | 17 | 6 |

Largest diagnostic counts (overlapping; include no-opportunity observations):

- SYMBOL_OR_TIMEFRAME_NOT_ELIGIBLE: 523320
- EVALUATOR_OR_PLAN_NOT_ELIGIBLE: 132305
- WAIT_FOR_CLOSED_HOUR: 23184
- volume_expansion_failed: 19532
- SLEEVE_NATIVE_HISTORY_IDENTITY: 12768
- candle_body_too_small: 8321
- exhaustion_unconfirmed: 7761
- CONTEXT_COST_OR_GEOMETRY_REJECTED: 6609
- pullback_invalid: 6532
- TEAM_NATIVE_HISTORY_REQUIRED: 6384
- breakout_not_confirmed: 6136
- htf_trend_not_confirmed: 5699
- ALIGNED_NATIVE_WEAKNESS_BTC_HISTORY_REQUIRED: 5376
- SETUP_GEOMETRY_COST_SCORE_OR_RR: 4727
- rsi_not_confirmed: 4198

## Personal capital/risk matrix

Same January signals, real account Brain and separate equity/margin paths. These scenarios are not independent market samples.

| Capital $ | Risk % | Entries | PF | Return % | DD % |
|---:|---:|---:|---:|---:|---:|
| 500 | 0.25 | 31 | 0.353 | -3.599 | 4.035 |
| 500 | 0.5 | 29 | 0.413 | -5.931 | 6.782 |
| 500 | 0.75 | 23 | 0.577 | -4.905 | 6.215 |
| 500 | 1 | 19 | 0.490 | -6.252 | 9.684 |
| 1000 | 0.25 | 31 | 0.353 | -3.601 | 4.039 |
| 1000 | 0.5 | 29 | 0.412 | -5.937 | 6.791 |
| 1000 | 0.75 | 24 | 0.545 | -5.456 | 6.760 |
| 1000 | 1 | 17 | 0.555 | -5.045 | 9.268 |
| 2500 | 0.25 | 31 | 0.352 | -3.613 | 4.052 |
| 2500 | 0.5 | 29 | 0.412 | -5.949 | 6.803 |
| 2500 | 0.75 | 24 | 0.545 | -5.456 | 6.761 |
| 2500 | 1 | 18 | 0.545 | -5.227 | 8.655 |
| 5000 | 0.25 | 31 | 0.352 | -3.612 | 4.052 |
| 5000 | 0.5 | 29 | 0.412 | -5.950 | 6.805 |
| 5000 | 0.75 | 24 | 0.488 | -6.346 | 7.608 |
| 5000 | 1 | 19 | 0.541 | -5.284 | 8.748 |
| 10000 | 0.25 | 31 | 0.352 | -3.614 | 4.053 |
| 10000 | 0.5 | 29 | 0.412 | -5.952 | 6.807 |
| 10000 | 0.75 | 24 | 0.488 | -6.348 | 7.610 |
| 10000 | 1 | 19 | 0.541 | -5.285 | 8.749 |

## Interpretation and limits

- The research-only removal of signal admission budgets increases confirmations, while the January portfolio remains negative after account risk checks. This does not justify removing production risk controls.
- Immediate-only avoids watches consuming signal budgets. Conditional-only has very few executed trades; an undefined PF when no loss was observed is not proof of a robust edge.
- The MicroScalper TP2 experiment improves the January/February screen slightly but does not establish a robust positive portfolio in March or the reserved October window. See the frozen experiment and its metadata correction.
- Spot is long-only. USD-M uses its own native derivatives archives; it is not a renamed spot replay. Funding is a documented conservative reserve, not genuine historical funding.
- Actual inventory is 30 definitions (10 primary, 20 specialist/support), correcting the earlier 29-definition inventory description. Forex/Gold definitions are visible but have no genuine broker-grade campaign results here.
- Seventy native monthly archives were checked byte-for-byte against acquisition checksums, and decoded rows were checked against their ZIP contents. The selected ten-symbol universe is not survivorship-neutral.
- Contract/fee/spread/slippage assumptions need historical venue verification. Bybit account/provider parity is engineering-tested, but these Binance venue results do not certify historical Bybit fills.
- Public broker archive requests returned HTTP 429. MT5 broker historical bid/ask, instrument specifications and rapid Gold tick data are unavailable. No Forex/Gold profitability, empirical prop pass/payout rate, or funded survival probability is claimed.
- The prop observer implements floating-equity rules, real trading days, phase resets and censored survival with controlled tests. Named firm rules and fees are not verified; hypothetical rules must not be labeled firm qualification.
- Current source-hashed local research jobs persist canonical state, funnel identity sets, full account ledgers and emitted-signal identities atomically. Earlier screens lack that full source pin and remain provisional.
- Long-term independent periods, full walk-forward qualification and sufficiently granular execution evidence remain necessary before a demo shortlist can be approved. The 2026 October window has now been observed and cannot become an untouched holdout for subsequent tuning.

## Strategy classifications

| Strategy | Classification | Largest single-study closed sample |
|---|---|---:|
| crypto.alt-relative-strength-v1 | INSUFFICIENT DATA | 0 |
| crypto.alt-relative-weakness-v1 | INSUFFICIENT DATA | 0 |
| crypto.compression-breakout | INSUFFICIENT DATA | 26 |
| crypto.cost-aware-15m | INSUFFICIENT DATA | 0 |
| crypto.daily-ema-trend | INSUFFICIENT DATA | 0 |
| crypto.failed-auction-15m | INSUFFICIENT DATA | 0 |
| crypto.micro-scalper | INSUFFICIENT DATA | 5 |
| crypto.quick-scalp | INSUFFICIENT DATA | 0 |
| crypto.regime-channel-breakout | INSUFFICIENT DATA | 0 |
| crypto.regime-continuation | INSUFFICIENT DATA | 1 |
| crypto.regime-range-rejection | INSUFFICIENT DATA | 1 |
| crypto.reversal-exhaustion | INSUFFICIENT DATA | 4 |
| crypto.sleeve-breakout | INSUFFICIENT DATA | 0 |
| crypto.sleeve-relative | INSUFFICIENT DATA | 0 |
| crypto.sleeve-reversal | INSUFFICIENT DATA | 0 |
| crypto.sleeve-trend | INSUFFICIENT DATA | 0 |
| crypto.swing-continuation | INSUFFICIENT DATA | 18 |
| crypto.team-alt | INSUFFICIENT DATA | 0 |
| crypto.team-breakout | INSUFFICIENT DATA | 0 |
| crypto.team-range | INSUFFICIENT DATA | 0 |
| crypto.team-trend | INSUFFICIENT DATA | 0 |
| crypto.trend-pullback | INSUFFICIENT DATA | 0 |
| crypto.vwap-reclaim-15m | INSUFFICIENT DATA | 0 |
| forex.cost-aware-hourly | INSUFFICIENT DATA | 0 |
| forex.london-breakout | INSUFFICIENT DATA | 0 |
| forex.micro-scalper | INSUFFICIENT DATA | 0 |
| forex.new-york-continuation | INSUFFICIENT DATA | 0 |
| forex.swing-continuation | INSUFFICIENT DATA | 0 |
| forex.trend-pullback | INSUFFICIENT DATA | 0 |
| gold.volatility-breakout | INSUFFICIENT DATA | 0 |
