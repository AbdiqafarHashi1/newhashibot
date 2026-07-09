# HASHIBOT GOOGLE CLOUD WORKER DEPLOYMENT PLAN
**Resilient, High-Frequency, Always-On Container Scheduling for V1 Production**

---

## 1. ARCHITECTURAL OVERVIEW
This document outlines the transition of HashiBot's serverless cron schedule to an always-on, low-latency, and high-availability execution architecture on **Google Cloud Platform (GCP)**. 

To eliminate execution jitter and minimize latency during high-volatility market breakouts, we replace intermittent database-level crons with an orchestration layer combining **Cloud Run Services**, **Cloud Run Jobs**, and **Cloud Scheduler**.

```
                           +------------------------+
                           |  GCP Cloud Scheduler   |
                           +-----------+------------+
                                       |
                     (HTTPS Triggers every 1-5 mins)
                                       v
+--------------------------------------+--------------------------------------+
|                     GCP Cloud Run (Fully Serverless API)                    |
|                                                                             |
|   +-----------------------+  +-----------------------+  +---------------+   |
|   | /api/market-scanner   |  | /api/trade-supervisor |  | /api/news-db  |   |
|   +-----------------------+  +-----------------------+  +---------------+   |
+--------------------------------------+--------------------------------------+
                                       |
                 (Direct VPC Ingress / IAM Auth)
                                       v
+-----------------------------------------------------------------------------+
|                                  DATABASE                                   |
|                                                                             |
|                      Supabase / PostgreSQL database                         |
|      (Manages Trade Management Truth, Orders, Configurations, Audits)       |
+-----------------------------------------------------------------------------+
```

---

## 2. SERVICES VS. JOBS DECISION MATRIX

For maximum resource efficiency and operational predictability, we split our worker operations into two execution archetypes:

### A. Cloud Run Services (Always-On API & Live Listener Websockets)
- **Used For**: `/api/trade-supervisor` and Webhook Receivers.
- **Why**: Keeps execution latency under 100ms. Enables persistent TCP connections to exchange webhooks and handles live incoming price alerts with zero cold-start delay.
- **Scaling Config**:
  - `min-instances`: `1` (Always-on instance to avoid cold-start delays).
  - `max-instances`: `5` (Rate limited to avoid exceeding exchange API rate limit thresholds).
  - `concurrency`: `80` requests per instance.

### B. Cloud Run Jobs (Asynchronous Tasks & Scanner)
- **Used For**: `/api/market-scanner` and Daily Retention Cleanups.
- **Why**: Market scanning runs take 1–3 minutes to process heavy multi-exchange indicators. A Cloud Run Job supports up to 24-hour execution durations and has zero connection timeout limitations.
- **Triggers**: Cloud Scheduler hits the jobs sequentially, guaranteeing clean, decoupled runs.

---

## 3. SECURITY & SECRETS MANAGEMENT
**Under no circumstances are production credentials, database URIs, or Exchange API keys checked into repository files or environment definitions.**

1. **GCP Secret Manager Integration**:
   - All critical secrets are provisioned inside Secret Manager:
     - `DATABASE_URL` (Direct connection string to Supabase PostgreSQL).
     - `BINANCE_API_KEY` & `BINANCE_API_SECRET`.
     - `BYBIT_API_KEY` & `BYBIT_API_SECRET`.
     - `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID`.
   
2. **Runtime Access (IAM)**:
   - The Cloud Run containers run under a custom, restricted Service Account: `hashibot-executor@<gcp-project>.iam.gserviceaccount.com`.
   - This service account is granted precise IAM permissions:
     - `roles/secretmanager.secretAccessor` (limited only to the designated secrets).
     - `roles/run.invoker` (to secure cross-service API requests).

3. **In-Memory Injection**:
   - Secrets are mounted directly into Cloud Run container environment variables at launch, avoiding filesystem logging or exposure in container configuration files.

---

## 4. SCHEDULING & CONCURRENCY CONTROL
To prevent concurrent runs from colliding and creating double-spend, double-order execution anomalies, the scheduling rules are heavily restricted:

- **Cloud Scheduler Setup**:
  - Scanner Job Trigger: `*/5 * * * *` (Every 5 minutes).
  - Supervisor Job Trigger: `* * * * *` (Every 1 minute).
  - Timeout: Configured at 120 seconds to prevent overlapping tasks.
- **Concurrency Locks**:
  - The Supervisor utilizes a database-backed transaction lock before running check cycles. 
  - On entry, the execution engine runs: `SELECT pg_advisory_xact_lock(714390);`. If the lock is held, subsequent invocations immediately exit cleanly without executing duplicate API order checks.

---

## 5. NETWORK ISOLATION & HIGH AVAILABILITY
1. **VPC Connector**:
   - Cloud Run services route all outbound requests through a **Serverless VPC Access Connector** into a dedicated private network.
2. **Static IP Allocation**:
   - Outbound traffic is routed through a **Cloud NAT** gateway with a static IP address.
   - This static IP is whitelisted directly inside Binance and Bybit API portals, blocking unauthorized trades even if API credentials are leaked.
3. **Multi-Region Disaster Recovery**:
   - Services are deployed actively in `us-east1` and passively in `us-west1` with a **Global Cloud Load Balancer** mapping traffic over healthy instances, providing automatic failover if a regional GCP datacenter goes offline.

---

## 6. SELF-HEALING & MULTI-PROVIDER RESILIENCY
During live trading execution, failures are inevitable. The following self-healing orchestration patterns are built into the worker container code:

1. **Exchange Timeout Retries**:
   - When communicating with Bybit/Binance, any network failure or 5xx response is retried immediately using an **Exponential Backoff with Jitter** loop (up to 3 attempts, max duration 15s).
2. **Circuit Breaking**:
   - If a provider (e.g. Bybit) returns 3 consecutive API error codes (such as `10002` invalid signature or `10016` system error), the worker automatically pauses execution for that provider, sets its status to `MUTED` in `provider_status` and triggers a high-severity alert. It continues operating the other healthy exchange (Binance) uninterrupted.
3. **Active Outage Reconciliation**:
   - On every supervisor cycle, the system checks actual positions against `trade_management_truth`. If an exchange API becomes unreachable for more than 5 minutes, the next successful supervisor run automatically queries past historical trade slips to catch up on any filled or closed positions during the downtime.

---

## 7. CLOUD LOGGING, METRICS & PROACTIVE ALERTING
1. **Structured Logging**:
   - All worker code logs are outputted in JSON format to `stdout`:
     ```json
     {"severity": "ERROR", "message": "Failed to sync Bybit protection", "symbol": "BTCUSDT", "error": "API_LIMIT_EXCEEDED", "latency_ms": 142}
     ```
   - GCP Cloud Logging automatically parses these fields for indexing and advanced querying.
2. **Google Cloud Error Reporting**:
   - Any unhandled exception or critical trade failure automatically streams to GCP Error Reporting, triggering instant developer notifications.
3. **Metric Threshold Alerts**:
   - Custom logs-based alerts trigger SMS and Telegram alerts if:
     - Outbound latency exceeds 500ms on 3 consecutive cycles.
     - Database connection pooling errors are detected.
     - Any trade status remains `missing_sl` or `missing_tp` for more than 3 consecutive supervisor runs.
