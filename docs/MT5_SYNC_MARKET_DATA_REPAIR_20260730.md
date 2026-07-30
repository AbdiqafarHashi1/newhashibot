# MT5 Sync/Test and market-data repair — 2026-07-30

## Scope and safety

Account `59426a76-8b0e-4587-86dd-0ddb34129b23` and bridge `bridge-mt5-local-01` were audited from the supplied production observations and repository contracts. No execution setting, scanner cron, Personal/Prop mode, credential capability, certification row, or order was manually changed.

## Root causes

1. **Sync/Test enqueue failed before polling.** `mt5-accounts` validated the browser JWT, then invoked `enqueue_mt5_command` with its service-role client. The RPC deliberately resolves ownership with `auth.uid()`, which is null for that call, and raised `mt5_account_not_found`. The generic database wrapper surfaced this as `MT5_DATABASE_TEST_CONNECTION_FAILED`. The repaired function invokes the one canonical RPC with the already validated caller JWT. The route and action remain `mt5-accounts` / `test_connection`, mapping exactly to `TEST_CONNECTION`.
2. **Market data was extracted but never scheduled.** Tick/candle extraction and the `publish_market_data` cloud client existed, but the daemon loop never called either. A periodic publisher now extracts all six required symbols and four scanner timeframes and publishes one validated batch. Missing ticks, symbols, or candles reject the batch; no Twelve Data or fabricated fallback exists.
3. **Credential capability could not advance from runtime proof.** The bridge persisted `trade_permission` but never applied that verified terminal evidence to `credential_capability`. The repaired snapshot handler promotes to `master` only when the authenticated terminal reports account trade permission. Stored credential declarations alone still cannot promote capability.
4. **`terminal_autotrading` interpretation.** The Python API maps `terminal_info().trade_allowed`, which represents the terminal's Algo Trading permission. Therefore a false value with account-level `trade_permission=true` indicates the MT5 terminal Algo Trading toggle/restriction is off, not that account trade permission was misread.
5. **Dashboard truth was conflated.** A connected account was labeled “Ready for Execution.” Bridge connectivity, terminal authentication, fresh market data, command-path certification, and execution enablement now render independently.

## Deployment and runtime verification

- **Migration required:** yes — apply `20260730000000_mt5_sync_market_publication_repair.sql` for owner/admin read policies on durable market/certification truth.
- **Edge Functions to redeploy:** `mt5-accounts`, `mt5-bridge`, and `market-scanner` (the scanner source already uses `MT5MarketDataProvider`; redeploy it to ensure production matches this repository).
- **Bridge update/restart:** deploy the complete `mt5-agent` directory and restart the Windows service so the new market-data loop runs.
- **Frontend:** rebuild/redeploy for detailed Sync/Test results and separated truth states.

Repository checks prove the contracts, but this environment has no Supabase access token, operator JWT, Windows MT5 terminal, or bridge token. Consequently it cannot safely deploy or manufacture connected-runtime evidence. After deployment, one authenticated Sync/Test click must produce one `received` row; the bridge must claim it as `accepted`, execute the read-only probe, acknowledge it as `confirmed` or `rejected`, and automatically write command-path PASS/FAIL evidence from that acknowledgement. Market certification is likewise written only after a successfully persisted six-symbol batch.

### Final observed production state available to this audit

| Evidence | Value |
| --- | --- |
| `mt5_commands` final row | none (0 rows, supplied pre-repair observation) |
| `mt5_market_data_latest` | 0 rows (supplied pre-repair observation) |
| `mt5_market_candles` | 0 rows (supplied pre-repair observation) |
| certification | `NOT_RUN` (supplied pre-repair observation) |

These are intentionally not relabeled PASS. Remaining blockers are migration/function/frontend deployment, bridge restart, an authenticated operator click, an open broker feed with all required symbols/timeframes, and observation of the resulting durable rows. Keep Forex scanning and execution disabled until those observations pass freshness validation.
