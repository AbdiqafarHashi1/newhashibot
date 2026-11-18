# Native strategy integration — 18 November 2026

Six strategy families and a regime router now use HashiBot's existing TypeScript registry, scanner, confirmation, replay and account/prop paths. No additional Python service is required. The research implementations are adaptations of the supplied ideas, not replicas of promotional backtest claims.

## Results suitable for further demo evaluation

After the named-strategy confirmation repair, the hourly candidates below remained positive in both chronological periods and under 1.5x modeled costs.

| Candidate and reference history | Development closed / PF / stress PF | Later closed / PF / stress PF |
|---|---|---|
| ETH pullback, native Binance Spot reference | 48 / 1.509 / 1.388 | 52 / 1.177 / 1.053 |
| Gold pullback, Dukascopy paired bid/ask; fixed 3 bps profile | 41 / 1.156 / 1.123 | 32 / 1.422 / 1.393 |

Development: March–December 2025. Later period: January–October 2026. These calendars have been inspected; this is not an untouched holdout. Profit factor is net positive R divided by absolute net negative R, not an account-return percentage. Costs are modeled, including declared financing reserves, not verified customer fills. Spot-reference short signals assume an authorized derivative/short execution instrument; spot accounts cannot be assumed to short.

The broad basket failed. The native 15m comparison and 4h Donchian comparison are retained, including losing assets and periods. The existing MT5-only Gold evaluator rejected non-MT5 archive provenance in the production baseline; its zero selections are not proof that its trading rules failed. The new Gold candidate is a separate hourly evaluator.

Neither the requested daily participation nor fast prop passing, monthly fee coverage, all-regime coverage, or profitability across FX majors has been established. No paid-live readiness or guaranteed returns are claimed.

## Integration and repairs

- Six mathematical families, ten market-scoped definitions, long and short rules; ADX routing, volatility lock, fixed UTC session windows, closed HTF aggregation and explicit numerical TP2 brackets.
- ETH and Gold hourly profiles appear in the existing admin replay catalog. Their server-owned configurations retain existing account and release authorization.
- Confirmed native setups own their directional/regime confirmation rather than being vetoed by an unrelated second trend model. Freshness, known-news holds, costs, geometry, arbitration and account risk remain enforced.
- TP1 partial quantities and breakeven now affect the actual tracked lifecycle, including conservative collisions and adverse gaps, while preserving the original immutable stop and risk denominator.
- Fully observed native time-stop exits survive the replay-to-account path. A forward migration permits those closed exits in the existing measured-release checks; minimum sample and profitability requirements remain.
- Closed-session vendor carry-forward quotes are excluded from normalized research history. Gold's Sunday maintenance and complete market-session HTF aggregation are explicit. Calendar caching preserves the same schedule while bounding repeated work.

New strategy configuration rows default to disabled. A code push does not apply migrations, promote releases, connect providers, activate payments, send Telegram messages or place trades.

## Evidence

Primary receipts: `summary-final-hourly.json`, `summary-final-intraday.json`, `summary-final-spot-entry-ETHUSDT.json`, `summary-final-gold-entry-XAUUSD.json`, and `summary-gold-profile.json`, with corresponding compressed trade ledgers. The final hourly and intraday studies evaluate 120,759 and 42,560 chronological scanner cycles respectively.

Earlier diagnostic receipts and source snapshots retain the pre-repair comparisons. Their numbers must not be attributed to later source versions. The Gold profile cost replay reprices identical selected trades; it is not a second independent market sample. Repeated isolated/combined streams and mirrored unit fixtures must not be added as independent trades.

Public archive URLs, hashes and normalization exclusions are recorded separately. Raw archives remain in the research cache and are reproducible from acquisition scripts. Source snapshots can restore the exact earlier hashed files in an isolated checkout. Never overwrite a working checkout to reproduce an old receipt.

## Run

```sh
python scripts/research/complementary/acquire.py /path/hourly-cache
python scripts/research/complementary/acquire-intraday.py /path/hourly-cache
node --import tsx scripts/research/complementary/normalize-sessions.ts /path/hourly-cache /path/normalized-cache
node --import tsx scripts/research/complementary/study.ts /path/normalized-cache ALL scripts/research/complementary/protocol.json final-hourly
node --import tsx scripts/research/complementary/study.ts /path/normalized-cache ALL scripts/research/complementary/intraday-protocol.json final-intraday
npm run test:complementary
```

The Spot reference, entry-policy comparison, fixed Gold profile cost replay and rule-fixture builders are separate scripts in the same directory. Restore their recorded source version before reproducing an earlier receipt.

Validation completed: native strategy/lifecycle tests, both directions for all six families, request/profile isolation, an actual embedded PostgreSQL migration check, changed backend TypeScript checks, account-brain regression suites, forex/gold/framework regressions and scanner bundling. Broader worker regression completion is recorded separately; deployed database, authenticated browser, real provider fills and Telegram delivery were not tested in this pass.
