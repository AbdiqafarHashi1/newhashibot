# Phase 7 — Professional Forex Signal Engine

## Repository audit and reuse decision

Phase 7 remains inside the ROOT scanner. The existing `market-scanner` scheduling, canonical `signals`/`signal_updates` truth, shared arbitrator, risk profiles, provider status, reporting views, customer packages, and Telegram router are reused. No Forex scheduler, arbitrator, Telegram sender, reporting store, execution worker, or signal truth table was added.

| Area | Finding | Decision |
|---|---|---|
| Provider | Twelve Data historical/live time-series and price calls already existed inline with rate limiting and status logging. | Keep Twelve Data authoritative; add a provider contract, retry/timeout, normalized candles, gaps/staleness diagnostics for gradual scanner extraction. |
| Instruments | Six instruments existed, only three production-enabled. | Expand the typed registry to the ten Phase 7 instruments with pip, precision, sessions, volatility, spreads, risk, hours and category. |
| Sessions | London/New York/DST/weekends existed. | Add Sydney, Tokyo, overlaps, weekly close and caller-injected holiday awareness. Normalize provider timestamps to UTC. |
| Indicators | ROOT EMA/ATR/RSI engine already feeds Forex. | Reuse unchanged. |
| Strategies | Two enabled legacy Forex strategies and four deterministic research strategies existed. | Retain enabled strategies; retain research strategies in shadow until forward certification. Their independent gates cover scalping/continuation, London breakout, NY continuation, trend pullback and gold volatility breakout. |
| Arbitrator | Pure shared arbitrator already accepts crypto and Forex candidates. | Reuse unchanged; one winner or `NO_TRADE` per symbol/timeframe. |
| Risk/capital | Canonical risk profiles, exposure/daily/drawdown gates and capital ownership exist. | Add only pip-value/lot conversion adapter; ROOT remains responsible for permission and portfolio limits. No MT5 execution. |
| Signals | Canonical signal rows already flow through lifecycle and publication. | Add a strict Forex qualification contract requiring price structure, TP1/TP2, optional TP3, RR, evidence, session, regime, expiry, quality and invalidation. |
| Telegram/products | Shared router already maps lifecycle events to free/VIP/admin and packages include Forex products. | Reuse unchanged; reporting stays upstream of Telegram. |
| Reporting/admin | Canonical analytics views and provider/scanner/strategy/signal pages exist. | Add canonical Forex reporting index and provider/instrument metadata; existing pages consume these truths. |
| Storage | Canonical compact persistence flags and retention policy exist. | No candle or signal truth duplication; add partial/query indexes only. |

## Operational architecture

`scheduled-market-scanner → market-scanner → authoritative Twelve Data adapter → UTC closed candles → ROOT indicators → Forex strategies → professional registry → ROOT arbitrator → ROOT risk/capital gates → canonical signals → shared Telegram/reporting/lifecycle`.

Provider failures, malformed responses, stale candles, missing intervals, exhausted retry, closed sessions, holidays, excessive spread, weak evidence and insufficient RR degrade to `NO_TRADE`; synthetic data is never substituted. Provider diagnostics expose attempts, latency, candle count, gaps, staleness and error state. The provider interface permits future adapters without changing scanner consumers.

## Strategy and signal certification policy

Enabled legacy Forex strategies remain the production baseline. London breakout, New York continuation, trend pullback and gold breakout remain explicitly `RESEARCH`/`SHADOW`; this is deliberate professional gating rather than unverified publication. Promotion requires replay, forward-paper sample, session/instrument breakdown, profit factor, drawdown and publication review. A publishable signal requires direction, entry, SL, TP1, TP2, optional TP3, RR ≥ 1.5, confidence and quality ≥ 70, at least three evidence items, eligible session, future expiry, regime and textual invalidation.

## Deployment

1. Apply migrations through `20260722000000_023_phase7_forex_engine.sql`.
2. Set `TWELVEDATA_API_KEY`, retain `FOREX_DATA_PROVIDER=twelvedata`, and configure provider budgets/rate limits.
3. Deploy the existing edge functions; do not create a second scanner schedule.
4. Enable desired canonical symbol rows and `scanner_config.scan_forex_enabled`/`SIGNAL_ENABLE_FOREX` only after provider diagnostics pass.
5. Verify Provider Health, Scanner Status, Candidates, Signals, Telegram Logs, Performance and Outcome Tracking in the existing admin application.
6. Run the Phase 7 test, recovery/regression suites, typecheck, build and edge checks. Perform live-key/manual holiday-feed checks in staging.

## Certification boundary and external evidence

Repository implementation is complete for the registry, session engine, provider abstraction/diagnostics, quality contract, risk conversion, canonical storage integration and automated certification. Production operational certification still requires a valid Twelve Data key, deployed migration/functions, current holiday dates supplied by operations, forward-market candle/gap observations, Telegram chat credentials, and statistically sufficient paper outcomes. These are deployment-state blockers, not reasons to fork infrastructure.

MT5 is intentionally not implemented. The stable instrument IDs, precision, pip sizing, canonical approved signals and ROOT execution ownership are the compatibility seam for Phase 8.

## Phase status

**Phase 7 — Professional Forex Signal Engine is COMPLETE at the repository implementation boundary.** Proceed directly to **Phase 8 — MT5 Personal & Prop Execution Platform** after staging/operational evidence is signed off.
