# HashiBot Phase 7A-1 Audit: Professional Telegram Core Infrastructure

**Document ID:** HASHIBOT-AUDIT-TELEGRAM-7A1-2026-07  
**Status:** VERIFIED & OPERATIONAL  
**Target Environment:** Testnet / Sandbox (`LIVE_TRADING_ENABLED=false`)  
**Scope:** Root Application Active Runtime (`/supabase/functions`, `/src`, `/tests/telegram`, `/tests/execution`, `/tests/runtime`)  

---

## 1. Executive Summary & Architectural Overview

Phase 7A-1 establishes HashiBot's unified **Telegram Core Infrastructure** as a non-trading, non-execution, read-only communication layer. Telegram consumes normalized runtime events produced by the trading engine and guarantees durable, idempotent, and provider-aware message delivery.

### Core Architectural Principle
> **Telegram is a communication layer only.**  
> It must never become another trading engine, another execution engine, another signal engine, or another source of truth. Trading and execution continue uninterrupted even if the Telegram API or network transport fails.

```
Market Scanner → Strategies → Arbitrator → Immutable Signal Truth → Risk & Capital Engines
                                                                               │
                                                                               ▼
                                                                     Execution Router (Binance / Bybit / MT5)
                                                                               │
                                                                               ▼
                                                                     Protection & Supervisor Engines
                                                                               │
                                                                               ▼
                                                                     Normalized Runtime Event
                                                                               │
                                                                               ▼
                                                                     Central Telegram Router
                                                                     (`telegram-router.ts`)
                                                                               │
                                                                               ▼
                                                                ┌──────────────┴──────────────┐
                                                                ▼                             ▼
                                                    Delivery Queue & Truth          Template Engine
                                                   (`telegram_deliveries`)         (`telegram-templates.ts`)
                                                                │                             │
                                                                └──────────────┬──────────────┘
                                                                               ▼
                                                                  Telegram Gateway API
                                                  (Admin, Free, VIP Signals, VIP Execution, Analytics)
```

---

## 2. Audit Findings of Pre-existing Telegram Code

Prior to Phase 7A-1 consolidation, the audit identified several structural deficiencies across legacy edge functions and scripts:

| Audit Category | Identified Issue | Phase 7A-1 Resolution |
|----------------|------------------|-----------------------|
| **Routing Paths** | Fragmented send pathways in `telegram-send`, `telegram-orchestrator`, and `telegramBrain.ts`. | Consolidated all dispatches through `routeTelegramEvent()` in `_shared/telegram-router.ts`. |
| **Idempotency** | Inconsistent deduplication relying only on basic message text hashes. | Implemented deterministic idempotency keys: `{eventType}:{destination}:{entityId}:{stage}`. |
| **Error Handling** | Transient errors (HTTP 429) treated identically to permanent errors (HTTP 403 / Chat Not Found). | Implemented `classifyDeliveryError()` with retry delays and dead-letter queue state transitions. |
| **Channel Registry** | Hardcoded environment variable lookups scattered across multiple functions. | Created backend-owned `TelegramChannelRegistry` (`_shared/telegram-registry.ts`). |
| **Taxonomy** | Unstructured free-text event strings (`"new_signal_alert"`, `"bot_error"`). | Created normalized taxonomy across 7 categories with explicit `TelegramVisibility` rules. |
| **Time & Precision** | Inconsistent UTC vs server local timestamps; arbitrary decimal rounding for Forex/Metals. | Standardized East Africa Time (EAT, UTC+3) and instrument precision formatting (`EURUSD`: 5, `USDJPY`: 3, `XAUUSD`: 2). |

---

## 3. Authoritative Telegram Channel Registry

The channel registry (`_shared/telegram-registry.ts`) manages destination metadata and routing rules without exposing bot tokens or production chat IDs to frontend components.

