# Crypto channel participation and catalyst analysis — 28 October 2026

## Count strategies honestly

**Two promising families; zero newly launch-qualified strategies.** A positive historical model is not an activated scanner release. This change does not alter strategy promotion or enable a failed evaluator.

| Family | Scope and evidence | Participation | Concrete limitation |
|---|---|---|---|
| Daily EMA regime/trailing spot trend | Original BTC/ETH scope; 46 validation trades/PF1.995, later25/PF1.906 after26bps modeled costs | Slow long/cash swing role; later25 trades span638 days, about1.2 per month across both assets | Target-free daily lifecycle is not connected to the fixed-target scanner. Original sample gate and fresh forward evidence remain unresolved. No spot-to-perpetual transfer claim. |
| Altcoin relative strength | Existing frozen11-alt universe plus BTC reference; observed July–September diagnostic117/PF1.566, stress1.455 | Historical diagnostic average1.27 entries/day,47 zero-entry days and a10-day longest quiet streak | Not a daily quota or live forecast; project-observed data, losing assets, monthly state-reset limitation and release gates remain disclosed in the original report. |

There is **no measured combined result for these two families**. Their datasets, dates, exit policies and instruments differ. Adding their trade counts, averaging PFs or claiming combined daily frequency would be invalid. The separate four-role combined test lost (netPF0.838); that is not a result for the proposed two-family lineup.

The broader six-asset daily trend extension remains rejected, including SOL/XRP losses. An enlarged observation pool never expands production strategy eligibility by itself. Existing canonical symbol locks, arbitration and account authority remain unchanged.

## What is now connected for subscribers

The existing intelligence worker's watchlist update additionally constructs a source-backed catalyst/opportunity analysis section. It reuses existing intelligence persistence, feed-health inspection, editorial queue, multipart transport and Crypto-specific audience routing. It does not introduce a second scanner, signal publisher, trade strategy, LLM bill or cron.

1. **Exchange-scheduled opening:** official Binance USD-M metadata must report `PENDING_TRADING`, a valid USDT perpetual symbol and a future onboard timestamp within7days. The source provides the current exchange schedule, not announcement publication time, certainty of opening or a price prediction. Missing/conflicting evidence produces no card. This endpoint may not expose every future listing.
2. **Reported catalyst:** a recent normalized provider headline about listings, upgrades, mainnets, unlocks, airdrops, halvings, ETF or regulatory developments. HTTPS source, source name and publication timestamp are required. It remains a reported claim; article contents and event timing are explicitly unverified. No event date is invented from a headline, and no rumour is promoted into a scheduled listing.
3. **Observed momentum:** a mature trading contract with a fresh exchange24h ticker, at least25millionUSDT quote turnover,8–50% absolute24h movement and valid price geometry. This describes movement already underway. Turnover is a liquidity proxy, not measured order-book depth, volume acceleration, social sentiment or evidence of future gains. Positive and negative moves are analytical observations, not BUY/SELL instructions.

Cards contain observed/published/scheduled times where actually known, source link, facts, what to watch and risks. Human-facing times use12-hour EAT. No entry, target, position size, leverage or performance promise is generated. Existing canonical qualified signals remain the source of actionable trade alerts.

## Persistence, limits and recovery

- Exactly two additional bounded public GETs (exchange metadata and24h tickers), parallel,8second timeout,4MB response bound each; no authenticated account/order API. The existing older listing observation fetch is preserved.
- Up to2000 contract/ticker input rows,40 headlines and6 output cards. Conflicting metadata/ticker duplicates, stale/future ticks, unsupported instruments, thin turnover and malformed inputs are rejected.
- Observation clock is captured after receipt; the worker cannot backdate a fetched snapshot to imply it anticipated a move.
- Existing persisted `intelligence_events.metadata.opportunity_watch` supplies a24h seen-ID comparison. Unavailable/truncated comparison suppresses the section rather than pretending old opportunities are new. This comparison is not an independent atomic exactly-once delivery guarantee. Existing publication identities remain bounded by market/kind/time slot and uncertain transport outcomes keep their prior handling.
- Complete card/source health persists with the existing intelligence event and `intelligence_feed_results`. No schema migration is needed; `feed_type` is existing free text.
- Existing due slots remain unchanged:8am morning brief;10am/4pm watchlist;noon/6pm news;10pm wrap, all EAT. These are eligible slots, not promised posts. Invalid/missing market/news evidence can hold publication. Channel activity should come from useful evidence and transparent outcome journals, not forced trades or repeated missing-data filler.
- This patch activates no schedules, sends no Telegram message and configures no destination. Actual Supabase deployment, feed availability, chat identities and bot permissions still require verification. Crypto editorial resolves to `vip_crypto`; Forex/Gold to its separate audience under existing routing.

## Verification

Passed local: Release1 suites including the new catalyst test; Telegram and PhaseO tests; application/cloud typechecks; Edge discovery; production build; explicit new-module lint; affected Edge bundles and added-line whitespace/conflict checks. The connected test runs actual generation → injected concrete persistence → existing editorial projection/routing, plus replayed seen-ID suppression and comparison-read failure. No real external transport or provider order is invoked in tests.

The test covers pending-vs-trading status, unknown/invalid event time, contradictory metadata, stale/future/malformed/low-turnover tickers, source URL/timestamp screening, data-size/provider failures, EAT rendering, and absent signal/order writes. Injected DB/RPC tests are not deployed PostgreSQL/RLS or concurrency proof. Real catalyst observation/delivery and authenticated browser review are NOT_RUN for this patch. Published-head CI is reported separately.

## Forex can proceed alongside crypto research

Use the existing dedicated owner-controlled MT5/HashiBridge feed and Backtest Lab downloader/registration path. Initial review scope: EURUSD,GBPUSD,USDJPY andXAUUSD. Obtain genuine closed native candles and observed spread/bid-ask evidence with symbol mapping, requested/actual coverage and source hashes. Preserve the resumable30-day history commands and server registration; do not substitute customer execution accounts, invented spreads or silent research-provider fallback.

The available Forex cache is partial; Gold and native15m coverage are not established. Neither profitable Forex strategy counts nor channel cadence can be claimed from that missing input. This is a data prerequisite, not an excuse to postpone unrelated code. Release2 engineering/demo work remains separate from authorizing customer live execution.

Sources checked: [Binance contract status definitions](https://developers.binance.com/docs/derivatives/usds-margined-futures/common-definition), [exchange information and ticker documentation](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Exchange-Information). These document observation fields, not an exploitable return forecast. Historical strategy sources, exact protocols and caveats remain in `docs/research/spot-swing`, `docs/research/daily-specialists`, `docs/research/alt-connected` and `docs/research/crypto-team`.
