# Work period 9: one focused change set and additional-day comparison

**Implemented, functionally tested and historically compared. The profitability objective is not met. Gold Turbo remains personal-demo-only and is not activated.**

## What can and cannot be established

20% monthly is an aspirational aggressive objective, not a supported expectation for these engines. No monthly result or probability is established by these selected sessions. Tests establish deterministic behavior and receipt conservation; the replay establishes results only under its stated data, period, capital and cost scenario. Neither proves sustainable future profitability.

## Diagnosis and changes

The original $25k Micro sample had 20 stop exits out of 30 exit receipts and a median holding time of about six seconds. Its persistent-burst baskets lost $483.18. Momentum strong-candle continuation baskets lost $691.48; 22 losing exit receipts had previously observed favorable movement over $0.20/oz. Positive MFE alone does not prove a different exit would be profitable. No clear accounting/causality defect was found by the targeted checks; this does not certify the entire simulator as a broker replica.

One change set was fixed before evaluating October 26–28:

- Micro burst continuation requires signed 15-second path persistence at its existing .55 confidence threshold. Pullback and rejection entry hypotheses remain distinct.
- Momentum strong-candle continuation requires directional M15 context and observed five-second persistence of at least .55. Compression breakout remains a separate hypothesis.
- Adaptive account selection and competing Flagship models prioritize ordinal regime suitability before hypothetical reward geometry. Planned RR is not treated as a learned probability. Same-suitability opposing ambiguity, cost checks and account risk gates remain.
- Range and Trend entry rules, all risk limits, sizing, stops/targets, trailing and early exits are unchanged. No higher-risk compensation and no model deletion.

## Comparable evidence

Original baseline commit: 23a4e62310861c286ad712db37dcd7bd5d7a79f8. Development: October 6/14/22. Additional chronological comparison: October 26/27/28; each session 08:00–16:00 UTC. The additional dates were not used to select these changes. October appeared in earlier research and is not an untouched external validation month. Original engines were restored into an isolated temporary source tree for the additional-day comparison, with the same replay harness as the candidate. Candidate source hashes match across both periods.

Eight lineups at $100/$500/$1,000/$25,000, unchanged real spreads, $3.50/lot/side commission, $0.02/oz adverse slippage per side, 100 oz/lot, .01 minimum/step, 1:100 leverage. Risk caps remain .25/.20/.15% by capital, daily 1.5%, peak 8%, open risk 1%, margin 20%, basket target .2%. Five-second entries/management, every original quote checks broker stops/targets. No latency/partial-fill simulation or retained historical news calendar. Research clear-news scenario only; production news protection is unchanged. All positions reconcile flat at each selected session end.

All returns below are net, selected-session cumulative returns on $25,000—not daily averages or monthly returns.

| Lineup | Original development | Candidate development | Original additional days | Candidate additional days | Additional baskets: original → candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| micro-scalper | -1.86% | -0.08% | -2.82% | -0.27% | 26 → 6 |
| momentum-scalper | -2.77% | -0.65% | -1.82% | -0.30% | 58 → 2 |
| range-scalper | +0.79% | +0.79% | -0.34% | -0.34% | 5 → 5 |
| trend-scalper | -0.03% | -0.03% | -0.03% | -0.03% | 3 → 3 |
| price-action-basket | -1.96% | -0.39% | -2.49% | -0.56% | 87 → 26 |
| momentum-trend | -2.89% | -0.67% | -1.85% | -0.33% | 61 → 5 |
| micro-range-basket | -1.53% | -0.01% | -3.97% | -0.86% | 81 → 27 |
| adaptive-all-five | -3.18% | -0.30% | -4.48% | -0.76% | 64 → 26 |

**Interpretation:** all changed lineups lost less on both periods, but every candidate lineup lost money on the additional days. Lower total losses partly reflect fewer trades. This is not sufficient acceptance evidence. Momentum had zero profitable baskets among five development baskets and two additional-day baskets; its filter reduced exposure without establishing better per-trade expectancy. Range preserved its original positive development result but lost on the additional days. None can be called profitability validated.

At $100, all cases remained inactive under the standard-lot scenario. At $500/$1,000, all candidate additional-day lineups also had nonpositive returns; unchanged Trend had no fills. Cent contracts are still untested. No commercial portfolio or aggressive capital profile is recommended from these results. The existing 16 configurations are untouched; these five IDs remain separately selectable, demo-only additions.

Adaptive participation fell from 98 to 56 baskets on development and 64 to 26 on additional days (8.7 baskets per selected additional eight-hour session). Do not represent the loss reduction as maintaining the original frequency. Monthly median, profitable-month percentage, full-month worst return and survival probability are unavailable. PF, expectancy, win rate, holding time, orders, margin, fees, drawdown, session cash and the illustrative subscription subtraction are in comparison.json.

## Verification and preserved evidence

- 175 targeted Python checks, including six new behavioral regressions, plus five replay accounting/causality tests and 12 existing lease/admin JavaScript checks passed. Python compilation and whitespace checks passed. No full-repository suite.
- 128 account/basket/flat-volume audits passed across original/candidate and both periods (32 cases per run). Identical sessions, quote counts, risk/cost assumptions and cadence are enforced. Strategy source hashes prevent changing the candidate between periods.
- comparison.json includes every account/lineup result, period-specific changes and exit/model diagnostics. comparison-receipts.json.gz contains the three new complete replay outputs, including fills with entry plans and actual coordinator close reasons. Original baseline receipts remain unchanged. No optimization sweep or extra data download.

## Remaining work

This closes the agreed bounded number-9 implementation/comparison round, not the larger positive-edge acceptance requirement. Further Gold Turbo work needs a stronger entry/exit hypothesis supported by basket-level evidence and a more direct comparison with the manual decision sequence. Do not tune repeatedly on the additional dates now that their outcomes are known. Longer independent chronological coverage, realistic latency/partial-fill stress, historical news, actual broker contract checks and sustained demo execution are required before any commercial qualification. There is no evidence-based reason to claim 20% monthly or to activate paid/live Turbo.

After restoring the raw data, the candidate runs are reproducible with replay.py defaults and --days 26,27,28; use GOLD_TURBO_AGENT_PATH pointing to the preserved baseline checkout for the original-engine run. improvement_report.py regenerates the audited comparison from ignored .tmp outputs. The five-strategy scope and the original baseline remain preserved.
