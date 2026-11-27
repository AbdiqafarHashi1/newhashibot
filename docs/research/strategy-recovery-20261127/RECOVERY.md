# HashiBot strategy recovery and wiring — 27 November 2026

## Exact customer placement

All 21 decisions are in `DECISIONS.md` and `placements.json`. No configuration was deleted. Updated defaults flow through existing account onboarding and Admin preset assignment, account selection shortcuts, VIP publication allowlist and Browser Backtest Lab. Existing saved customer choices are not silently migrated. No provider activation was performed.

| Customer mode | Exact default strategy IDs |
|---|---|
| CRYPTO_PERSONAL | crypto.launch-trend-pullback-48-1.5-5 |
| FOREX_GOLD_PERSONAL | gold.native-momentum-15-48-2-5, gold.native-band-reentry-15-48-3-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5 |
| PROP_CHALLENGE | forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5 |
| PROP_FUNDED | forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5 |
| VIP_SIGNALS | crypto.launch-trend-pullback-48-1.5-5, crypto.launch-trend-pullback-48-2-3-h72, crypto.complementary-ema-pullback, crypto.launch-rsi2-48-3-3-h72, gold.native-momentum-15-48-2-5, gold.native-band-reentry-15-48-3-5, forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008, forex.native-band-reentry-60-12-2-5 |

Paused/LTC and thin-edge compression/sweep setups remain in explicitly named Admin comparison presets. Prop shortcuts are restricted to the curated two-Forex roster; the all-retained comparison remains an explicit Admin override. No Personal growth risk profile, drawdown bound, news rule or entitlement gate was transferred to Prop.

## Engineering change

Added a validated profit-exit choice from Admin configuration through scoped demo lease to local basket construction. STRATEGY_EXITS removes the shared basket equity-profit target and basket soft profit trail for Micro/Momentum/Range/Trend; their own targets, partial exits and trailing remain active. Hard basket loss, account loss, original risk, broker stops, news, margin and maximum holding controls remain active. The flagship retains its coordinated basket profit management. Existing open baskets retain their original immutable configuration through restart. Baseline EQUITY_TARGET remains the default unless the operator explicitly chooses the alternative.

## Paired local-runtime development comparison

Same three known sessions (6, 14, 22 October), 08–16 UTC; $500/$25,000 reset accounts, fixed 1% research decision budget, 15% daily/60% peak/50% entry margin limits. Every original quote checks broker stops; local decisions use a 5-second replay cadence. Costs: observed spread, $3.50/lot/side, $0.02/side slippage. Zero order latency and clear-news scenarios are limitations. These are paired tests, not month-long returns or production-cadence qualification.

