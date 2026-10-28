# Complementary crypto setups — 28 October 2026

The target is four complementary, cost-positive strategies with at least one combined qualified signal/day and broad active-day coverage. **That target has not been met. Nothing in this study grants publication approval.**

Four actual evaluator implementations cover trend pullbacks, volatility breakouts, exhaustion reversals and relative momentum. The existing registry, qualification, canonical arbitrator and close-observed lifecycle are reused. The Backtest Lab exposes the frozen combined/single-role profiles through its existing authenticated endpoint and portable worker/store. Five native datasets are allowed only for this explicit research profile; other request bounds are preserved. Every 15m close is evaluated, with 960 native warmup bars, complete UTC H4 aggregation and aligned BTC reference. There are no invented news, CVD, order-book or funding observations.

## Static results

Vendor-checksummed Binance USD-M 15m data: BTC, ETH, BNB, SOL, XRP. 170,400 development contexts over 11 January–31 December 2025, then 86,880 later contexts over January–June 2026. Next-open entries, full target, 96-bar maximum, stop-first collisions, 25 bps declared cost reserve and 37.5 bps stress. Signal-level R, not account equity or executable portfolio returns.

| Setup | Raw development PF | Result |
|---|---:|---|
| Trend pullback | 0.7262 | Development rejected |
| Volatility breakout | 0.7225 | Development rejected; XRP-only calibration also failed frozen gates |
| Exhaustion reversal | 0.6336 | Development rejected |
| Relative momentum | 1.0009 | Development-only BNB/XRP scope passed development at 1.2944 PF; later PF 0.9249 on 18 resolved trades failed |

`assessment.json` computes explicit role and participation verdicts. Complete outcomes, cash flows, source manifests, configuration/protocol and source hashes are in `evidence.json.gz`; exact frozen source bytes are retained in `source-snapshot.json.gz`. No validation-loss asset pruning or revised pass threshold is used. These calendars have appeared in other project research; this is not project-wide untouched evidence.

## Further calibration attempts

Both are retained rather than hidden:

* `../signal-ensemble-calibration/`: fixed prior-closed 90-day role-PF gate. Development 56 trades / PF 0.4120; later 30 / PF 0.4410. Participation failed. Unfinished trades cannot supply calibration labels.
* `../signal-ensemble-model/`: four fixed regularized context models trained January–June 2025, unchanged validation July–December 2025 and later January–June 2026. Combined validation 170 resolved / PF 0.6601; later 151 / PF 1.0484, stressed PF 0.9262 and 0.8343 signals/day. Thus no combined approval. Relative-momentum model passed the middle-period screen but later had only 22 resolved trades; this is not enough to declare a release. Tree inference has a portable bounded TypeScript implementation with exact Python prediction parity tests.

The longer extension is complete and also rejected. `../signal-ensemble-extended/` retains the complete qualified candidate stream and shadow labels; `../signal-ensemble-extended-model/` retains frozen models, complete selected outcomes, source snapshots and an explicit assessment. Training2021–2023; unchanged validation2024; later diagnostic January2025–September2026. Model parameters/feature order/thresholds were frozen before fitting, not swept. The later diagnostic remains unqualified because its prior stage failed.

| Period | Resolved | Net PF | Stress PF | Mean signals/day | Active-day fraction |
|---|---:|---:|---:|---:|---:|
| 2024 |191|1.0585|0.9349|0.5219|0.3743|
|2025–September2026|310|0.7520|0.6623|0.4859|0.3652|

355 vendor-checksummed archives,1,007,520 continuous native candles and1,002,720 examined contexts cover all5main assets. 501 final model outcomes independently reconcile signed actual-fill payoff,25bps costs and cash-flow totals. SOL/XRP monthly archives omitted five2022days each; the ten corresponding official daily archives recovered960actual candles without rewriting originals. Conflicting duplicates would block recovery. Every role, asset, direction and adaptive market state is inventoried, including insufficient samples. No assertion of profitable performance in every condition is made.

The initial urllib archive reader stalled and a bounded persistent-HTTP resume completed the same immutable acquisition. Its first partial-body reader was rejected by checksum validation; it was corrected before any recovered archive was accepted. Exact source/hash/row checks are repeated by the study. No partial archive became replay-ready.


## Reproduce

```
node --import tsx scripts/research/signal-ensemble/study.ts <verified-native-cache>
node --import tsx scripts/research/signal-ensemble/assess.ts
node --import tsx scripts/research/signal-ensemble/calibration-study.ts <verified-native-cache>
python3 scripts/research/signal-ensemble/model-study.py
node --import tsx scripts/research/signal-ensemble/model-evaluate.ts <verified-native-cache>
node --import tsx --test tests/signalEnsemble/*.test.ts
```

The Python model study requires scikit-learn (recorded version 1.8.0) and NumPy; production inference does not. Public data reads require no customer/provider execution credentials. No migrations, database writes, schedules, publications, real provider orders or automatic strategy promotions are performed by these scripts. The connected endpoint tests use an injected database/transport harness, not deployed PostgreSQL proof. Authenticated visual review and live feed validation remain not run.

Research references motivate hypotheses, not HashiBot profitability: [Liu and Tsyvinski, Risks and Returns of Cryptocurrency](https://www.nber.org/papers/w24877), [Man Group, In Crypto We Trend](https://www.man.com/insights/in-crypto-we-trend). Neither validates these 15m rules, fitted models or signal frequency.

## Verification of this implementation

Passed: `test:signal-ensemble` (12 tests), `test:phase-p` (46 tests, including four first-chronological native-candle endpoint/store/runtime examples), `test:phase-k`, `test:phase-l`, `test:phase-m`, `test:strategies`, `test:telegram`, application typecheck, `tsc -p cloud/tsconfig.json --noEmit`, production build, Edge discovery and three affected Edge bundles. Explicit new-source lint passes; application lint has zero errors and27 retained warnings. Text whitespace/conflict-marker scans pass. This checkout has no `.git`, so these scans are not falsely reported as `git diff --check`.

The initial cloud typecheck command used the nonexistent `cloud/worker/tsconfig.json`; it was corrected to the actual `cloud/tsconfig.json` and passed. No new TypeScript failure is hidden behind a baseline claim. Authenticated desktop/mobile visual review, deployed database/lease behavior, real provider-forward observation, real Telegram delivery and deployment remain NOT_RUN. No external actions or activation are authorized by passing deterministic tests.

Longer experiment reproduction (existing2025–June2026 cache is retained):

```
python3 scripts/research/signal-ensemble/download-resume.py <extended-cache>
python3 scripts/research/signal-ensemble/download-gaps.py <gap-cache>
node --max-old-space-size=4096 --import tsx scripts/research/signal-ensemble/extended-stream.ts <existing-cache> <extended-cache> <gap-cache>
python3 scripts/research/signal-ensemble/extended-model-study.py
node --import tsx scripts/research/signal-ensemble/extended-model-evaluate.ts <existing-cache> <extended-cache> <gap-cache>
node --import tsx scripts/research/signal-ensemble/extended-assess.ts
```

`download-resume.py` requires aiohttp; the bounded standard-library downloader remains available. Archives and normalized large raw datasets remain outside the repository; official URLs, original hashes, normalized hashes, counts and gap-recovery lineage are persisted with the evidence. There are no deletions of old strategies or reports, no migration rewrites, and no public-page/pricing/cron changes in this pass.
