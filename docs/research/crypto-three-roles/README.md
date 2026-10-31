# Five crypto hypotheses and frozen-date validation — 26 October 2026

**One promising research candidate; zero strategies certified for paid signals.** No strategy, signal publisher, executor, cron, provider account or production permission was activated.

## What was measured

Five fixed economic hypotheses were evaluated in two disclosed development experiments. The first three also have a combined canonical-arbitration case. Every asset cell is preserved, including ineligible and zero-trade cases. No losing asset was removed to improve a result.

| Hypothesis | Development resolved | Net PF | Stressed net PF | Disposition |
|---|---:|---:|---:|---|
| Trend pullback | 96 | 0.666 | 0.595 | Failed |
| Range reversion | 275 | 0.713 | 0.615 | Failed |
| Altcoin relative strength | 135 | 1.222 | 1.124 | Cleared initial development screen |
| Major-coin weekly momentum | 16 | 0.881 | See complete summary | Failed/insufficient |
| Post-shock recovery | 4 | 0.005 | See complete summary | Failed/insufficient |
| First three combined | 466 | 0.826 | 0.726 | Failed; combining weak strategies diluted the positive candidate |

The additional two hypotheses were specified after the first experiment, before computing their own outcomes. They reuse previously examined development dates and are not independent untouched evidence. Both additional failures remain in the report.

## The positive candidate

ALT_RELATIVE_BREAKOUT is long-only BNB/SOL/XRP, conditional on BTC having positive 24h performance. The altcoin must be up at least3% in24h, outperform BTC by at least2 percentage points, have positive7d performance, close above the previous24h high, and show quote volume at least1.5 times the previous24h mean. Stops are the wider of two prior ATR or prior24h structure; full3R target; maximum24h holding. No news inference or hindsight event labels are used.

Development January2025–June2026:

| Asset | Resolved | Net PF | Stressed PF |
|---|---:|---:|---:|
| BNB | 26 | 1.584 | 1.431 |
| SOL | 63 | 1.038 | 0.960 |
| XRP | 46 | 1.338 | 1.231 |

SOL's stressed loss is retained. Aggregate positivity is not proof that each asset has a robust edge. The fixed surviving universe is not a point-in-time broad-altcoin discovery or new-listing backtest.

## Frozen validation, not a release certificate

The candidate engine, protocol, canonical arbitrator, accounting and acquisition files were SHA256-frozen in `scripts/research/crypto-alt-validation-frozen.json` before acquiring July–September2026. The full development report later reproduced exactly against its frozen hash. June data supplies causal warmup only; validation entries begin July1. Twelve new official archive/checksum pairs supplied35,328 actual15m candles across BTC and the three altcoins. October prices were not acquired by this experiment.

| Validation asset | Resolved | Net PF | Stressed PF |
|---|---:|---:|---:|
| BNB | 5 | 1.530 | 1.278 |
| SOL | 11 | 2.698 | 2.547 |
| XRP | 10 | 2.241 | 2.009 |
| Pooled | 26 | **2.404** | **2.208** |

Mean validation net outcome:0.2323R. **The frozen minimum50-resolved-outcome gate was not met.** No threshold was lowered, no parameters were changed after validation, and October was not consumed to force a pass. Positive26-outcome evidence is promising but small and correlated; it does not demonstrate dependable future profitability. These dates are newly acquired for this experiment; a project-wide untouched claim is not made.

## Architecture and accounting boundary

Research scripts call the existing `trading-domain/arbitrateCanonical` and shared `evaluateReplayOutcome`. There is no second live scanner, arbitrator, publication queue or account-risk authority. Candidates remain RESEARCH/SHADOW, unregistered in production. These entry-feasibility studies do **not** claim full production-registry/selection-policy parity. Production integration and parity are still required if evidence eventually qualifies the candidate. Historical legacy strategies were not deleted or silently promoted.

Closed hourly histories determine decisions; the weekly hypothesis decides only at UTC midnight. Native15m future candles provide next-open fills, gap stops, stop-first collisions, targets and maximum holding. No synthetic15m bars, fabricated fills or open-to-completed horizon shortcuts. One active position per asset/hypothesis; different scenarios and assets may overlap. Results are independent signal outcomes, not portfolio equity, Prop passes or customer account returns.

Declared round-trip reserves:10bps fee +2bps spread +4bps slippage, plus3bps per8h of maximum holding. Thus trend34bps, range19bps, alt25bps, weekly79bps, post-shock22bps. Stress multiplies every reserve by1.5, preserving baseline entries and paths. Historical funding, order-book depth and independent Bybit execution were not measured. These assumptions need venue evidence; they are not factual historical costs.

## Evidence and use

The Backtest Lab's **Calibration → Crypto specialist research** panel shows all five hypotheses, the combined case, frozen validation, failure reasons and full downloads. Large evidence is downloaded on demand rather than parsed in the browser bundle. Existing lab workspaces and public pages remain intact.

`development.json.gz`, `validation.json.gz`, `extra-development.json.gz` retain all34 asset/mode cases, candidates, decisions, outcomes, cash flows, assumptions and source hashes. `summary.json` has all aggregate/asset metrics and compressed/uncompressed SHA256 values. Warmup source files repeat between experiments; scenario rows are not that many independent market observations.

Reproduce, from repository root:

```bash
python3 scripts/research/cost-aware/download.py /path/crypto-development
node --import tsx scripts/research/crypto-three-role-study.ts /path/crypto-development /path/development.json
# Inspect the existing frozen manifest; do not regenerate it after viewing validation.
python3 scripts/research/download-alt-validation.py /path/crypto-validation /path/crypto-development
node --import tsx scripts/research/crypto-three-role-study.ts /path/crypto-validation /path/validation.json scripts/research/crypto-alt-validation-frozen.json
node --import tsx scripts/research/crypto-extra-role-study.ts /path/crypto-development /path/extra-development.json
node --import tsx scripts/research/export-crypto-roles.ts /path/development.json /path/validation.json /path/extra-development.json
npm run test:phase-l
```

Source data and all results are real historical file processing; provider forward observation, historical news testing, Telegram delivery, account/Prop certification and live execution remain NOT_RUN. Source-backed news may be editorial context; it cannot create a certified trade signal merely because a story is popular. Timestamped first-observation evidence would be necessary for a genuine news strategy experiment.

Primary research motivation: [Liu & Tsyvinski, Risks and Returns of Cryptocurrency](https://www.nber.org/papers/w24877) reports cryptocurrency-specific momentum and investor-attention relationships. It does not validate these rules, thresholds or future returns.

Remaining: adequate independent validation sample, full shared production-path parity, independent venue costs, portfolio/concentration evidence and forward shadow performance. The positive candidate is a research lead, not launch approval. Five strategies were tested; five passing strategies were not established.

## Verification on this code

Passed: `npm run test:phase-l` (including both rule suites and evidence integrity), `npm run test:release1`, `npm run typecheck`, focused TypeScript checks for all new research/test files, and `npm run build`. The34-case evidence test reconciles2,036 resolved baseline/stress outcome cash flows and verifies archive hashes, entry/exit pairing, frozen validation dates, no-overlap within each scenario and canonical winner identity. Existing independent50-case accounting oracle passes. Source/hash checks prevented exporting an intermediate report after its runner source changed; the experiment was rerun from the final source before export.

Authenticated browser visual review, new-head remote CI, deployment, real provider/Telegram observations and live account results are NOT_RUN/unverified. No remote SQL, schedules, messages, payments or provider orders were used. This pass adds research/reporting; it does not remove public pages, approved offers, historical strategies or account execution controls.