| Arm | Lineup | Capital | Return % | DD % | Baskets | Orders |
|---|---|---|---|---|---|---|
| baseline | micro-scalper | 500.0 | -1.36 | 2.37 | 8 | 8 |
| baseline | micro-scalper | 25000.0 | -1.38 | 2.49 | 8 | 8 |
| baseline | momentum-scalper | 500.0 | 0.00 | 0.00 | 0 | 0 |
| baseline | momentum-scalper | 25000.0 | 0.00 | 0.00 | 0 | 0 |
| baseline | range-scalper | 500.0 | 1.33 | 2.84 | 21 | 21 |
| baseline | range-scalper | 25000.0 | 0.85 | 3.11 | 21 | 21 |
| baseline | trend-scalper | 500.0 | -1.06 | 1.60 | 4 | 4 |
| baseline | trend-scalper | 25000.0 | -1.89 | 3.54 | 8 | 8 |
| baseline | price-action-basket | 500.0 | -0.81 | 4.22 | 36 | 39 |
| baseline | price-action-basket | 25000.0 | -4.05 | 5.54 | 43 | 50 |
| baseline | adaptive-all-five | 500.0 | -2.98 | 7.35 | 52 | 53 |
| baseline | adaptive-all-five | 25000.0 | -4.85 | 8.59 | 58 | 63 |
| strategy-exits | micro-scalper | 500.0 | -0.63 | 2.28 | 8 | 8 |
| strategy-exits | micro-scalper | 25000.0 | -0.53 | 2.47 | 8 | 8 |
| strategy-exits | momentum-scalper | 500.0 | 0.00 | 0.00 | 0 | 0 |
| strategy-exits | momentum-scalper | 25000.0 | 0.00 | 0.00 | 0 | 0 |
| strategy-exits | range-scalper | 500.0 | 3.79 | 2.73 | 21 | 21 |
| strategy-exits | range-scalper | 25000.0 | 4.30 | 3.11 | 21 | 21 |
| strategy-exits | trend-scalper | 500.0 | -1.05 | 2.78 | 4 | 4 |
| strategy-exits | trend-scalper | 25000.0 | -0.37 | 4.86 | 8 | 8 |
| strategy-exits | price-action-basket | 500.0 | -0.81 | 4.22 | 36 | 39 |
| strategy-exits | price-action-basket | 25000.0 | -4.05 | 5.54 | 43 | 50 |
| strategy-exits | adaptive-all-five | 500.0 | -0.14 | 7.06 | 51 | 52 |
| strategy-exits | adaptive-all-five | 25000.0 | -0.99 | 9.95 | 57 | 62 |
| opening | micro-scalper | 500.0 | -0.63 | 2.28 | 8 | 8 |
| opening | micro-scalper | 25000.0 | -0.53 | 2.47 | 8 | 8 |
| opening | momentum-scalper | 500.0 | -0.79 | 1.17 | 1 | 1 |
| opening | momentum-scalper | 25000.0 | -0.41 | 1.71 | 2 | 2 |
| opening | range-scalper | 500.0 | 3.79 | 2.73 | 21 | 21 |
| opening | range-scalper | 25000.0 | 4.30 | 3.11 | 21 | 21 |
| opening | trend-scalper | 500.0 | -1.05 | 2.78 | 4 | 4 |
| opening | trend-scalper | 25000.0 | -0.37 | 4.86 | 8 | 8 |
| opening | price-action-basket | 500.0 | -0.81 | 4.22 | 36 | 39 |
| opening | price-action-basket | 25000.0 | -4.05 | 5.54 | 43 | 50 |
| opening | adaptive-all-five | 500.0 | -1.51 | 8.43 | 51 | 52 |
| opening | adaptive-all-five | 25000.0 | -1.50 | 11.46 | 58 | 63 |

## Full October selected-session confirmation

All 22 weekdays, 08–16 UTC, same risk/capital/cost/cadence assumptions and retained quote archive as the prior full-month baseline. Compare native strategy profit handling with the preserved equity-target baseline. Entries remain unchanged; the optional simple Momentum models are disabled. These are selected sessions, not continuous 24-hour monthly accounts. Source versions differ by tested profit-exit support and safe pending-margin accounting; source hashes and receipts are retained.

| Lineup | Capital | Baseline return % | Strategy exits return % | Baseline DD % | Strategy exits DD % | Baskets |
|---|---|---|---|---|---|---|
| micro-scalper | 500.0 | -11.25 | -9.44 | 12.18 | 10.74 | 55 |
| micro-scalper | 25000.0 | -12.33 | -11.29 | 13.31 | 12.69 | 55 |
| range-scalper | 500.0 | -11.65 | -14.11 | 11.65 | 14.11 | 97 |
| range-scalper | 25000.0 | -14.56 | -15.47 | 14.56 | 15.47 | 98 |
| trend-scalper | 500.0 | -0.57 | -1.55 | 2.47 | 4.74 | 13 |
| trend-scalper | 25000.0 | -0.76 | 0.31 | 3.98 | 9.82 | 32 |
| adaptive-all-five | 500.0 | -23.94 | -25.02 | 25.05 | 26.33 | 280 |
| adaptive-all-five | 25000.0 | -32.74 | -31.74 | 34.10 | 35.62 | 327 |

Decision: reject strategy-specific profit handling as the new default. At $500, Range deteriorated from -11.65% to -14.11%, Trend from -0.57% to -1.55%, and adaptive from -23.94% to -25.02%. Micro improved to -9.44% but still lost. The $25,000 Trend arm earned only +0.31% with 9.82% drawdown, insufficient for promotion. The new mode remains an explicit demo comparison option, with baseline default and hard protections preserved.

## Opening range through the actual local manager at 200 ms

