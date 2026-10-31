# BTC/ETH transfer test — 27 October 2026

**No major-asset strategy qualified.** The original BNB/SOL/XRP candidate and its frozen validation remain unchanged. Its positive results cannot be assigned to BTC or ETH.

The original rule uses BTC as a benchmark. BTC cannot outperform itself by2 percentage points, so blindly adding BTC to its universe would not work. Two fixed transfers were specified: use the other major as benchmark (BTC↔ETH), or use positive peer breadth without requiring relative outperformance. All other entry, management and25bps reserve assumptions were preserved.

After all four bullish transfers failed, a separate short-side hypothesis was specified: high-volume breakdown with negative peer breadth, negative7d return,24h decline of at least3%, optionally underperforming the peer by2 percentage points. This is a disclosed sequential development extension, not a prespecified untouched validation or hidden optimization. All eight cases are retained.

| Direction | Asset | Variant | Resolved | Net PF | Stressed PF |
|---|---|---|---:|---:|---:|
| Buy | BTC | Relative | 3 | 0.032 | 0.017 |
| Buy | BTC | Breadth | 45 | 0.436 | 0.374 |
| Buy | ETH | Relative | 51 | 0.821 | 0.748 |
| Buy | ETH | Breadth | 65 | 0.761 | 0.698 |
| Sell | BTC | Relative | 1 | Undefined | Undefined |
| Sell | BTC | Breadth | 57 | 0.902 | 0.796 |
| Sell | ETH | Relative | 55 | 1.065 | 0.994 |
| Sell | ETH | Breadth | 93 | 0.706 | 0.649 |

The single winning BTC-relative short has no losing denominator; undefined PF is not infinity or qualification. ETH-relative shorts had2025 PF0.937 and January–June2026 PF1.666. Selecting only the favorable year retrospectively would be misleading. Full-period mean net R0.0165 is below the frozen0.02 threshold; stress and calendar consistency fail. No thresholds were relaxed.

## Methods and limits

36 official Binance USD-M archive/checksum pairs,104,832 actual native15m candles, January2025–June2026. Normalized data and raw archive hashes, complete count/coverage, source identity and native quote volume are verified. Hourly decisions use only closed prefixes. Entry is next native15m open; prior20 true-range ATR and prior24h structure set the wider stop; full3R target,24h maximum, no breakeven. This deliberately preserves the earlier altcoin hypothesis, rather than silently mixing in the separate Python framework's ATR14 policy. Minimum1% stop and cost-room floor remain.

Declared round-trip costs:10bps fees +2bps spread +4bps slippage +9bps funding reserve. Stress scales all reserves1.5x, keeping entries/paths fixed. Funding is not measured historical payment; shorts are not presumed to receive it. These are independent signal outcomes, not account/portfolio returns or provider fills. One active position per asset/variant/direction; the separate cases are not claimed to be a combined bidirectional portfolio.

Existing canonical arbitrator and outcome engine are reused. No new scanner, live definition, account-risk authority, execution path or publication was introduced. This is entry-feasibility research, not full production-registry/selection-policy parity. All prices were previously examined DEVELOPMENT dates. Failed development blocks further validation for these candidates; July–September was not reused to rescue them and October was not acquired.

`evidence.json.gz` and `summary.json` retain bullish cases; `../major-bear-breakout/` retains every bearish case. Together they preserve candidates, arbitration identities, baseline/stress cash flows, source/engine hashes, rejection counts and calendar results.740 resolved baseline/stress scenario outcomes reconcile; they overlap and are not740 independent fills.

```bash
node --import tsx scripts/research/major-breakout-study.ts /path/verified-crypto-development
node --import tsx scripts/research/major-breakout-study.ts /path/verified-crypto-development BEAR
node --import tsx tests/phaseL/majorBreakout.test.ts
node --import tsx tests/phaseL/majorBreakoutEvidence.test.ts
```

Tests cover real peer identity rather than symbol renaming/self-reference, both fixed variants/directions, volume/warmup/closed-time/malformed-data rejection, archive integrity, one-active sequencing, canonical selection, paired costs and independently reconciled cash flows. Real provider forward performance, production integration and certification remain NOT_RUN. No remote SQL, deploy, orders, messages, payments or schedules.

Conclusion: the positive altcoin behavior is not portable by changing tickers. Main-asset edge remains unestablished. These results do not mark crypto research complete or approve a paid-signal launch.

Verification: new rule/evidence suites, PhaseL, application typecheck, focused research/test TypeScript and production build pass locally. Two new focused typing errors were corrected and reports regenerated from the final source before publication. Archive hashes and all740 resolved baseline/stress cash-flow outcomes reconcile. Changed/new-file whitespace passes. Visual review and new-head remote CI remain NOT_RUN/unverified. No service activation occurred.
