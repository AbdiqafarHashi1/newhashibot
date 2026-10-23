# Cost-aware opportunity research — 23 October 2026

**No strategy in this study qualifies for paid signals or execution.** This is measured development work, not a successful launch, an untouched holdout or a profitability guarantee. All new definitions default to DISABLED / SHADOW / RESEARCH and require an explicitly versioned model. No production configuration was changed.

## What was actually measured

Five crypto assets (BTC, ETH, BNB, SOL, XRP): 90 official Binance USD-M archive/checksum pairs, January 2025–June 2026, 262,080 native 15-minute candles. Native taker-buy volume is preserved, rather than inferred from price. There are 257,614 eligible training observations. Training outcomes overlap and are not independent trades.

Forex: recovered native Dukascopy BID/ASK archives yielded EURUSD 4,683, GBPUSD 528 and AUDUSD 480 and USDCAD 2,634 hourly observations; USDJPY had none. Missing months remain missing, zero-volume non-observations are excluded, and no forward outcome may cross a quote gap. Only 5,065 eligible training observations and four evaluation months were available. Gold is not covered. A fresh provider request was rate-limited; no synthetic completion or repeated retry is represented as evidence.

Each monthly model trains on the previous six months only. Labels ending at or beyond the evaluation boundary are purged, and normalization is fitted only on training data. Two prespecified ridge strengths were followed by **one explicitly disclosed additional hypothesis after seeing those failures**: 40 shallow depth-two gradient trees, learning rate 0.05, fixed seed and leaf limits. No hidden search for a winning configuration. The full negative ridge cases remain in both reports.

| Market | Model | Resolved selected outcomes | Net profit factor | Mean net R |
| --- | --- | ---: | ---: | ---: |
| Crypto | Ridge 10 | 9 | 0.135 | -0.6661 |
| Crypto | Ridge 100 | 8 | 0.142 | -0.7083 |
| Crypto | Shallow trees | 0 | Undefined | Undefined |
| Forex, partial coverage | Ridge 10 | 90 | 0.885 | -0.0634 |
| Forex, partial coverage | Ridge 100 | 90 | 0.939 | -0.0331 |
| Forex, partial coverage | Shallow trees | 60 | 0.893 | -0.0567 |

The forecast threshold is +0.15 expected net R, not a win probability. Selected forecasts pass the existing registry, qualification and canonical arbitrator. Their labels and Python/TypeScript inference are checked against the shared replay outcome engine. Next-open entry, 2 ATR initial risk, 50% TP1 at 1R, remainder target 2.5R, conservative collision handling and 32-bar maximum duration are frozen. Crypto uses 20.5 basis points of disclosed total fee/spread/slippage/funding reserves; Forex uses observed current spread plus 1.3 basis points of reserves. Costs are stressed 1.5×. Neither fills nor historical swaps/funding are claimed to be measured. Overlapping asset positions are not portfolio or Prop performance.

Both compact generated JSON reports retain all monthly model parameters, source and engine hashes, selected forecasts, canonical arbitration, outcome cash flows, stress results, exclusions and coverage. Compact JSON reduces repetitive generated lines; it does not remove evidence. The older failed research manifests are preserved and remain bound to their original code hashes.

## Connected runtime improvements

- The scanner's existing adapters preserve native SPOT versus USD-M identity and available native flow. Missing data is not zero.
- Optional dynamic universe selection observes up to 100 mature liquid perpetuals by default (hard cap 200), rotates through the existing bounded per-cycle capacity, and records sampled coverage. It does **not** claim every symbol was checked at every close. Existing enablement remains unchanged; there is no schedule activation.
- Missing/stale ticker timestamps, insufficient history, extreme moves and poor liquidity are excluded. Static fallback metrics are explicitly unknown rather than invented.
- Official exchange listing metadata produces research observations only. New listings are excluded from the mature trading universe until at least 30 days old; no listing is promoted into a trade automatically.
- Existing intelligence generation now produces source-backed Forex briefs from the dedicated healthy owner MT5 feed. Crypto briefs route to Crypto VIP and Forex/Gold briefs to Forex & Gold VIP through the existing canonical editorial queue. Partial/stale observations hold publication. General editorials retain existing behavior.
- No extra scanner, arbitrator, signal writer, risk authority or executor was created. Phase D and account-scoped E/F execution remain unchanged. No messages, orders, migrations or deployments were performed.