| Channel Key | Destination Purpose | Default Visibility | Supported Event Categories | Target Audience / Scope |
|-------------|---------------------|--------------------|----------------------------|--------------------------|
| `admin` | Admin Operations & Supervisor Alerts | `ADMIN_ONLY` | `RECOVERY`, `RISK`, `RUNTIME`, `TELEGRAM`, `PROTECTION` | HashiBot System Operators |
| `free` | Free Public Channel Teasers | `FREE_PUBLIC` | `SIGNALS` (Delayed / Teasers) | Public Telegram Members |
| `vip` | VIP Trading Signal Room | `VIP_SIGNAL` | `SIGNALS`, `PROTECTION` | VIP Signal Subscribers |
| `vip_execution` | VIP Automated Execution Channel | `VIP_EXECUTION` | `EXECUTION`, `PROTECTION` | Automated Bot Subscribers |
| `analytics` | Market Digests & Watchlists | `ANALYTICS` | `RUNTIME`, `SIGNALS` | Market Analytics Subscribers |
| `customer_direct` | Direct Customer DM Alerts | `CUSTOMER_DIRECT` | `EXECUTION`, `PROTECTION`, `RISK` | Individual Account Owners (Deferred to 7A-2) |
| `test` | Sandbox Operator Testing | `ADMIN_ONLY` | All Categories | Internal Testing / Diagnostics |

---

## 4. Normalized Event Taxonomy & Visibility Rules

Events are categorized into 7 authoritative groups (`_shared/telegram-taxonomy.ts`). Routing and visibility are determined by explicit taxonomy rules rather than fragile string matching:

1. **SIGNALS:** `SIGNAL_QUALIFIED`, `SIGNAL_PUBLISHED`, `SIGNAL_ENTRY_ACTIVE`, `SIGNAL_EXPIRED`, `SIGNAL_CANCELLED`, `SIGNAL_TP1`, `SIGNAL_TP2`, `SIGNAL_STOPPED`, `SIGNAL_CLOSED`
2. **EXECUTION:** `EXECUTION_QUEUED`, `EXECUTION_SUBMITTED`, `EXECUTION_ACKNOWLEDGED`, `EXECUTION_FILLED`, `EXECUTION_REJECTED`, `EXECUTION_FAILED`, `EXECUTION_SKIPPED`, `POSITION_PARTIALLY_CLOSED`, `POSITION_CLOSED`
3. **PROTECTION:** `PROTECTION_REQUIRED`, `PROTECTION_REQUESTED`, `PROTECTION_VERIFIED`, `PROTECTION_PARTIAL`, `PROTECTION_FAILED`, `PROTECTION_REPAIRED`, `BREAK_EVEN_APPLIED`, `TRAILING_STOP_APPLIED`
4. **RECOVERY:** `SUPERVISOR_WARNING`, `SUPERVISOR_FAILURE`, `RECOVERY_STARTED`, `RECOVERY_SUCCEEDED`, `RECOVERY_FAILED`, `ORPHAN_POSITION_DETECTED`, `ORPHAN_ORDER_DETECTED`, `RECONCILIATION_MISMATCH`, `RECONCILIATION_RESOLVED`
5. **RISK:** `RISK_ENTRY_BLOCKED`, `DAILY_LOSS_LOCK`, `OVERALL_DRAWDOWN_LOCK`, `PROP_ACCOUNT_LOCKED`, `CAPITAL_ALLOCATION_FAILED`, `EMERGENCY_STOP_ACTIVATED`, `RUNTIME_RESUMED`
6. **RUNTIME:** `SCANNER_FAILED`, `SCANNER_RECOVERED`, `PROVIDER_DEGRADED`, `PROVIDER_OFFLINE`, `PROVIDER_RECOVERED`, `MT5_HEARTBEAT_STALE`, `DATABASE_FAILURE`, `SCHEDULER_FAILURE`, `OPERATOR_COMMAND_COMPLETED`, `OPERATOR_COMMAND_FAILED`
7. **TELEGRAM:** `TELEGRAM_DELIVERY_QUEUED`, `TELEGRAM_DELIVERY_SENT`, `TELEGRAM_DELIVERY_FAILED`, `TELEGRAM_DELIVERY_RETRYING`, `TELEGRAM_DELIVERY_DEAD_LETTERED`

---

## 5. Delivery Queue Lifecycle & Idempotency Engine

Every outbound message logs durable delivery truth in `telegram_deliveries`:

```
QUEUED ──► PROCESSING ──► SENT (Acknowledged by Telegram API)
                │
                ├─► RETRY_PENDING (Transient error, e.g. HTTP 429) ──► RETRY ──► SENT
                │
                └─► DEAD_LETTERED (Permanent error, e.g. HTTP 403 Bot Blocked)
```

### Deterministic Idempotency Key
Idempotency keys prevent duplicate broadcasts caused by retries, server restarts, or cron overlaps:
$$\text{IdempotencyKey} = \text{lowercase}\left(\text{EventType} : \text{DestinationChannel} : \text{EntityID} : \text{Stage}\right)$$
- Example: `signal_qualified:vip:sig-84920:entry_triggered`

