# Fifteen-minute strategy research — 23 October 2026

**Implemented and measured; NOT profitable or certified. Nothing enabled or deployed.**

This iteration responds to the request for stronger 15-minute strategies and a concrete review of Bucko.ai. It preserves the original scanner, shared qualification/arbitration, immutable production truth, Phase-D sizing authority and account-scoped execution. It does not rewrite the public site, prices, migration history, schedules or legacy strategy identities.

## What was actually learned from external sources

- Bucko's [stop-analysis article](https://www.bucko.ai/blog/why-youre-getting-stopped-out-more-than-you-profit) describes instrument-specific adverse/favorable excursion and bracket analysis. This motivated whole-sample MAE/MFE diagnostics and static-versus-breakeven comparisons, **not** a claim to reproduce proprietary formulas. Our excursions include the whole exit candle; its unobserved intrabar path cannot justify a live trailing rule. We do not calibrate stops on winners alone.
- Bucko's [Belugo page](https://www.bucko.ai/belugo) describes **15-minute Bitcoin prediction markets using 10-/15-second signals**, not a directly comparable 15-minute futures-candle strategy. It explicitly says it has no established profitable edge. Its documented cost, liquidity and source checks are sensible design ideas, not independent performance evidence.
- [Zarattini, Barbon and Aziz](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4824172) study intraday momentum on **SPY**. That is inspiration for testable intraday hypotheses, not proof of a transferable crypto edge.
- [Kitron and Wengrowicz's 2026 preprint](https://arxiv.org/abs/2608.21888) reports 15-minute crypto reversal predictability, but a gross edge around 1.3bp versus a 5bp round-trip benchmark cost. Predicting direction is not the same as making net money; this paper is not evidence for our implementations.

Public product pages do not expose Bucko's implementation or independently audited performance. Neither HashiBot nor Bucko is ranked as quantitatively superior from marketing alone. We have not accessed or copied proprietary code, and have not added prediction-market trading to HashiBot.

## New, isolated implementations

1. **VWAP reclaim:** prior rolling 24-bar volume-weighted price, closed hourly directional agreement, a pullback and accepted reclaim, extension/shock rejection and structural stop geometry.
2. **Failed auction:** prior 24-bar range, balanced price path, a sweep and rejection back inside the boundary, sufficient volume and enough room to the range midpoint after costs. OHLCV volume is not represented as actual order flow.

Both use 110 contiguous closed 15m bars and exact completed hourly aggregation. Missing, duplicated, malformed, misaligned, open, stale and shock bars reject. Numeric rule scores explicitly are not win probabilities. Both are registered in the existing scanner **DISABLED / SHADOW / RESEARCH** and reproduced through its replay registry. No paid-publication permission is created.

The connected test exposed a name-based legacy no-trade rule that rejected valid specialist candidates or treated range strategies as failed trend strategies. An explicit specialist-policy branch now lives in the **same shared market arbitration module**, validates the specialist policy version and evidence, and leaves legacy behavior unchanged. It is not an alternate arbitrator or a score upgrade to force trades. Mixed legacy/specialist portfolio behavior is not certified here.

## Real data and prespecified trials

[Protocol](../../../scripts/research/intraday15/protocol.json): BTCUSDT and ETHUSDT USD-M perpetuals, January 2025–June 2026, 36 official archive/checksum pairs, **104,832 admitted 15-minute bars**. Each instrument must have all 18 monthly files, exact interval coverage, matching counts, valid OHLCV and content hashes. Source URLs and raw/normalized hashes are in [development.json](development.json).

Six final cases: two hypotheses × static stop, breakeven, and wider stop/target variants. Two instruments per case; results are pooled **independent signal outcomes, not portfolio performance**. One active signal per symbol within each case. Twelve-hour maximum horizon, next-open entry, 50% TP1, conservative stop-first ambiguity, and conservative same-bar breakeven handling. Round-trip assumptions: 10bp fee, 2bp spread, 4bp slippage, 4.5bp funding reserve; 1.5× cost stress. These are explicit reserves, not historic book/funding observations.

The initial six legacy-policy integration diagnostics are also retained in development.json. They all failed and are not erased by the subsequent policy integration fix: **12 development cases in total**, six final-source cases. This is disclosed multiple testing, not 12 independent discoveries. The calendar period was already examined by earlier research and is labeled development, never a newly untouched holdout. No validation/holdout prices were acquired, no threshold was weakened, and no existing failed manifest was re-frozen to pass checks.

| Final hypothesis | Variant | Resolved outcomes | Net PF | Expectancy R |
|---|---|---:|---:|---:|
| VWAP reclaim | Structural | 149 | 0.698 | -0.220 |
| VWAP reclaim | Breakeven | 149 | 0.673 | -0.238 |
| VWAP reclaim | Wider | 183 | 0.742 | -0.172 |
| Failed auction | Structural | 1 | 0.000 | -1.235 |
| Failed auction | Breakeven | 1 | 0.000 | -1.235 |
| Failed auction | Wider | 0 | Undefined | Undefined |

Overlapping variants reuse trades. The 483 CSV rows are scenario outcomes, **not 483 independent trades or a Prop challenge**. [trades.csv](trades.csv) preserves candidate/entry/exit identity, stop/targets, gross R, cost R, net R, partial exits, cash-flow evidence and whole-candle MAE/MFE. Export verifies every cash-flow sum against net R.

## Diagnosis, not another unexplained FAIL

- Structural VWAP: BTC gross -7.165R, costs 10.816R; ETH gross +4.868R, costs 19.701R. Fees alone do not explain BTC losses; ETH's modest gross edge does not survive these assumptions.
- Wider VWAP: BTC gross -10.667R, costs 13.164R; ETH gross +13.864R, costs 21.418R. Wider brackets did not establish net edge. Breakeven did not improve pooled performance.
- Failed auction is not a useful product in this form: stop/cost feasibility and structural reward eliminate nearly every setup. One losing outcome is insufficient to estimate this hypothesis's performance. No win-rate claim is made.
- The shared pipeline tests pass, but passing software tests does not make these strategies valuable. Do not increase leverage, relabel grades or select a winning symbol-period after the fact to rescue them.

The unmet objective remains a statistically credible **net** edge. The next research decision should test a materially different, economically motivated hypothesis or genuinely richer inputs, not repeat an unbounded grid over the same candles. Candidate areas: time-of-day noise boundaries (requiring longer same-clock history than the current 110-bar input), native taker-flow/volume imbalance (requiring admitted provenance-bearing fields), or a cost-aware walk-forward forecast with calibrated uncertainty. Those are **not implemented or proven by this report**. They must remain within the shared scanner and preserve untouched/forward evidence. Broker-specific Forex/Gold data and independent Bybit validation remain separate requirements.

## Reproduction

```sh
python3 scripts/research/intraday15/download.py /tmp/hashibot-intraday15-development
node --import tsx scripts/research/intraday15/develop.ts /tmp/hashibot-intraday15-development /tmp/intraday15-final.json
```

For the full audit export, supply the preserved initial diagnostic as the second argument:

```sh
node --import tsx scripts/research/intraday15/export.ts /tmp/intraday15-final.json /tmp/intraday15-legacy-policy.json docs/research/intraday15
npm run test:release1
```

The legacy diagnostic has the earlier source hashes recorded in development.json; rerunning today's engine does not reproduce that earlier version. Final metrics are reproducible with the current hashes and same declared data. No shell command above contacts trading/payment endpoints or writes production records.

## Verification boundary

Passed locally: Release-1 suites (including actual embedded SQL with mocked providers), new 15m candidate/registry/arbitration and policy-forgery/legacy-preservation tests, strategy suite, Phase L, Phase M, app typecheck, focused research-module typecheck, build, Edge-function discovery and explicit `eslint --no-ignore` on new TypeScript files. No schema changes were needed. No browser UI was modified or newly reviewed. These are not real Supabase, Telegram, provider fills or forward certification.

**15M IMPLEMENTATION: COMPLETE FOR THESE TWO HYPOTHESES; ECONOMIC DEVELOPMENT GATES: NOT PASSED; STRATEGIES REMAIN DISABLED; NO PROFITABILITY CLAIM.**
