# Part 1 ledger backfill

Recovered the original ten complete backtest reports (two reviewed periods per configuration) from GitHub Actions instead of rerunning changed strategy code or downloading redundant candle history. Every uncompressed report SHA-256 exactly matches its existing canonical review. `recovery-manifest.json` records the artifact IDs, archive hashes, original engine hashes, source candle manifests and selected-account trade counts. The existing extractor accepts these reports without changing review hashes, signals, risk policy, migrations or UI.

| Missing configuration | Original symbol scope | Timeframe |
|---|---|---|
| crypto.launch-trend-pullback-48-1.5-5 | BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, LINKUSDT, AVAXUSDT, LTCUSDT | 4h |
| gold.native-momentum-15-48-2-5 | XAUUSD | 15m |
| gold.native-momentum-60-24-2-5 | XAUUSD | 1h |
| gold.native-band-reentry-15-48-3-5 | XAUUSD | 15m |
| forex.native-band-reentry-60-12-2-5 | USDJPY | 1h |

The extractor now matches 28/28 canonical reports plus the two complementary evidence files: 1,159 unique closed trades across 16/16 configurations. The ten recovered reports add 337 closed trades. These are the original account-admitted trades, not an unfiltered opportunity stream.

## Friday pricing

`friday-closes.json` contains 97 first-Friday crossing records, 90 priced and seven unavailable. Native marks are recovered from original account equity minus cash, with original entry costs and accrued carry retained. Each such broker account has one position, no partial exit and one symbol; the generator rejects ambiguous evidence. USDJPY conversion is reconciled against the original native quote archive (GitHub artifact 13999897990). Closing commission, adverse tick rounding and slippage use the original execution assumptions. Complementary Gold uses paired original Dukascopy minute closes where cached, otherwise hourly closes at the same 20:00 boundary, retaining prior TP1 cash flow and the frozen source round-trip cost.

The minute endpoint returned HTTP 429. No retries or access bypass were used. Original cached paired archives supply the remaining candle-close references; hourly timestamps do not prove last-tick freshness. Closed holiday sessions are not forward-filled. Missing marks occur on 2025-04-18, 2025-07-04, 2026-06-19 and 2026-07-03. These leave three scorecard rows N/A after portfolio admission; seven missing source records do not mean seven missing portfolio trades.

The research simulator now consumes these close records, settles a forced close once and ignores its later source exit. Friday liquidation applies to FX/Metals, matching the existing requested policy; an ineligible crypto symbol is blocked for new weekend entries but is not incorrectly classified as Forex for a forced exit. Production rules are unchanged.

## Reproduce the scorecard

From the repository root, prepare the existing reviews without running the activation/migration generator:

```sh
mkdir -p .tmp
node --import tsx -e "import {writeFileSync} from 'node:fs';import {EXECUTION_CANONICAL_REVIEWS as reviews} from './supabase/functions/_shared/execution-canonical-reviews.ts';writeFileSync('.tmp/part1-reviews.json',JSON.stringify(reviews))"
python3 scripts/part1/extract-ledgers.py
node --import tsx scripts/part1/simulate.ts
```

All inputs required for this scorecard are committed. Rebuilding Friday evidence is optional and requires the original cached vendor archives at `../research-data/complementary` and the extracted native USDJPY archives at `.tmp/part1-broker`. Its script makes no network requests.

```sh
python3 scripts/part1/test-friday-closes.py
node --import tsx --test scripts/part1/test-simulation.ts
npm run test:part1
npm run lint
```

## Coverage limitation

The exact eight original windows are unchanged. All 16 configurations are available globally, but only 4–13 have full original test coverage for a particular window. JSON lists the missing configuration IDs per window. For example, the crypto pullback's early reviewed period begins in May 2025, so it cannot cover the April 2025 window; GBPUSD's saved tests end in August 2025, so they cannot cover 2026. These gaps pre-exist the five missing report files. Backfilling five missing reports cannot produce a genuine simultaneous all-16 test. No dates, zero-trade periods or profit figures were invented to claim otherwise.

Drawdown and returns are realized-close measurements; end-open trades remain unmarked. Replacement entries absent from the original account-admitted ledger cannot be reconstructed by this portfolio replay. Challenge days measure +8% then +5%, not a firm-specific certification or pass probability.
