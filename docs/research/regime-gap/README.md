# Range, bear-rally and expansion gap research

27 October 2026. These are three fixed hypotheses specified after earlier failures, **not qualified live strategies**. No parameter sweep, threshold rescue, new live scanner or release permission was introduced. Existing positive-but-under-sampled spot/alt research remains unchanged.

## Results on reused development

90 vendor-checksummed Binance USD-M monthly archives, five assets (BTC, ETH, BNB, SOL, XRP), January 2025–June 2026; 262,080 native fifteen-minute bars. Aggregation validates alignment, identity, native volume and OHLC. Decisions consume closed prefixes only. All 15 asset/mode cases, both directions, calendar slices, arbitration and base/stressed outcomes are retained in `evidence.json.gz` with source/engine hashes.

| Hypothesis | Resolved | Net PF | Stressed PF | Verdict |
|---|---:|---:|---:|---|
| Failed auction in a flat range | 761 | 0.661 | 0.547 | Rejected |
| Rejected rally in a downtrend | 170 | 1.056 | 0.994 | Rejected |
| Compression release | 77 | 0.669 | 0.629 | Rejected |

Use the exact machine-readable summary as numerical authority. Range long/short results remain separate. The bear-rally model loses in the 2025 slice despite a positive 2026 slice; selecting only the latter would misrepresent the result. Some individual cells look better, but no losing asset was silently removed. No validation acquisition is authorized by these failures.

## Accounting and limits

Entries use next fifteen-minute open; stops win intrabar collisions and adverse gaps use actual open. Full target, no partial exit or early breakeven; 12h range / 7d trend holding bounds. Incomplete horizons stay OPEN. The shared repository outcome engine and canonical arbitrator are used. This is a research-entry feasibility screen, **not full production registry/qualification/cooldown parity**. Scores are rule ranks, not probabilities.

Modeled costs: 10bp fees +2 spread +4 slippage +3 funding reserve, **plus 1bp per commenced 8h held**; stress multiplies everything by 1.5. Costs are not observed venue fills or settled funding. Independent signal R-multiples are not netted portfolio/account returns. Open costs remain evidence but unresolved trades do not get completed-P&L labels. Multiple assets/modes overlap and are correlated.

Hypotheses are HashiBot adaptations motivated by published momentum/reversal and trend-following research, not exact replications or claims that those papers establish these particular rules. Primary references: https://www.sciencedirect.com/science/article/pii/S1062940822000833 and https://arxiv.org/abs/2009.12155 .

## Reproduction

```bash
node --import tsx scripts/research/regime-gap-study.ts /path/to/verified-crypto-development
node --import tsx tests/phaseL/regimeGap.test.ts
node --import tsx tests/phaseL/regimeGapEvidence.test.ts
```

The normal `tsx` CLI could not create its IPC pipe in this environment (`EPERM`); Node's supported import loader ran the same source without that IPC server. Focused strict compilation found type annotations to correct; those metadata/type/serialization-lint fixes were applied before regenerating the final report, without changing trading rules or parameters.

Publication/execution/promotion are false. Genuine forward validation and current-head remote CI are NOT_RUN/unverified.

## Delivery verification

After a clean `npm ci`: Phase-L and Release-1 suites, application typecheck, focused strict research compilation, production build and explicit new-file lint passed. All32 Python research tests passed, including independent futures accounting and source-snapshot verification. Changed text whitespace passed. No authenticated visual review was available; VISUAL REVIEW NOT_RUN.

The published parent `a2a3d2c` was inspected, rather than assuming CI was green. Its verify job [121887363853](https://github.com/AbdiqafarHashi1/newhashibot/actions/runs/40412758602/job/121887363853) failed on a newly reported `body-parser` advisory, GHSA-27r3-jxmh-p828. The lockfile now resolves body-parser2.4.0 and its qs6.16.1 requirement; these are the only two changed package records. Clean installation confirmed those versions and `npm audit --omit=dev --audit-level=moderate` found zero vulnerabilities. The audit remains required. Its separate broker-data job [121887363845](https://github.com/AbdiqafarHashi1/newhashibot/actions/runs/40412758632/job/121887363845) failed with provider HTTP503; this research does not claim to fix that availability problem. New-head remote CI is unverified at publication.

No public-page, pricing, account-risk, provider, migration, schedule, publishing or execution authority was changed. The existing canonical arbitrator is used for isolated entry screens; no new live arbitration policy is introduced because these new hypotheses failed qualification.
