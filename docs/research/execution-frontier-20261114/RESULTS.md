# Execution frontier — 14 November 2026

The broader search found meaningful simulated Gold returns, a weaker configuration that can use the current execution path, and concrete engineering gaps. It does not establish reliable paid live execution, fixed monthly income, one-month challenge completion or actual payouts.

## Stronger research candidate

Gold RSI pullback, M15, 1.5 ATR/structure stop, 5R target, trailing after 2R by two current closed-bar ATR, maximum holding 24 hours. One position, no martingale. Continuous $25,000 account from May through the November archive ending **12 November 23:59:56 UTC**, without resetting capital at month boundaries:

| Scenario | Net return | Maximum observed equity drawdown | Closed trades | Net PF |
|---|---:|---:|---:|---:|
| Personal, 0.5% risk, effective leverage ceiling 10 | 33.14% | 8.77% | 343 | 1.281 |
| Funded Prop numerical scenario, 0.25% risk, ceiling 5 | 14.63% | 4.29% | 343 | 1.289 |

Actual reference bid/ask quotes, $5.25/lot/side commission, $0.075/oz/side adverse fill reserve, three-second entry submission delay, one-second client management and adverse 1.5 basis points of notional per calendar day financing are included. Contract/margin/commission/financing rules are explicit scenarios, not actual customer broker specifications or fills. A final boundary exit is modeled explicitly.

| Closed trading net, as % of original capital | May | June | July | August | September | October | Nov 1–12 partial |
|---|---:|---:|---:|---:|---:|---:|---:|
| Personal 0.5% | 6.64 | 8.86 | 10.29 | -5.50 | 0.65 | 3.03 | 9.33 |
| Funded 0.25% | 3.39 | 3.54 | 4.74 | -2.05 | -0.04 | 1.68 | 3.42 |

These monthly marks precede the last boundary close. Full-month personal 5% goals were reached in 3/6 months. Funded 5% goals were reached in 0/6. Neither regular 2% fortnight cycles nor firm payout approval was verified. May–October was development; November parameters were fixed before its first examination, but the short sample cannot establish reliability. Parameter-neighborhood screens were positive for all twelve nearby RSI trailing variants; these correlated development checks are not independent validation.

**This RSI trailing method remains research.** The current MT5 agent does not implement that trailing policy; its attractive return must not be attributed to a customer execution preset. At 1% personal risk the continuous model hit its loss guard. Combining RSI and compression under one-position arbitration performed worse and hit/stalled guard scenarios. Neither is the default recommendation.

## Optional configuration prepared for the shared path

Gold compression M15: closed 24-bar channel break following three-bar compression, 1.5 ATR/structure stop, full-position 5R target, 24-hour maximum holding. It is implemented in the shared strategy catalog, entry confirmation and scanner path. The exact canonical account runs at $25,000 and 0.5% risk returned:

| Canonical interval | Net return | PF | Closed trades | Drawdown |
|---|---:|---:|---:|---:|
| May 5–June 30 | 1.06% | 1.137 | 24 | 4.86% |
| July 1–October 31 | 1.27% | 1.058 | 59 | 5.19% |
| November 1–12 partial | 7.37% | 5.268 | 6 | 1.11% |

These are separate fresh-account canonical OHLC scenarios, not the continuous native-quote model above. At 0.25% the first two intervals returned 0.73% and 0.93%. The intervals were reviewed retrospectively; their positive totals do not make every month profitable. A May–July canonical comparison lost **1.52%** and remains in the evidence. A research-only relaxed-admission comparison returned +1.22%; production admission was not relaxed. Do not hide these results or claim uniformly strong returns.

The optional add-on uses its own server-owned review; it does not change the original twelve configurations or the seven-strategy Prop default. It starts unchecked in activation and has a separate account selection preset. Release scope remains signals and forward demo. No live authorization or deployed activation is granted.

## What changed in execution and setup

- Reviewed DOGE and LTC were missing from the account chooser. They now appear for compatible crypto demo/testnet accounts.
- Readable presets and historical period/risk/net/drawdown cards make exact account selections visible; selection never raises account risk.
- The planner already allowed one protected minimum-lot order when both targets were equal, but the MT5 handoff/agent rejected it. The narrow fix accepts that exact allocation, preserves protection and quantity, handles restart idempotency, and confirms closure from scoped native deals.
- The certified holding instruction now reaches MT5. Agent 1.2.1 persists fill time, closes owned tickets after the deadline, backs off failed requests and waits for native exit evidence before reporting closure.
- Dedicated data-only admin feeds seed up to 1,000 bars per frame in bounded batches, then send 60 recent bars. This avoids relying on slowly accumulating 140-bar history. No candles are invented; server validation still drops mutable bars. Existing 45-day retention can shorten higher-frame history and is not silently changed.

## Research breadth and sources

47,808 base month/configuration screens, 630 ordered-quote month/account cases and twelve continuous accounts cover seven original entry families, higher targets, fixed/partial/breakeven/trailing exits, literature adaptations and longer holding. Counts share data and overlap; they are not independent success rates. Original eight-finalist July outcomes and failed literature versions are retained. Native archive manifests identify every dataset.

The literature review used author-published Concretum intraday momentum code, QuantConnect's opening-range implementation, Freqtrade correctness/protection documentation, AQR trend-following research and Hummingbot market-making documentation. Equity results were not represented as Forex results; without consolidated traded volume, the FX adaptation uses TWAP rather than calling quote counts VWAP. Most adaptations did not survive the tests. See SOURCES.md and compressed completed evidence.

The current conclusion supports further connected demo testing, not a paid-profit promise. The strongest trailing candidate still needs shared runtime/agent integration and matching end-to-end verification. No provider orders, deployment, Telegram messages, payments or Actions runs occurred.
