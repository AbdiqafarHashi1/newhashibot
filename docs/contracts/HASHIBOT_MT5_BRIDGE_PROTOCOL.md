# HASHIBOT MT5 BRIDGE PROTOCOL CONTRACT

**Version:** 1.0.0  
**Status:** CANONICAL CONTRACT  
**Scope:** HashiBot Cloud Edge Gateway (`/functions/v1/mt5-bridge`) <-> MT5 Terminal Agent (`/mt5-agent/`)

---

## 1. Overview & Architecture

The HashiBot MT5 Bridge Protocol provides a secure, deterministic, real-time command-and-control bridge between HashiBot's Cloud Execution Router and locally running MetaTrader 5 (MT5) terminal agents.

### Core Architecture Rules
1. **Immutable Execution Hierarchy:** Downstream of the unified HashiBot Scanner, Strategy Framework, Arbitrator, Risk Engine, and Execution Router.
2. **Gateway Bottleneck:** All communication between MT5 agents and cloud services MUST flow through the edge function gateway `/functions/v1/mt5-bridge`. Direct DB connections from agents are forbidden.
3. **Pull Model (Claim/Ack):** Agents pull commands from the cloud via atomic polling. No exposed inbound agent HTTP ports required.
4. **Idempotent Operations:** All commands carry unique `idempotency_key`s to ensure zero duplicate order execution under network retries or daemon restarts.

---

## 2. Authentication & Security Boundary

Every request from the agent to `/functions/v1/mt5-bridge` MUST include:
- `Authorization`: `Bearer <SUPABASE_SERVICE_ROLE_KEY>` or `<MT5_BRIDGE_SECRET>`
- `Content-Type`: `application/json`

Each request payload MUST contain `bridge_id`, identifying the registered bridge instance in `public.mt5_bridge_registry`.

---

## 3. Endpoints & Protocol Actions

All protocol interactions use standard POST requests to `https://<PROJECT_REF>.supabase.co/functions/v1/mt5-bridge?action=<ACTION>`.

---

### Action 1: `heartbeat`

Agents emit periodic heartbeats (default every 10 seconds) to advertise health and active connection status.

#### Request (`POST ?action=heartbeat`)
```json
{
  "bridge_id": "bridge-desktop-01",
  "status": "online",
  "ip_address": "192.168.1.100",
  "connection_info": {
    "agent_version": "1.0.0",
    "python_version": "3.11.4",
    "mt5_connected": true,
    "mt5_version": [500, 3810, "20 Jun 2023"],
    "terminal_company": "MetaQuotes Ltd.",
    "terminal_name": "MetaTrader 5"
  }
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "registry": {
    "bridge_id": "bridge-desktop-01",
    "status": "online",
    "last_heartbeat_at": "2026-07-25T10:00:00.000Z"
  }
}
```

---

### Action 2: `poll_commands`

Agents poll for pending commands assigned to their `bridge_id`.

#### Request (`POST ?action=poll_commands`)
```json
{
  "bridge_id": "bridge-desktop-01",
  "max_commands": 10
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "commands": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "account_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
      "bridge_id": "bridge-desktop-01",
      "operation": "place_order",
      "payload": {
        "symbol": "EURUSD.a",
        "side": "BUY",
        "volume": 0.10,
        "action": "pending",
        "type": "buy_limit",
        "price": 1.08500,
        "stopLoss": 1.08200,
        "takeProfit": 1.09100,
        "clientRequestId": "sig-12345:acc-b2c3"
      },
      "idempotency_key": "sig-12345:acc-b2c3",
      "status": "claimed",
      "attempts": 1,
      "created_at": "2026-07-25T10:00:01.000Z",
      "expires_at": "2026-07-25T10:02:01.000Z"
    }
  ]
}
```

---

### Action 3: `ack_command`

After attempting command execution in the MT5 terminal, the agent acknowledges the result.

#### Request (`POST ?action=ack_command`)
```json
{
  "bridge_id": "bridge-desktop-01",
  "command_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "success": true,
  "error_code": null,
  "error_message": null,
  "result": {
    "ticket": 987654321,
    "deal_ticket": 123456789,
    "volume": 0.10,
    "price": 1.08500,
    "retcode": 10009,
    "comment": "Request completed"
  }
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "command_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "acknowledged"
}
```

---

### Action 4: `sync_state`

Agents send live account balance, equity, margin, positions, and pending orders to update cloud read models and trigger risk limit checks.

#### Request (`POST ?action=sync_state`)
```json
{
  "bridge_id": "bridge-desktop-01",
  "account_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "account_number": "12345678",
  "broker": "IC Markets",
  "snapshot": {
    "balance": 10000.00,
    "equity": 10250.50,
    "margin": 200.00,
    "free_margin": 10050.50,
    "floating_pnl": 250.50,
    "commission": -3.50,
    "swap": 0.00,
    "currency": "USD"
  },
  "positions": [
    {
      "ticket": 987654321,
      "symbol": "EURUSD.a",
      "side": "long",
      "volume": 0.10,
      "open_price": 1.08500,
      "current_price": 1.08750,
      "sl": 1.08200,
      "tp": 1.09100,
      "pnl": 250.00
    }
  ],
  "orders": []
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "account_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "breached": false,
  "breach_reason": null
}
```

---

### Action 5: `sync_symbols`

Agents synchronize mapped MT5 broker symbol specifications (contract sizes, digits, volume steps, stop levels) to the cloud.

#### Request (`POST ?action=sync_symbols`)
```json
{
  "bridge_id": "bridge-desktop-01",
  "account_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "specs": [
    {
      "canonical_symbol": "EURUSD",
      "broker_symbol": "EURUSD.a",
      "digits": 5,
      "point": 0.00001,
      "contract_size": 100000,
      "volume_min": 0.01,
      "volume_max": 100.0,
      "volume_step": 0.01,
      "stops_level_points": 10,
      "fill_policies": ["ioc", "return"]
    }
  ]
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "synced_count": 1
}
```

---

## 4. Retcode & Failure Classification

MT5 broker return codes (`retcode`) are normalized by the agent into standard categories:

| MT5 Retcode | Meaning | Category | Action |
|---|---|---|---|
| `10009` | REQUEST_DONE | `success` | Acknowledge `acknowledged` |
| `10008` | PLACED | `success` | Acknowledge `acknowledged` |
| `10004` | REQUOTE | `terminal_rejected` | Acknowledge `failed` |
| `10006` | REJECT | `terminal_rejected` | Acknowledge `failed` |
| `10013` | INVALID_REQUEST | `validation_failed` | Acknowledge `failed` |
| `10014` | INVALID_VOLUME | `validation_failed` | Acknowledge `failed` |
| `10018` | MARKET_CLOSED | `market_closed` | Acknowledge `failed` |
| `10019` | NO_MONEY | `insufficient_margin` | Acknowledge `failed` |
| `10021` | NO_CHANGES | `idempotent_noop` | Acknowledge `acknowledged` |

---

## 5. Idempotency & Concurrency Guarantees

1. **Unique Idempotency Key:** `ON CONFLICT (account_id, idempotency_key)` prevents duplicate commands in `mt5_commands`.
2. **Atomic Lease Claiming:** `claim_mt5_commands` RPC or atomic status UPDATE prevents double-execution by multiple instances.
3. **Lease Expiration Recovery:** Commands claimed > 2 minutes ago without acknowledgement automatically reset to `pending` or expired state.
4. **Single-Instance Daemon Lock:** Local file lock `.mt5_agent.lock` enforces single agent execution per terminal directory.
