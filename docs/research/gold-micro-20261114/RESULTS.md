# Native Gold micro execution study — 14 November 2026

The previous 5m screen had a minimum 15-minute holding period. It did not directly test the requested 1–15 minute Gold trading style. This study adds native M1 decision context, ordered broker bid/ask ticks, intrabar entry confirmation, delayed execution and delayed profit management. It finds a promising development candidate, but that candidate loses on untouched October. It is not promoted to a customer strategy or connected to automated execution.

## Data and selection

First-party Exness XAUUSD Raw Spread archives: August 2026 (6,485,982 quotes, 29,049 native M1 bars), September (6,591,051 / 30,157) and October (5,910,062 / 30,174). Total 18,987,095 ordered bid/ask observations. M1 candles are aggregated from actual quotes, without invented weekend/missing bars. Quote counts are not traded volume. Source URLs, exact timestamps and SHA256 digests are in `data-manifests.json`. These are Exness reference quotes, not JustMarkets or prop firm fills.

Completed exploratory searches contain 16,200 approximate M1 OHLC month/account cases across two successive grids, plus 467 ordered-tick month/account cases across six successive stages. These overlap and share development data; they are not independent tests or probabilities. Incomplete WATCH research is excluded. Families include sweep/reclaim, trend pullback, impulse retest, stretch reversal, level reclaim, momentum burst, intrabar sweep reversal, breakout and two-bar trend resumption. Entry/exit/session variants were selected using August and September. Original source snapshots and all completed outputs are retained.

The selected M1 two-bar continuation requires closed M5 and M15 trend alignment, then an observed intrabar break of the pullback extreme. Parameters were frozen before inspecting October performance: 1.5 ATR minimum stop, 2R target, nominal 10-minute timeout, New York 12:30–16:30 UTC research session. Profit protection starts after 1.25R favorable movement, locks at least 0.5R, and trails by 1.25 ATR after management delay. UTC session hours are fixed, not DST-aware.

## Frozen candidate results

Each month starts with fresh capital and prior available indicator history. Returns include spread, modeled commission and adverse fill reserve. No pass/funded-cycle/withdrawal claim is derived from this single-strategy study.

| $25,000 account scenario | Aug return | Sep return | October holdout | October trades | October peak-equity DD |
|---|---:|---:|---:|---:|---:|
| Personal 0.5% risk, one-second decisions, lower costs | +3.10% | +3.56% | **−3.53%** | 23 | 3.96% |
| Personal 0.5%, one-second decisions, higher costs + 3s submission delay | +1.71% | +4.66% | **−4.73%** | 23 | 5.08% |
| Prop 0.25%, one-second decisions, higher costs + 3s submission delay | +0.82% | +2.24% | **−2.38%** | 23 | 2.56% |

Personal effective leverage ceiling is ten; Prop ceiling five. Contract size 100 oz/lot, minimum lot/step 0.01, price tick $0.01 and physical margin leverage 100 are explicit hypothetical broker specifications. Lower cost is $3.50 commission/lot/side plus $0.02/oz/side adverse fill reserve; higher cost is $5.25 plus $0.05. Spread comes from actual quotes. Decision-to-submission quote delay and management delay are distinct; this is not a broker matching/fill model.

The higher-cost personal model won 60.0% and 66.7% in the two development months, then only 30.4% in October. Its profit factor changed from 1.44 / 2.64 to 0.33. The issue is not just a universally low win rate: the chosen entry/context rules do not retain their edge across the unseen month. Increasing risk scales this problem.

## Infrastructure and capital findings

A 30-second decision/feed scenario produced only one August trade and zero September/October trades. The existing shared watcher has 5m as its minimum timeframe, and the agent publishes scanner frames every 30 seconds. The tested M1 intrabar logic is therefore not equivalent to a deploy of the current cloud scanner. A future candidate needs an explicit faster path with shared account authorization, deduplication, native protection, and monitored exits. The current MT5 client can request M1 bars, but the watched catalog and production position manager do not yet implement this candidate.

Minimum-lot and notional ceilings also matter. With the higher-cost model and the same 0.5% risk / ten-leverage ceiling:

| Original personal capital | August | September | October | Closed trades Aug/Sep/Oct |
|---|---:|---:|---:|---:|
| $500 | −0.07% | 0.00% | −0.46% | 1 / 0 / 1 |
| $1,000 | −0.72% | +1.01% | −4.55% | 13 / 11 / 19 |
| $5,000 | +1.28% | +4.19% | −4.68% | 25 / 21 / 23 |

These are broker-specification scenarios, not a general minimum capital policy. No minimum-lot rounding up, risk override, martingale or forced frequency was used.

## Decision

Retain this as disabled research, preserve the failed holdout, and do not advertise it as a profitable fast-Gold execution mode. Right timeframe and faster management correct an engineering mismatch; they do not alone establish trading expectancy. The next useful research step is to compare observable discretionary Gold decisions with the mechanical triggers, distinguish continuation versus failed-break reversal, and reserve fresh later data before changing filters. October is now development information and cannot be reused as an untouched validation period. Do not add a loss-response filter after seeing October and describe that as independent proof.

No existing qualified bundle, customer risk authorization, subscription, payment, Telegram routing, deployment or provider order was changed. This study does not negate the earlier bundle's separate historical results and does not establish general paid live execution readiness.
