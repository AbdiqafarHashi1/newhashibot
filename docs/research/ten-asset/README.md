# Ten assets, ranked admission and directional coverage — 29 October 2026

The requested watchlist expansion is implemented as a **versioned research profile** in the existing Backtest Lab. The smaller positive lead is preserved. No new strategy is approved or activated by this work.

## What changed

Fixed watchlist: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, LINK, AVAX and LTC. BTC/ETH retain their original Spot daily strategy. Eight alts use the unchanged USD-M relative-strength evaluator; BTC USD-M is their reference. Eleven datasets represent ten underlying assets. Contemporary selection carries survivorship/selection bias; this is not a reconstructed historical universe. LTC remains included despite earlier weak results.

At each shared close, existing registry/qualification/arbitration produces eligible winners. A shared admission utility ranks them by canonical score, current relative return, current quote-volume ratio and stable identity. This is **current setup strength**, not a calibrated probability or proof of superior future returns. Existing active positions retain protection and locks; there is no forced replacement. One signal per underlying and three total active signals remain unchanged. More opportunities do not imply more concurrent risk.

A separate profile tests a bearish mirror: falling BTC24h, weaker alt24h, negative alt week, new closed hourly low and observed volume confirmation. Long and short gates are mutually exclusive on the same BTC prefix. Direction-adjusted ranking handles negative returns correctly. This remains the same relative-momentum family, so three decision variants are **two mathematical families**, not three/four independent edges.

The single scanner runtime, arbitrator, immutable signal lineage and customer/account execution authorities are preserved. New ordering is confined to the new frozen research profiles; it is not claimed deployed production policy. Existing profiles retain old ordering and selection hashes. The repository already supports a default ten-symbol production pass and broader observation pool; none of those live settings, schedules or limits were activated or changed here.

## Complete measured comparison

Same February2025–September2026 calendar, 607 days; continuous signal state across monthly compute batches. Both watchlist scope and admission ordering differ from the smaller baseline: this is not a causal estimate of asset expansion alone.

| Frozen reserve-cost comparison | Selected / closed / open | Net R PF | Stress PF | Entries/day | Quiet days | Longest quiet stretch |
|---|---:|---:|---:|---:|---:|---:|
| Preserved five-asset pair |154 /152 /2|1.3289|1.2282|0.2537|479|27 days|
| Ten assets, long only |301 /299 /2|1.1104|1.0297|0.4959|406|26 days|
| Ten assets, bullish/bearish mirror |587 /585 /2|0.9437|0.8757|0.9671|253|10 days|

Expansion roughly doubled participation. The bearish extension approached the frequency target but lost money after the declared costs. It is rejected for quality. No losing asset or period was discarded.

| Entry period | Long-only closed / net PF / stress PF | Bullish-bearish closed / net PF / stress PF |
|---|---|---|
| Feb–Dec2025 |173 /1.0400 /0.9715|357 /0.9322 /0.8712|
| Jan–Jun2026 |79 /0.8439 /0.7708|159 /0.8263 /0.7573|
| Jul–Sep2026 |47 /2.3276 /2.1298|69 /1.3884 /1.2658|

The aggregate positive long-only result does not erase its losing interval. Neither profile meets the frozen profitability, participation and coverage requirements. Four distinct qualifying families are not established. An explicit read-only coverage assessment refuses asset clones, unobserved regime labels and mixed lineage; it never grants publication/execution authority. No range-family approval is claimed.

## Genuine rates, separate cost audit

Original runnable profiles preserve their frozen reserves: daily26bps/stress39; alt25/stress37.5 including funding reserve. All remain modeled costs, not provider fills or account returns.

A separate audit reprices identical selected trades using 168 checksum-verified official funding archives. Actual settlement timestamps, rates and intervals replace the reserve. Native 15m candle-open prices proxy funding notional; actual mark prices/fees/fills are not claimed. Trading friction remains modeled at16/24bps; Spot daily costs stay26/39. Boundary ambiguity includes adverse payments and denies uncertain credits. Adverse funding is stressed1.5x; credits are not amplified. Coverage gaps and missing trailing settlement evidence block the calculation.