All 22 October weekdays, 13–15 UTC, covering every defined October New York opening-range entry and its 15-minute maximum holding time. $25,000, experimental fixed 1% decision risk, 15% daily / 60% peak / 50% entry-margin research allowance; costs as above, adverse slippage $0.02 base / $0.05 stress. One original quote stream per run, observed bid/ask stops, reconciled basket decisions, strategy partial exits/trailing and account controls. This is the real local decision/management code on a fake historical terminal: immediate order response, no native broker partial-fill or latency qualification.

| Case | Return % | DD % | Baskets | Orders | Win % | PF | Holding min | After $100 fee $ |
|---|---|---|---|---|---|---|---|---|
| orb-runtime | 2.29 | 7.90 | 45 | 45 | 62.22 | 1.14 | 3.20 | 471.79 |
| orb-stress | 1.37 | 8.93 | 45 | 45 | 60.00 | 1.08 | 3.50 | 242.09 |

Decision: expose SESSION_BREAKOUT as an explicit Admin demo comparison for standalone Momentum, with original baseline preserved. It increases participation to 45 baskets and remains a scalp. The stressed PF near 1.08 and 8.93% drawdown are too weak for promotion to a customer default or Prop roster. This does not meet the aggressive small-account Turbo growth objective.

The modeled 1% lease is isolated research authorization. Current production leases and capital-band caps remain conservative; selecting the model in Admin does not grant 1% risk on a $25,000 account. The new source-aware continuation arbitration mapping is functionally tested; no new adaptive profitability claim is made. The earlier paired opening arm used its archived source version.


## Two simpler, published-concept challengers

Frozen models share the actual local `simple_intraday.py` entry functions and are optional Momentum configuration variants, preserving the 21-ID catalogue and the original default. New York opening-range breakout uses an observed 15-minute box; the other model uses a simple impulse/pullback/reclaim. Both use ATR scaling, 1.5R gross targets and strict 10–15 minute holds. No indicator voting stack or optimization sweep. US equity publications are concept sources, not verification of these Gold adaptations. Definitions and source URLs are in `simple-protocol.json`.

Independent C++ execution screening used all 5,910,062 retained October bid/ask ticks, 200 ms base delay / 500 ms stress delay, observed spreads, commission, adverse slippage, volume floors and a 20% entry-margin budget. It is not the full Python/runtime execution manager. The original 96 accounts use qualification 1.5% daily / 8% peak limits. A separate 24-case opening-range comparison uses the existing Personal STANDARD 4% daily / 18% peak limits at unchanged 1% decision risk, explicitly fixed sizing rather than full dynamic House-Money. Both differ from the paired local experiment. Chronological halves are known development periods, not an untouched holdout.

