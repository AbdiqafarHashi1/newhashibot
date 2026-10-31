# Slower-entry feasibility study — 26 October 2026

Two fixed hypotheses were written before their results were computed. Both use the five existing checksum-verified Binance USD-M histories, January 2025–June 2026. These dates have already been examined: this is further DEVELOPMENT, never untouched validation.

| Hypothesis | Resolved outcomes | Net profit factor | Mean net R |
|---|---:|---:|---:|
| Four-hour 20-bar breakout | 716 | 0.863 | -0.08849 |
| Daily 20/60-day directional agreement | 638 | 1.014 | 0.00316 |

Daily momentum's pooled PF is 1.113 in 2025 and 0.863 in January–June 2026. ETH/BNB cells are positive, other assets negative. No asset was dropped and no best cell was selected for promotion. The tiny pooled result is not a durable demonstrated edge. Neither hypothesis qualifies for scanner admission or paid signals.

This is an entry feasibility screen, **not production-registry/scanner parity**. No evaluator has been registered, no live definition altered, no signal published. Decision bars are constructed from complete native 15m groups; decisions use only completed history, fills remain next 15m open, and the existing shared outcome engine handles stops, gaps, targets and holding limits. No separate live scanner is introduced.

Fixed two-ATR stops, full 3R target, no breakeven, maximum 72-hour holding, one position per symbol/hypothesis. Forty-three basis points round trip includes a deliberately declared 27bp funding reserve for three days; these are not observed historical funding or executable spread. Different costs could change the result; they have not been searched. Outcomes across assets/hypotheses may overlap and are not account or portfolio performance. OPEN/EXCLUDED rows are retained. End-of-history OPEN rows are not profitable exits.

`evidence.json.gz` retains every case/outcome/cash flow, all 90 input file hashes, protocol and source hashes. `summary.json` contains compressed/uncompressed SHA256 and all asset summaries. Inputs are the existing 262,080 actual 15m candles. Forex/Gold remain untested here; no missing history is fabricated.

Reproduce from repository root:

```bash
node --import tsx scripts/research/slower-entry.ts /tmp/hashibot-lab-crypto /tmp/slower-entry-results.json
node --import tsx tests/phaseL/slowerEntry.test.ts
node --import tsx tests/phaseL/independentPayoff.test.ts
```

Closed-bar direction/ATR/warmup, buy/sell symmetry and future-invariance tests pass. Existing independent 50-case payoff oracle passes. Focused TypeScript check passes. All stored resolved outcomes reconcile to cash flows. This pass changes research only; no application build or remote CI pass is claimed.

Research motivation: [Moskowitz, Ooi & Pedersen, Time Series Momentum (2012)](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum) studies much longer horizons in traditional futures. It motivates testing slower behavior; it does not establish an intraday cryptocurrency edge or validate these parameters.

Next evidence requirement: an economically distinct, frozen hypothesis and adequate independent validation. Do not repeatedly tune these same asset/date cells until a positive result appears. No promotion, release certification or production activation follows from this report.