| Observed-rate cost diagnostic | Net PF | Stress PF |
|---|---:|---:|
| Ten-asset long-only |1.1570|1.0940|
| Bullish/bearish mirror |0.9865|0.9344|

The bearish mirror remains below break-even. Long-only January–June2026 remains losing (PF0.8904; stress0.8342). This audit is **read-only**, separately versioned and not represented as a connected funding-aware replay mode or release approval. It cannot make the failed strategy pass by relabelling costs.

## Operator path

Backtest Lab → Calibration → **Watchlist expansion and regime coverage** contains both full comparisons, period/asset tables, funding audit, complete evidence downloads and replay links. Catalog labels identify failed stability/quality screens. These are historical research results, not production channel performance.

For the exact ten-asset roster, register BTC/ETH Spot1d histories and BTC plus eight alt USD-M15m histories. Keep the daily seed prefix and960 closed15m warm-up bars. Use monthly evaluation windows within10,000-cycle,12,000-working-candle and250,000-total-source-row bounds. Dataset registration and work consumption still require authenticated deployed backend/worker configuration. New jobs start with their own state; only the committed continuous study carries state across the full20 monthly compute slices.

The protected endpoint freezes configuration and ordering lineage. The concrete store persists checkpoints/outcomes. New ranking prepares only the current close batch, enabling bounded workers to yield and restart inside a batch without recomputing every future evaluation. Missing next-open candles are not replaced by later fills. Partial candles cannot prove stops/targets beyond a new profile's requested end; next-open regime exits may use a known open. Existing historical reports retain exact source snapshots as shared code evolves.

## Evidence and limits

- 189 official USD-M price archive/checksum pairs:551,232 native15m bars; original6,312 Spot daily bars reused.
- 168 official funding archives for the separate cost audit; interval/cadence/hash checks retained.
- Each complete ten-asset replay evaluates117,758 chronological events, with canonical strategy/arbitration and observed lifecycle. Selected outcomes/cash flows, all assets and periods are preserved. Events/scenarios are not independent observations or portfolio equity.
- Both calendars and assets were seen in earlier research. Some additional per-asset histories were first acquired here, but there is no project-wide untouched-holdout claim.
- A streaming-reader acquisition error was caught by vendor checksum validation, corrected and rerun; the checksum gate was never relaxed. One partial compute checkpoint is retained separately and excluded from final counts.

Tests cover genuine eleven-dataset endpoint→store→runtime paths for long and short setups, authority/isolation denial, policy substitution, strongest-first admission, restart mid-batch, existing-order preservation, independent signed cash-flow arithmetic and missing funding/price evidence. Injected database transports are not deployed PostgreSQL/Auth/RLS/concurrent-RPC proof. The retained daily migration test executes actual embedded PostgreSQL constraints.

No remote SQL, deployment, schedules, messages, payments, provider orders, public-page/pricing changes, automatic merge or live activation occurred. Live target-free publication, full funding-store integration, fresh forward validation and final profitable complementary strategies are **not** claimed complete.

## Reproduce

```sh
python3 scripts/research/ten-asset/acquire.py ../research-data/ten-asset
npx esbuild scripts/research/ten-asset/study.ts --bundle --platform=node --format=esm --outfile=.tmp/ten-asset.mjs
node .tmp/ten-asset.mjs
npx esbuild scripts/research/ten-asset-regimes/study.ts --bundle --platform=node --format=esm --outfile=.tmp/ten-regimes.mjs
node .tmp/ten-regimes.mjs
python3 scripts/research/funding-audit/acquire.py ../research-data/ten-funding
python3 scripts/research/funding-audit/audit.py ../research-data/ten-funding
npm run test:ten-asset
npm run test:funding-audit
```

For the original long-only receipt, first restore the hash-verified files in `source-snapshot.json.gz` inside an isolated repository copy; do not overwrite the working tree used for the later bearish comparison. Run the long-only commands in that isolated copy. Run the bearish and funding-audit commands against the current tree and retained input receipts. The original long-only source is pinned in `source-snapshot.json.gz`. Later shared extensions preserve its numerical path; its historical source identity is not rewritten to pretend a later engine generated the old receipt.
