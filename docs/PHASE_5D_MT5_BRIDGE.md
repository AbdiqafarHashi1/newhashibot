# Phase 5D — multi-account MT5 bridge runbook

## Audit and deployment decision

The active root runtime was retained. `mt5_accounts_safe`, the Phase 8A account/snapshot/command schema, the `mt5-accounts` and `mt5-bridge` Edge Functions, provider adapter, Protection Engine, MT5 operations workspace, and Windows Python agent are **REUSE / REPAIR**. The single-account daemon, permissive connection truth, command lifecycle, onboarding classifications, policy/gates, and service isolation were **REPAIR**. A multi-account supervisor, structured account policy, complete gate, protection truth, and canonical health function were **MISSING** and are supplied here. The abandoned `/v2` tree is not used.

MetaTrader 5 cannot run in Netlify or a Supabase Edge Function. Each account needs a dedicated installed terminal/data directory on a persistent Windows 10/11 or Windows Server 2019/2022 VPS. Python and the official `MetaTrader5` package run on that host. `BridgeManager` starts exactly one worker per canonical account UUID; each receives its own owner, broker/server/login, opaque credential reference, terminal path, data path, bridge identity, process and lock. Supabase is the durable control plane.

## Exact Windows/VPS installation

1. Run `supabase db push`, deploy `mt5-accounts` and `mt5-bridge`, and set `MT5_CREDENTIAL_ENCRYPTION_KEY` as an Edge secret.
2. Provision a non-admin Windows service identity, enable BitLocker, patch Windows, install 64-bit Python 3.11 and MT5, and clone to `C:\HashiBot`.
3. For every account install a separate broker terminal under `C:\HashiBot\terminals\<account-uuid>` and launch once with `/portable`; never reuse its data directory.
4. Run `py -3.11 -m venv C:\HashiBot\venv` and `C:\HashiBot\venv\Scripts\pip install -r C:\HashiBot\mt5-agent\requirements.txt`.
5. Register in the UI, using Investor capability for read-only certification. The backend generates UUID and credential reference.
6. Copy `.env.example` to `.env`, ACL it to the service identity, and configure variables below. Store the bridge secret with Windows Credential Manager/DPAPI, never source control.
7. Install the manager with NSSM as `HashiBotMT5Manager`: automatic delayed start, `AppDirectory=C:\HashiBot\mt5-agent`, rotating output, restart after 5 seconds, reset failure count after one day.
8. Reboot and prove recovery, one process per UUID, fresh scoped heartbeat/snapshot, and no replay of confirmed idempotency keys.

Required environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (prefer a restricted bridge token), `BRIDGE_ID`, `MT5_ACCOUNT_ID`, `MT5_OWNER_ID`, `MT5_CREDENTIAL_REF`, `MT5_TERMINAL_PATH`, `MT5_TERMINAL_DATA_PATH`, `ACCOUNT_NUMBER`, `SERVER`, poll/heartbeat/state/symbol intervals, and `LOG_LEVEL`. `ALLOW_OFFLINE_TEST_MODE` must be false outside tests. A password may exist only transiently after authenticated retrieval; it must not be logged or persisted in ordinary files/tables.

## Firewall, process management, and recovery

Allow outbound TCP 443 to Supabase and broker-required endpoints. Deny public inbound bridge traffic. Restrict RDP 3389 to a VPN/bastion allow-list with MFA and NLA. Isolate terminal executables to required broker destinations. Expose no database port and configure no cron.

NSSM restarts the manager; the manager restarts failed workers. Database account/idempotency uniqueness and per-account locks prevent duplication. A heartbeat proves process reachability only. `CONNECTED` follows verified login and read probes. Health is timestamp-derived: HEALTHY (≤30s), STALE (>30s), OFFLINE (>2m), AUTH FAILED, or NOT CONFIGURED.

## One-account Demo read-only verification (steps 1–2)

- Use a disposable Demo login and Investor password; execution remains disabled.
- Start its isolated terminal/worker and confirm persisted heartbeat.
- Run `verify_connection`; require initialization, server/login and returned identity, broker/server, name/currency, balances/margin, positions, orders, 30-day history, trade permission and AutoTrading reads.
- Re-read the exact canonical row and match owner, UUID, broker, server, masked login, Demo class, capability, policy and disabled execution; refetch UI.
- Confirm snapshot/heartbeat references only that UUID and becomes STALE/OFFLINE during interruption.
- Restart worker, terminal and VPS separately; prove stable mapping, no credential re-entry, one worker, and no reclaim of confirmed commands.
- Queue sync and protection commands. Sync is read-only; every mutation must reject with `MT5_EXECUTION_DISABLED` or `MT5_INVESTOR_ONLY`. Confirm no deal/order appeared.

## Later controlled Demo execution checklist (not authorized now)

Obtain written authorization; install a Demo Master credential; record baseline orders/deals; resolve all gate, policy/allocation, drawdown and kill-switch inputs; explicitly adopt only this Demo UUID; enqueue one minimum-lot expiring idempotent order with SL/TP; require broker/protection confirmation; repeat its key to prove no duplicate; test partial close/breakeven/final close; disable adoption and emergency-stop; reconcile tickets. Never use Personal or Prop live accounts.

No disposable credentials or Windows host were supplied here, so real Demo connection, authentication, heartbeat and restart certification are **NOT DEPLOYED**, not falsely passed. SQL and host deployment are required.
