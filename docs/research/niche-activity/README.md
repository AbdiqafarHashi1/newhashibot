# Setup-specific research and honest activity measurement

27 October 2026. Three fixed new hypotheses, all measured on five assets and reused development data. No sweep, losing-asset deletion, confidence inflation or live permission. This is not a signal-per-day quota.

| Setup | Closed | Net PF | Entry/day across536days | Zero-entry days |
|---|---:|---:|---:|---:|
| BTC-led catch-up |46|0.748|0.086|499|
| Range taker-flow reversal |5|1.454|0.009|531|
| Trend shock recovery |4|2.400|0.007|532|
| Combined selection |55|0.867|0.103|490|

None qualifies. High PF on4–5trades does not establish edge. The combined setup has a51-day longest silent streak; equal fixed rule scores plus canonical arbitration did not solve quality/frequency. Source identity and every asset/direction/calendar result remain in `evidence.json.gz`; original research is retained.

## Method

90 official Binance USD-M monthly ZIP/CHECKSUM pairs, five fixed assets, January2025–June2026,262,080 native15m bars. Decision interval January11–June30 excludes10days of warmup and includes536fullUTCdays. Completed H1 context only; open/future H1 context is rejected. Native taker-buy volume is observed data, not OHLC-invented CVD, whale identity, liquidation or news evidence. Protocol contains exact entry/geometry rules.

Existing canonical arbitrator and replay outcome engine: next15m open, stop-first collisions, full exits,8h maximum, incomplete horizons OPEN.19bp declared fee/spread/slippage/funding reserves; stress1.5. Reserves are not actual venue fills or settled funding. One active per symbol per mode; other assets/modes overlap. R-multiples are independent signal outcomes, not executable portfolio/account returns. Research entry screens are **not full production registry/qualification/selection-policy parity**.

Frequency counts actual non-excluded entries, candidate decisions separately, zero-entry dates, median/mean/max and longest silence. It is not a count of delivered Telegram messages. Full daily arrays are retained. Model scores are deterministic ranks, not win probabilities. There is no live publisher, second scanner, account-risk decision or execution in this study.

## Verification and reproduction

```bash
node --import tsx scripts/research/niche-activity-study.ts /path/to/verified-crypto-development
node --import tsx tests/phaseL/nicheActivity.test.ts
node --import tsx tests/phaseL/nicheActivityEvidence.test.ts
```

Strict compilation initially required a local Case type annotation. The positive test fixtures initially failed their declared geometry/breakout rules and were corrected without changing market rules. A bounded pure timestamp-string conversion cache then removed repeated Date.parse work; it caches no prices, rows or decisions. The study was rerun in full. Every candidate, arbitration, outcome and activity result was compared with the original run and matched exactly. No parameter or trading outcome was changed.

Frozen source/protocol hashes, gzip/raw hashes, independently calculated signed P&L/cost/cash-flow checks and calendar counts are verified. Publication/execution/promotion false. Visual and genuine forward/provider review NOT_RUN. Existing prior research is now grouped behind an expandable history section in Backtest Lab rather than removed or labelled successful.

Final local checks: Phase-L and Release-1 suites, application and focused strict TypeScript checks, explicit new/changed-file lint, production build, all38 Python research tests, downloader compilation and text whitespace passed. Across this study and the wider-watchlist study,454paired base/stress outcomes pass independent signed P&L, cost and cash-flow checks; every daily activity count is independently reconstructed. These are implementation/evidence checks, not strategy certification. New-head remote CI remains unverified at publication.