The new flow/ask fields are available to native-file research and immediate evaluator contexts. Existing SQL candle/dataset storage has not been migrated to preserve those extra fields. Consequently these models are **not advertised as selectable production or fully persisted Backtest Lab models**; missing evidence fails closed. MT5 historical bid/ask model inputs and a prospective frozen strategy acceptance test remain required before any promotion. This limitation does not affect existing strategies' OHLCV contract.

## Reproduction

Run from the repository root with Node/tsx and the pinned Python research requirements. Raw training caches and archives are deliberately not committed.

```bash
python3 scripts/research/cost-aware/download.py /tmp/cost-crypto
node --import tsx scripts/research/cost-aware/prepare.ts /tmp/cost-crypto /tmp/cost-training.json
OPENBLAS_NUM_THREADS=1 python3 scripts/research/cost-aware/fit.py /tmp/cost-training.json /tmp/cost-ridge.json
OPENBLAS_NUM_THREADS=1 python3 scripts/research/cost-aware/fit-trees.py /tmp/cost-training.json /tmp/cost-ridge.json /tmp/cost-models.json
python3 scripts/research/cost-aware/prepare-fx.py /path/to/source-bi5-cache /tmp/cost-fx
node --import tsx scripts/research/cost-aware/prepare-forex.ts /tmp/cost-fx /tmp/fx-training.json
OPENBLAS_NUM_THREADS=1 python3 scripts/research/cost-aware/fit.py /tmp/fx-training.json /tmp/fx-ridge.json
OPENBLAS_NUM_THREADS=1 python3 scripts/research/cost-aware/fit-trees.py /tmp/fx-training.json /tmp/fx-ridge.json /tmp/fx-models.json
node --import tsx scripts/research/cost-aware/evaluate.ts /tmp/cost-crypto /tmp/cost-models.json /tmp/cost-fx/coverage.json /tmp/crypto-report.json crypto
node --import tsx scripts/research/cost-aware/evaluate.ts /tmp/cost-fx /tmp/fx-models.json /tmp/cost-fx/coverage.json /tmp/forex-report.json forex
node --import tsx scripts/research/cost-aware/export.ts /tmp/crypto-report.json /tmp/forex-report.json
npm run test:release1
```

Check script usage before supplying paths; Forex source recovery requires the exact source bytes identified by the report, not newly downloaded replacements silently assigned the same identity. All calendar dates in this study are development data previously examined during research. A later untouched and genuine forward period is mandatory for a passing strategy, even if a development case eventually passes.

Next evidence priority: reliable complete Forex/Gold bid/ask coverage, independent venue costs, and a prospectively frozen acceptance protocol. News/listing observations and factual channel activity do not substitute for trade expectancy. Do not lower qualification or inflate confidence to create more signals.

## Verification boundaries

Local Release1 (including actual stored-study hash and cash-flow checks), strategy framework, Phase K/L/M and Telegram suites passed. App and focused research TypeScript checks, production build, Edge Function discovery and all 38 local Edge bundles passed. Full application lint retains 27 warnings and zero errors; explicit lint on the new runtime/research TypeScript has zero errors. The new connected editorial test reaches the existing durable enqueue RPC with injected database transport and asserts distinct market destinations; no external Telegram request is made.

No authenticated browser change/review, deployed PostgreSQL/RLS test, real MT5 feed observation, Telegram delivery, paid-customer lifecycle, provider order or forward performance validation was performed in this pass. Existing prior-head CI evidence is not evidence for this new commit. This is code and historical-development evidence only; production activation remains blocked.
