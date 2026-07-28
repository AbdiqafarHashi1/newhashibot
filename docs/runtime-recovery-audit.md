# HashiBot runtime recovery audit

## Operational wiring

All Mission Control commands use one authenticated path:

`MissionControl button -> runCommand -> callEdgeFunction -> POST /functions/v1/admin-operator-action -> verifyAdmin -> runAction -> database update and/or internal Edge Function -> JSON receipt -> telemetry refresh`

| Control | Backend operation | Terminal runtime target | Response/refresh |
| --- | --- | --- | --- |
| Start HashiBot | Updates `execution_settings`, `scanner_config`, and provider controls, then invokes a scan | `scheduled-market-scanner` | Start now fails if a database write or initial scan fails; UI refreshes truth |
| Stop New Activity | Pauses settings, scanner, and provider entries | Database-backed consumers observe the gates | Action receipt, then truth refresh |
| Emergency Stop | Enables kill switch and disables scanner/provider entry | Database-backed consumers observe the gates | Confirmed action receipt, then truth refresh |
| Full System Test | Reads live contracts and calls Binance/Bybit proofs | Provider execution functions | Per-check PASS/WARNING/FAIL/BLOCKED report |
| Runtime mode/status | Reads `execution_settings` | Runtime consumers of execution settings | ACTIVE, PAUSED, EMERGENCY STOP, NOT CONFIGURED, or UNKNOWN |
| Scanner controls | Updates `scanner_config` or invokes a scan | `scheduled-market-scanner` | Action receipt, then scanner truth refresh |
| Provider controls | Updates one `execution_provider_controls` row (and MT5 account state where applicable) | Selected provider consumer | Action receipt, then provider truth refresh |
| Protection/recovery | Invokes proof, reconciliation, or repair action | Binance/Bybit execution functions | Backend result/explicit blocker, then truth refresh |

There is no RPC hop in the current Mission Control command path. The previous diagnostic text claiming an RPC was verified was therefore inaccurate; it now reports only the Edge Function router that it actually exercises.

## Repaired stop points

1. Lifecycle and account-control database errors were previously ignored, allowing a successful receipt after a failed write. Every affected mutation now throws its exact operation and database error.
2. Start previously returned success even when its initial scanner invocation failed. Its result now follows the scanner invocation result.
3. Recovery requires backend confirmation, but the UI did not send it. Recovery is now included in the confirmed high-risk action set.
4. Truth-source read errors previously became empty arrays, which looked like healthy zero counts. The loader now preserves errors by source and loads `execution_settings` for real runtime state.
5. Mission Control previously displayed fabricated defaults (`ACTIVE / CERTIFIED`, `ALL HEALTHY`, a default environment, a default scan interval, and an active monitor without evidence). These now derive from records or display `UNKNOWN`/`NOT CONFIGURED`/degraded states.
6. The full-system test previously asserted untested market feeds, MT5, monitoring, and canonical writes as PASS. It now uses database/heartbeat evidence, invokes real Binance and Bybit proof routes, and marks unexercised market data BLOCKED.

## Provider/runtime evidence status

| Area | Static wiring | Live deployment evidence in this recovery environment |
| --- | --- | --- |
| Binance | Wired to execution proof and monitor functions | UNKNOWN — no deployment credentials/runtime logs available |
| Bybit | Wired to execution proof and monitor functions | UNKNOWN — no deployment credentials/runtime logs available |
| MT5 / Forex | Reads active account heartbeat; controls update MT5 account state | NOT CONFIGURED/UNKNOWN until an agent heartbeat exists |
| Telegram | Reads the delivery ledger; test routes to `telegram-test` | UNKNOWN when there is no delivery evidence |
| Scanner | Wired to `scheduled-market-scanner` and `scanner_config` | UNKNOWN until live telemetry is loaded |
| Reporting | Reads canonical events and runtime truth projections | UNKNOWN until live telemetry is loaded |
| Recovery/protection | Wired to execution repair/proof routes | UNKNOWN until a live action receipt is returned |

## Schema decision

No SQL is introduced by this recovery. The referenced `execution_settings`, `scanner_config`, `execution_provider_controls`, and `operator_runtime_events` contracts already have repository migrations (classification **A: already exists, no SQL needed**). A remote deployment mismatch, if the truthful diagnostics expose one, is classification **B** and should be resolved by applying the existing migration rather than creating a speculative replacement.

- NEW MIGRATION REQUIRED: **NO**
- EXISTING MIGRATION APPLICATION REQUIRED: **UNKNOWN — remote database access unavailable**
- CODE/WIRING FIX ONLY: **YES for the locally proven defects; remote contract state remains unverified**

## Controlled-testing decision

The code path is **not yet certified for controlled operation**. This environment contains the public project identity and anon client configuration, but no Supabase management access token, admin session, database credential, provider credential, or runtime-log access. Direct HTTPS access to the project was also rejected by the execution environment's network tunnel. Consequently deployment identity, remote function versions, cron state, two-cycle evidence, and scan-to-close evidence are all **ACCESS UNAVAILABLE**, not PASS. Production/live trading is **not certified**.

Final verdicts until a deployment-capable session performs the required observation window:

- MISSION CONTROL FULLY OPERATIONAL: **NO — ACCESS UNAVAILABLE**
- SCHEDULED RUNTIME OPERATIONAL: **NO — ACCESS UNAVAILABLE**
- CRYPTO SCAN-TO-CLOSE CERTIFIED: **NO**
- FOREX SCAN-TO-CLOSE CERTIFIED: **NO — BLOCKED BY MT5 SETUP AND ACCESS**
- BINANCE TESTNET CERTIFIED: **NO**
- BYBIT DEMO CERTIFIED: **NO**
- MT5 PERSONAL DEMO CERTIFIED: **NOT CONFIGURED / UNVERIFIED**
- MT5 PROP DEMO CERTIFIED: **NOT CONFIGURED / UNVERIFIED**
- READY FOR CONTINUOUS NON-PRODUCTION OPERATION: **NO**
- READY FOR PRODUCTION OR LIVE MONEY: **NO**
