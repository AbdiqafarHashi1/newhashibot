# HASHIBOT — MT5 TERMINAL AGENT IMPLEMENTATION REPORT (PHASE 8C-1)

**Audit & Implementation Date:** July 2026  
**Target Component:** HashiBot MetaTrader 5 Terminal Agent (`/mt5-agent/`)  
**Repository Location:** `/mt5-agent/`  
**Status:** Certified Evidence-Based Implementation  

---

## EXECUTIVE SUMMARY

This report documents the design, architecture, file structure, execution flows, and deployment instructions for the terminal-side **HashiBot MT5 Agent** implemented in Phase 8C-1.

The agent is an always-running Python CLI service that bridges a local or VPS-hosted MetaTrader 5 terminal to HashiBot's existing cloud infrastructure (`mt5-bridge` Edge Function, `mt5_commands`, `mt5_bridge_registry`, `mt5_account_snapshots`, and `mt5_symbol_specs`).

---

## 1. ARCHITECTURE & OVERVIEW

```
┌──────────────────────────────────────────────────────────────────┐
│                      MetaTrader 5 Terminal                       │
│                       (Windows Host / VPS)                       │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ Official MetaTrader5 Python API
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      HashiBot MT5 Agent                          │
│                      (Python CLI Daemon)                         │
│                                                                  │
│  ├── Heartbeat Manager    ├── State Sync Manager                 │
│  ├── Command Processor    └── Symbol Spec Sync Manager           │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ HTTPS REST (Authorization: Bearer ServiceRoleKey)
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   HashiBot Cloud Infrastructure                  │
│                                                                  │
│  ├── mt5-bridge Edge Function (/functions/v1/mt5-bridge)         │
│  ├── mt5_bridge_registry Table                                   │
│  ├── mt5_commands Table / Queue                                  │
│  ├── mt5_account_snapshots Table                                 │
│  └── mt5_symbol_specs Table                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. DIRECTORY STRUCTURE

The agent is located entirely inside the active application repository at `/mt5-agent/`:

```
/mt5-agent/
├── main.py                   # Main daemon entrypoint and event loop
├── config.py                 # Environment variable loader & validation
├── mt5_client.py             # MetaTrader 5 API wrapper and order executor
├── cloud_client.py           # Supabase REST client for heartbeat, polling, & state sync
├── heartbeat.py              # Heartbeat reporting manager
├── command_processor.py      # Command polling, execution, and acknowledgement
├── state_sync.py             # Account balance, equity, and position snapshot sync
├── symbol_sync.py            # Broker symbol specification synchronization
├── logging_config.py         # Structured logging setup
├── install_service.ps1       # Windows Background Service installer (PowerShell)
├── uninstall_service.ps1     # Windows Background Service uninstaller (PowerShell)
├── requirements.txt          # Python package dependencies
├── .env.example              # Environment variables template
└── README.md                 # Agent documentation
```

---

## 3. DEPENDENCIES & REQUIREMENTS

Defined in `/mt5-agent/requirements.txt`:
```text
MetaTrader5>=5.0.45; platform_system == "Windows"
requests>=2.31.0
python-dotenv>=1.0.1
```

---

## 4. CONFIGURATION & ENVIRONMENT VARIABLES

Configuration is managed in `/mt5-agent/config.py` using environment variables loaded from `.env`:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | String | *Required* | Base URL of the Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | String | *Required* | Supabase Service Role API key |
| `BRIDGE_ID` | String | `bridge-mt5-001` | Unique bridge identifier matching `mt5_bridge_registry` |
| `POLL_INTERVAL_SECONDS` | Float | `2.0` | Command polling interval in seconds |
| `HEARTBEAT_INTERVAL_SECONDS` | Float | `10.0` | Heartbeat dispatch interval in seconds |
| `STATE_SYNC_INTERVAL_SECONDS` | Float | `5.0` | Account state & position sync interval in seconds |
| `SYMBOL_SYNC_INTERVAL_SECONDS` | Float | `300.0` | Broker symbol specification sync interval in seconds |
| `LOG_LEVEL` | String | `INFO` | Console logging level (`DEBUG`, `INFO`, `WARN`, `ERROR`) |
| `MT5_TERMINAL_PATH` | String | *Optional* | Path to `terminal64.exe` executable |
| `ACCOUNT_NUMBER` | Integer | *Optional* | MT5 account login number for auto-login |
| `PASSWORD` | String | *Optional* | MT5 account password for auto-login |
| `SERVER` | String | *Optional* | MT5 broker server name |

---

## 5. CORE EXECUTION FLOWS

### A. Heartbeat Flow
1. `HeartbeatManager.send_heartbeat()` queries `MT5Client` for terminal connectivity and account metadata.
2. Formats connection payload including hostname, MT5 connection status, account number, broker, server, terminal build, and supported capabilities.
3. Issues HTTP POST to `/functions/v1/mt5-bridge?action=heartbeat`.
4. Edge function upserts registry row in `mt5_bridge_registry`.

### B. Command Polling Flow
1. `CommandProcessor.process_pending_commands()` triggers `CloudClient.poll_commands()`.
2. Issues HTTP POST to `/functions/v1/mt5-bridge?action=poll_commands`.
3. Edge function claims pending commands for `BRIDGE_ID` in `mt5_commands_queue` and returns command payload.

### C. Command Execution & Acknowledgement Flow
1. `CommandProcessor` evaluates command `operation`:
   - `place_order` / `place_entry` ➔ calls `MT5Client.place_order(payload)`
   - `modify_position` ➔ calls `MT5Client.modify_position(ticket, sl, tp)`
   - `close_position` ➔ calls `MT5Client.close_position(ticket, volume)`
   - `cancel_order` ➔ calls `MT5Client.cancel_order(ticket)`
   - `test_connection` ➔ checks MT5 terminal health
2. `MT5Client` sends the order or request to MetaTrader 5 terminal via `mt5.order_send()`.
3. Only after MT5 terminal execution completes, `CommandProcessor` invokes `CloudClient.ack_command()`.
4. Edge function updates command status to `ack` (or `failed`) with execution result, deal ticket, and execution timestamp.

### D. Account & Symbol Synchronization Flow
1. **Account State Sync**: `StateSyncManager` fetches balance, equity, margin, free margin, unrealized PnL, and open positions from MT5 every 5s and posts to `/functions/v1/mt5-bridge?action=sync_state`.
2. **Symbol Spec Sync**: `SymbolSyncManager` collects broker symbol specs (`digits`, `point`, `contract_size`, `volume_min`, `volume_max`, `volume_step`, `stops_level_points`) and merges into `mt5_symbol_specs`.

---

## 6. RECOVERY & RELIABILITY BEHAVIOR

- **Automatic Reconnection**: If the MT5 terminal connection drops, `MT5AgentDaemon` automatically retries initialization using exponential backoff (starting at 2s up to 60s cap).
- **Graceful Shutdown**: Intercepts `SIGINT` (Ctrl+C) and `SIGTERM` signals, dispatches an `offline` heartbeat notification to the cloud registry, and closes connections cleanly.
- **Network Retry**: Network requests to the cloud edge functions catch network exceptions gracefully without crashing the main event loop.

---

## 7. STARTUP COMMAND & VERIFICATION

On Windows:

```powershell
cd mt5-agent
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python main.py
```

---

## 8. KNOWN LIMITATIONS & FUTURE VPS DEPLOYMENT

1. **Operating System Requirement**: MetaTrader 5 Python SDK (`MetaTrader5`) is only natively supported on Windows operating systems (Windows 10/11 or Windows Server). On non-Windows platforms, `MT5Client` operates in safe offline/mock mode.
2. **VPS Deployment**:
   - Deploy on a Windows Server VPS (e.g. AWS, ForexVPS, Vultr Windows Server).
   - Install MetaTrader 5 terminal and keep it open or configured as a service.
   - Run `.\install_service.ps1` using PowerShell as Administrator to register `HashiBotMT5Agent` as an auto-starting Windows service.

---

## 9. CONCLUSION

Phase 8C-1 is complete. The MT5 Terminal Agent is fully implemented in the active repository at `/mt5-agent/`, adheres strictly to existing HashiBot cloud contracts, and is ready for local development testing or Windows VPS deployment.