| Model / period | Capital | Risk % | Stress | Return % | DD % | Decisions | PF |
|---|---|---|---|---|---|---|---|
| SESSION_BREAKOUT:whole | 500 | 0.25 | False | 0.00 | 0.00 | 0 | — |
| SESSION_BREAKOUT:whole | 500 | 0.25 | True | 0.00 | 0.00 | 0 | — |
| SESSION_BREAKOUT:whole | 25000 | 0.25 | False | 1.12 | 1.73 | 36 | 1.27 |
| SESSION_BREAKOUT:whole | 25000 | 0.25 | True | 1.11 | 1.64 | 37 | 1.26 |
| SESSION_BREAKOUT:whole | 500 | 1 | False | -0.32 | 5.60 | 20 | 0.96 |
| SESSION_BREAKOUT:whole | 500 | 1 | True | 0.41 | 5.67 | 23 | 1.04 |
| SESSION_BREAKOUT:whole | 25000 | 1 | False | -6.33 | 8.00 | 15 | 0.25 |
| SESSION_BREAKOUT:whole | 25000 | 1 | True | -6.39 | 8.01 | 14 | 0.28 |
| SESSION_BREAKOUT:earlier | 25000 | 0.25 | False | -0.62 | 1.73 | 20 | 0.79 |
| SESSION_BREAKOUT:earlier | 25000 | 1 | False | -6.32 | 7.99 | 13 | 0.25 |
| SESSION_BREAKOUT:later | 25000 | 0.25 | False | 1.75 | 0.62 | 16 | 2.40 |
| SESSION_BREAKOUT:later | 25000 | 1 | False | 5.48 | 1.93 | 16 | 2.19 |
| SIMPLE_PULLBACK:whole | 500 | 0.25 | False | -0.21 | 1.10 | 11 | 0.87 |
| SIMPLE_PULLBACK:whole | 500 | 0.25 | True | 0.75 | 0.38 | 4 | 4.24 |
| SIMPLE_PULLBACK:whole | 25000 | 0.25 | False | -7.53 | 8.00 | 198 | 0.72 |
| SIMPLE_PULLBACK:whole | 25000 | 0.25 | True | -7.58 | 8.01 | 175 | 0.68 |
| SIMPLE_PULLBACK:whole | 500 | 1 | False | -6.33 | 7.91 | 36 | 0.58 |
| SIMPLE_PULLBACK:whole | 500 | 1 | True | -6.37 | 7.87 | 79 | 0.78 |
| SIMPLE_PULLBACK:whole | 25000 | 1 | False | -6.04 | 8.00 | 31 | 0.60 |
| SIMPLE_PULLBACK:whole | 25000 | 1 | True | -6.30 | 8.01 | 30 | 0.56 |
| SIMPLE_PULLBACK:earlier | 25000 | 0.25 | False | -3.30 | 6.79 | 130 | 0.81 |
| SIMPLE_PULLBACK:earlier | 25000 | 1 | False | -6.04 | 8.00 | 31 | 0.60 |
| SIMPLE_PULLBACK:later | 25000 | 0.25 | False | -5.33 | 6.18 | 110 | 0.66 |
| SIMPLE_PULLBACK:later | 25000 | 1 | False | -6.05 | 8.02 | 31 | 0.57 |
| SESSION_BREAKOUT_PERSONAL_STANDARD:whole | 500 | 1 | False | 2.43 | 4.50 | 24 | 1.24 |
| SESSION_BREAKOUT_PERSONAL_STANDARD:whole | 500 | 1 | True | 0.38 | 4.85 | 25 | 1.04 |
| SESSION_BREAKOUT_PERSONAL_STANDARD:whole | 25000 | 1 | False | 4.32 | 6.99 | 36 | 1.25 |
| SESSION_BREAKOUT_PERSONAL_STANDARD:whole | 25000 | 1 | True | 3.92 | 5.78 | 35 | 1.24 |
| SESSION_BREAKOUT_PERSONAL_STANDARD:earlier | 25000 | 1 | False | -2.56 | 6.99 | 20 | 0.79 |
| SESSION_BREAKOUT_PERSONAL_STANDARD:later | 25000 | 1 | False | 6.95 | 2.52 | 16 | 2.30 |

Decision: reject SIMPLE_PULLBACK as a replacement; it lost in both chronological halves. Keep SESSION_BREAKOUT as a comparison candidate only: the $25,000 0.25% whole-period screen was +1.12% (+1.11% stress) but its earlier half lost, its 1% whole-period account lost, and its local-runtime opening arm did not beat the original combination. The additional fixed-1% Personal STANDARD-limit opening screen returned +4.32% (+3.92% stress) at $25,000, with 6.99% drawdown, 36 decisions and PF 1.25. Its earlier half lost -2.56% and later reset half gained +6.95%. At $500 it returned +2.43% (+0.38% stress). These results motivate the separate actual-runtime check; they do not override the local-runtime evidence or automatically promote a default. A small profitable model at $25,000 does not establish a viable $100/$500 offering; minimum volume blocked the 0.25% small-account cases.

## Verification and operating consequences

Targeted tests cover all 21 placements, default/alternative separation, current 1,159-trade retention, Prop and live isolation, source-bound lease controls, new exit-mode validation, original basket settings across restart, hard-loss enforcement, causal long/short model geometry, DST session handling and duplicate admission. Targeted TSX bundles compiled; no broad repository suite ran. Per-test counts and exact account cash checks are in `verification.json`.

Existing Crypto trend is the selected Personal core; optional alternatives and the updated eight-source VIP allowlist are wired through existing interfaces. These changes do not turn the earlier six-family research router into production Account Brain parity and do not promise its simulated return. Forex/Gold and Prop defaults are explicit curation from existing evidence; fresh FX entry validation and firm-specific outcome probabilities remain outstanding.

All five Turbo engines retain their original scalp role, IDs and comparison baselines. Failed replacements remain outside defaults. Further improvement must beat these receipts on subsequent chronological market periods and production cadence. The full customer profitability goal has not been established by a label or selection change.
