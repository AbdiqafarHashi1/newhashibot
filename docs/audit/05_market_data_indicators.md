# 05 Market Data and Indicators Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- V1 uses Edge Functions and provider HTTP calls for scanner operation. It has candles tables and provider_status, but not a standalone Candle Engine. Classification: REWRITE.
- Indicators appear embedded in scanner logic rather than a shared indicator engine. Classification: REWRITE with reference extraction.
- Forex data relies on TwelveData/Finnhub-style providers and diagnostics; V2 forex production path must include MT5 Bridge feed.

## V2 target
- One market data engine per market, WebSocket first for crypto, MT5 Bridge feed for forex.
- Candle engine normalizes feeds into one OHLCV contract.
- Shared indicator engine computes once per symbol/timeframe and serves strategy cache reads.
