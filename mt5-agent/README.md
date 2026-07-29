# HashiBot MT5 Terminal Agent

Production-grade Python service that bridges local MetaTrader 5 (MT5) terminals to the HashiBot Cloud execution platform.

## Canonical launch contract

The sole worker entry point is `main.py`. From PowerShell:

```powershell
cd <repository>\mt5-agent
python main.py
```

Configuration deterministically loads `mt5-agent/.env` (or `MT5_ENV_FILE`). For
the first single-account, read-only certification, normal terminal attachment
(`MT5_PORTABLE=false`) is supported. Production multi-account hosts require one
isolated portable terminal/data directory and account-scoped worker per UUID.
NSSM starts the supervisor after boot; development never installs or starts it.

Prefer the restricted `MT5_BRIDGE_TOKEN`; the service-role key is a temporary
local-development fallback. MT5 credentials are decrypted only in the trusted
`mt5-bridge` function, delivered over outbound HTTPS, used in memory, and never
accepted in `.env` or process arguments.

---

## 🌟 Overview

The HashiBot MT5 Terminal Agent is an always-running CLI daemon designed to run alongside a MetaTrader 5 terminal on a Windows laptop or Windows VPS. It provides:

- **Terminal Communication**: Real-time interaction with MetaTrader 5 via the official `MetaTrader5` Python package.
- **Cloud Integration**: RESTful communication with HashiBot Supabase Edge Functions (`mt5-bridge`).
- **Heartbeat Daemon**: Continuous health reporting and terminal status tracking.
- **Command Queue Processing**: Low-latency polling, local execution, and acknowledgement of trading commands (`place_order`, `modify_position`, `close_position`, `cancel_order`, `test_connection`).
- **State Synchronization**: Continuous syncing of balance, equity, margin, free margin, floating PnL, open positions, and pending orders.
- **Symbol Specification Sync**: Automated broker specification synchronization (`mt5_symbol_specs`).
- **Reliability & Recovery**: Automatic reconnection with exponential backoff, network retry, and graceful signal handling.

---

## 📦 Directory Structure

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

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Operating System**: Windows 10/11 or Windows Server (2019/2022)
- **MetaTrader 5**: MT5 Terminal installed and logged into a Demo or Live account
- **Python**: Python 3.9+ installed and added to system PATH

### 2. Installation
Open PowerShell or Command Prompt in the `/mt5-agent` directory:

```powershell
# Create Python virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install required packages
pip install -r requirements.txt
```

### 3. Configuration
Copy `.env.example` to `.env` and fill in your configuration:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:
```env
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
BRIDGE_ID=bridge-mt5-001
POLL_INTERVAL_SECONDS=2.0
HEARTBEAT_INTERVAL_SECONDS=10.0
LOG_LEVEL=INFO
```

### 4. Running the Agent (CLI)
Ensure MetaTrader 5 terminal is open and running, then start the agent daemon:

```powershell
python main.py
```

Sample output:
```text
[2026-07-25 12:00:00] [INFO] [HashiBotMT5Agent] Starting HashiBot MT5 Terminal Agent Daemon
[2026-07-25 12:00:00] [INFO] [HashiBotMT5Agent] Bridge ID: bridge-mt5-001
[2026-07-25 12:00:01] [INFO] [HashiBotMT5Agent] Connected successfully to MT5 Account #12345678 (BrokerName - DemoServer)
[2026-07-25 12:00:02] [INFO] [HashiBotMT5Agent] [Heartbeat] Status 'online' reported for Bridge #bridge-mt5-001
```

---

## 🛠️ Windows Service Deployment (VPS)

To run the MT5 Agent as a background Windows Service on a VPS:

```powershell
# Run PowerShell as Administrator
.\install_service.ps1
```

To remove the service:
```powershell
.\uninstall_service.ps1
```

---

## 🔒 Security Best Practices
- Never commit `.env` or API keys to git repositories.
- Protect `SUPABASE_SERVICE_ROLE_KEY` as a secret variable.
- Keep the Windows VPS secured with firewall rules and restricted RDP access.
