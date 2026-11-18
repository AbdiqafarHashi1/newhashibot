# Integrated Gold trailing — 14 November 2026

The optional fourteenth reviewed configuration is `gold.rsi-trailing-15-48-1.5-5-h96`. It joins the shared scanner, conditional lifecycle, account ledger, account preset and native MT5 management path. Defaults retain the original twelve reviewed selections; Gold compression and RSI trailing remain optional.

| Exact shared-scanner period | Closed trades | Net account return | Maximum OHLC equity drawdown | Profit factor |
|---|---:|---:|---:|---:|
| 5 May–30 June 2026 | 35 | +2.41% | 2.69% | 1.33 |
| 5 July–31 October 2026 | 99 | +5.90% | 4.33% | 1.25 |

Both account runs start at USD25,000, risk 0.4% per trade, include modeled spread/fills, commission and financing, and use the personal account Brain. These are total period returns, not monthly returns. Historical selection reused these periods; neither is an untouched holdout. They do not establish a calibrated future probability, Prop pass probability, or native provider fill performance.

The earlier native study’s +21.50% result is a different replay and must not be attached to this integrated preset. The canonical OHLC ledger updates trailing stops after closed five-minute observations; the MT5 agent manages observed quotes and native closed M15 ATR. Connected demo comparison must resolve differences in timing and fills.

Policy: fixed original R, 1.5 ATR/structure initial protection, full 5R target, activate trailing at 2R using one closed M15 ATR with at least 0.5R lock, maximum 24-hour holding. Protection cannot loosen or rebase original R. Missing/stale data retains protection. Existing four-hour admission cooldown stays: removing it in the early control increased trades from 35 to 45 but reduced return to +1.12% and increased drawdown to 3.39%.

The complete later ledger was rebuilt from all 99 preserved scanner entry events after detecting a fractional-risk CLI resume identity defect. The corrected runner normalizes numeric account IDs and refuses missing/ambiguous account checkpoints. No candidates or timestamps changed, and there are no cash resets. The invalid partial outputs and immutable-state diagnostics are explicitly retained under `invalid-*` filenames; they are not evidence for activation.

`review.json` contains exact metrics and source/report hashes. Gzip reports contain scanner decisions and account results. `canonical-source.tar.gz` pins the scanner implementation; `account-source.tar.gz` pins the complete account rebuild implementation. `SHA256SUMS.json` verifies the deliverables. Raw native datasets are not duplicated; their manifests and row hashes are retained in the reports.

A go for forward demo is justified by positive costed account expectancy and exercised execution wiring. A go for paid live execution additionally needs observed provider placement/protection/exit/retry and entitlement behavior, acceptable real costs and drawdown, and results customers can inspect. A win-rate or scanner score alone is insufficient. Fast Prop passing remains unestablished at the production 0.5% cap; no acceleration cap was increased.