---

## 6. Centralized Template Engine & Precision Formatting

All templates (`_shared/telegram-templates.ts`) implement strict formatting rules:

- **Timezone:** Displays dates in East Africa Time (EAT, UTC+3, 12-hour format) e.g. `1:45 PM EAT`.
- **Instrument Precision:**
  - Major Forex (`EURUSD`, `GBPUSD`): 5 decimal places (`1.08542`).
  - JPY Forex (`USDJPY`): 3 decimal places (`155.123`).
  - Metals (`XAUUSD`): 2 decimal places (`2385.50`).
  - Crypto (`BTCUSDT`): Magnitude-aware (2 decimals for $> \$1000$).
- **Security & Redaction:** Automatically redacts API keys, bearer tokens, or secrets matching `/(?:sk_live|apikey|token|secret|password)[=:]\S+/gi` into `[REDACTED]`.
- **Markdown Escaping & Chunking:** Escapes Markdown special characters and splits messages $> 4000$ characters without breaking structural formatting.

---

## 7. Database Migrations & Files Created / Modified

### Database Migration
- `/supabase/migrations/20260723150000_phase7a1_telegram_core_infrastructure.sql`
  - Added `idempotency_key`, `payload_hash`, `routing_version`, `template_version`, `retry_after_seconds`, `next_attempt_at`, `telegram_response`, `visibility`, `dead_lettered_at`, and `dead_letter_reason` columns to `telegram_deliveries`.
  - Added indexes on `idempotency_key` and `(delivery_status, next_attempt_at)`.

### Core Shared Infrastructure Code
- `/supabase/functions/_shared/telegram-taxonomy.ts`
- `/supabase/functions/_shared/telegram-registry.ts`
- `/supabase/functions/_shared/telegram-templates.ts`
- `/supabase/functions/_shared/telegram-router.ts`

### Edge Functions Updated
- `/supabase/functions/telegram-send/index.ts`
- `/supabase/functions/telegram-orchestrator/index.ts`
- `/supabase/functions/telegram-test/index.ts`

### Test Suites Created / Modified
- `/tests/telegram/telegramCoreInfrastructure.test.ts`
- `/package.json` (Added `"test:telegram"` script)

---

## 8. Deterministic Verification & Command Log

All test suites and build tools were executed and verified:

```bash
# 1. Phase 7A-1 Telegram Core Infrastructure Verification
npm run test:telegram
# Result: PASS (Taxonomy, Channel Registry, Templates, EAT Timezone, Precision, Redaction, Idempotency, Retry logic)

# 2. Paper & Telegram Runtime Verification
npm run test:paper-telegram
# Result: PASS (Paper trade lifecycle and Telegram dispatch compatibility)

# 3. Forex Engine Verification
npm run test:forex-phase7
# Result: PASS (Forex scanner, symbol precision, strategy evaluation, shared arbitration)

# 4. MetaTrader 5 Provider Verification
npm run test:mt5
# Result: PASS (MT5 provider adapter, command queue, lot sizing, prop firm drawdown rules)

# 5. Professional Strategy Framework Verification
npm run test:strategies
# Result: PASS (Strategy registry, candidate logging, diagnostic diagnostics)

# 6. Forex Recovery Verification
npm run test:forex-recovery
# Result: PASS (Protection engine, break-even SL adjustments, supervisor self-healing)

# 7. Execution Certification & Chaos Suite
npm run test:execution
# Result: PASS (25-scenario chaos suite, cross-provider execution routing, admin UI assertions)

# 8. TypeScript Applet Build & ESLint Check
compile_applet
lint_applet
# Result: PASS (Clean build, zero lint errors)
```

---

## 9. Phase Boundary & Work Deferred to Phase 7A-2 & Phase 8

### Completed in Phase 7A-1
- Central Telegram routing service.
- Authoritative channel registry.
- Durable delivery tracking, idempotency, retry engine, and dead-letter queue.
- Normalized event taxonomy and template engine.
- Security redaction and EAT time formatting.

### Intentionally Deferred to Phase 7A-2
- Customer-facing Telegram channel setup workflows.
- Package-specific customer delivery filtering UI in Operator Panel.
- Interactive bot command handlers (`/start`, `/status`, `/help`).

### Deferred to Phase 8
- Production live Telegram channel deployment and webhook setup.

---

**Conclusion:** HashiBot Phase 7A-1 Professional Telegram Core Infrastructure is 100% complete, fully tested, and verified operational in the root runtime environment.
