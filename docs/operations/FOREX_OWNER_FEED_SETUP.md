# Dedicated owner Forex feed: scanner and real historical backtests

Use an ordinary Windows desktop/VPS that runs both your broker's MT5 terminal and this Python bridge. This is a separate owner data terminal, not a customer's execution account. The quote source is the broker connected to MT5; the production scanner does not fall back to Finnhub, Twelve Data or generated candles.

## Backend and admin setup

1. Restore the original Supabase project and deploy the checked migration/function release. Backend restoration is required before pairing the bridge; the VPS alone cannot replace it.
2. In Admin → MT5 → Accounts, add your own account with owner kind **System**, credential capability **Investor**, the real broker/server/login and its investor password. Leave execution disabled. An investor password reads market/account information without trading authority.
3. Assign its bridge using the existing bridge registration/credential workflow. Copy the backend-issued account ID, owner ID, credential reference, bridge ID and bridge token to the Windows runtime configuration. Do not put a Supabase service-role key on the VPS.
4. In Admin → MT5 → Settings → **Owner Forex scanner and backtest feed**, select that account, choose a feed identity and enable it. Customer execution terminals and master credentials are rejected. Enabling does not claim a working feed before observations arrive.
5. Configure the scanner Edge Function's `MT5_MARKET_DATA_FEED_ID` to this same identity. Keep the existing Forex scanner enable controls explicit.

## Windows runtime

Install your broker's MT5 terminal and sign in to the selected account with the investor password. Install Python with matching MetaTrader5 package support, then run from the repository's `mt5-agent` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```

Use the backend-issued values in the bridge environment file:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
BRIDGE_ID=YOUR_REGISTERED_BRIDGE
MT5_BRIDGE_TOKEN=YOUR_BACKEND_ISSUED_BRIDGE_TOKEN
MT5_ACCOUNT_ID=YOUR_OWNER_MT5_ACCOUNT_UUID
MT5_OWNER_ID=YOUR_ADMIN_USER_UUID
MT5_CREDENTIAL_REF=YOUR_STORED_CREDENTIAL_UUID
MT5_TERMINAL_PATH=C:\Program Files\YOUR_BROKER_MT5\terminal64.exe
MT5_DATA_ONLY=true
MT5_MARKET_DATA_FEED_ID=hashibot-owner-forex
```

Use the actual installation path and actual feed identity. Do not configure customer pairing or execution-account IDs on this dedicated runtime. Account credentials are retrieved through the authenticated bridge; the configuration file does not need the trading password. `MT5_DATA_ONLY=true` requires an investor credential, permits quote/history reads, skips execution account snapshots and independently rejects all trade-changing commands. A live-account investor login is allowed only for this explicit data-only mode; live customer execution remains prohibited.

Arrange supervised startup in your Windows environment, including restoring the interactive MT5 terminal session after a reboot. Disconnecting RDP and signing the Windows user out are different actions: signing out can stop desktop applications. Verify a reboot and broker reconnect before relying on this machine. The daemon recovers individual snapshot/cloud/stage failures and retries terminal connections; supervision must also handle machine/process failure.

## Verify before relying on it

- Confirm the feed identity and latest heartbeat in MT5 Settings. The publisher sends EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD and XAUUSD for 5m, 15m, 1h and 4h. Broker suffixes are resolved from real symbol metadata.
- Confirm the scanner records `mt5_hashibridge` lineage for that dedicated feed. Missing/stale quotes stop Forex admission; customer accounts and metered provider fallback are not substituted.
- In Backtest Lab → Data acquisition, select the owner feed and request a small known date range first. Then request the desired larger historical window. The actual `FETCH_HISTORY` queue calls MT5 `copy_rates_range`; UTC dates, broker symbol, spread/volume and source provenance are retained.
- MT5/brokers limit available history. Set the terminal's chart-history capacity appropriately and allow history to download. A request for two years does not guarantee two years are available. Missing bars must remain a visible acquisition/coverage failure, never invented prices.
- Historical downloads can remain available while the market is closed and the quote feed is marked stale, provided the bridge is online. Live scanner admission still requires fresh quotes/candles.
- Test network loss, terminal restart and VPS reboot. Confirm stale state while disconnected and resumption with the same owner feed after reconnection.

The path removes a per-request Forex-data API credit dependency. It cannot promise uninterrupted delivery: market closures, broker maintenance, history retention, network/VPS failures and the original backend's availability still apply. No real Windows terminal, VPS, broker feed or historical download was connected during repository tests.

Reference: https://www.mql5.com/en/docs/python_metatrader5/mt5copyratesrange_py documents the UTC date requirements and terminal chart-history limits.

## Customer MT5 execution is separate

The owner investor feed never executes. The current automatic customer execution path requires a **hedging demo account** so TP1 and TP2 can be native protected child positions. Netting and live accounts are rejected. Update the Python bridge together with the deployed functions so the hedging flag and canonical child payload agree.

A single approved plan queues once, preserving the total authorized quantity across its two legs. Each native leg carries SL and its own TP. The worker keeps an atomic per-account journal under `HASHIBOT_STATE_DIR` (default `hashibot-state` in the worker directory). Retain that directory across worker restarts and deployments; do not delete it to retry an uncertain submission. An uncertain or incomplete entry requires reconciliation rather than repeating orders. The source account, server and demo status are checked again for ongoing management.

Native TP1 deals, matched to the exact first position, allow the runner's SL to move to its observed entry. A stronger existing stop is retained. Missing protection is repaired; a protection incident lasting over 30 seconds requests closing that exact position. A close request or modification ACK does not prove the provider result. TP2 and ordinary stop/manual exits are classified separately from actual deal history. Windows terminal behavior, partial fills, outages and provider receipts still need connected demo certification before any release.

## Prop economic-calendar evidence

Prop's default policy blocks entries when economic-calendar evidence is unknown. Python's MT5 interface does not supply calendar events directly. The repository includes the read-only `mt5-agent/mql5/HashiCalendar.mq5` exporter: copy it to the customer terminal's `MQL5/Experts`, compile with MetaEditor and attach it to one chart in that same terminal. It contains no trading calls. Set `MT5_NEWS_CONTEXT_PATH` to its `Terminal/Common/Files/hashibot-calendar-<login>.json` output. This native MQL5 component still requires compilation and connected verification on the Windows VPS; no Windows compiler is available in the development container.

The exporter queries the MT5 economic calendar in trade-server time, publishes a UTC observation time, covers USD/EUR/GBP/JPY/AUD/CAD/CHF, and conservatively blocks high-impact events within 30 minutes on either side. High-impact events without an exact time block conservatively for the queried day. A disconnected terminal, failed/partial calendar query, stale file or mismatched login/server cannot clear news risk. The bridge accepts clear status only from that account's complete fresh evidence. This is economic-calendar coverage, not a guarantee against unscheduled news or data outages. Market prices/candles continue to come directly from MT5.
