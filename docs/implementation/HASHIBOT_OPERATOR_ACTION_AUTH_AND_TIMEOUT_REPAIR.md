# HASHIBOT Operator Action Auth and Timeout Repair

## Root cause

Manual operator clicks entered `admin-operator-action` with a valid browser JWT, but the route then invoked downstream Edge Functions with credentials in the wrong channel. Newer secret/API key or Vault-record-shaped values can be rejected when sent as `Authorization: Bearer <value>`, producing `UNAUTHORIZED_INVALID_JWT_FORMAT`. The previous caller waited up to 55 seconds and surfaced this as a generic timeout, so Operator Action History was often empty or inconclusive.

## Final authentication architecture

Browser user JWT -> `admin-operator-action` validates the user with Supabase Auth -> profile role must be `admin` -> shared server-side invocation helper sends `x-hashibot-internal-secret` (preferred) or existing cron token headers -> downstream functions validate custom internal auth through `_shared/internal-auth.ts`.

`Authorization: Bearer` remains reserved for real user JWTs or legacy service-role JWTs. Non-JWT opaque secrets are not treated as JWTs and fail fast with `UNAUTHORIZED_INVALID_JWT_FORMAT` when misplaced in `Authorization`.

Required secret names only:

- `HASHIBOT_INTERNAL_SECRET` (preferred internal M2M secret)
- `INTERNAL_FUNCTION_SECRET` (fallback name)
- `HASHIBOT_CRON_TOKEN` / `INTERNAL_CRON_TOKEN` / `SCANNER_CRON_SECRET` (legacy compatibility only)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side DB/admin verification only; not used by the operator helper as a bearer credential)

## Action routing matrix

| Action key | Target | Payload | Timeout | Side effects | Idempotency |
| --- | --- | --- | ---: | --- | --- |
| `run_scanner_now` | `scheduled-market-scanner` | `{ source, run_type: manual_operator }` | 12s | scanner run | no retry by router |
| `run_runtime_proof` | `binance-testnet-execution` proof targets | `prove_binance_trade_management`, `prove_bybit_trade_management` | 12s per target | read/proof sync only | no mutation retries |
| `run_supervisor_now` | `binance-testnet-execution` | `run_trade_supervisor_cycle` | 12s | supervisor cycle | no automatic retry |
| `run_binance_monitor_now` | `binance-testnet-monitor` | manual monitor trigger | 12s | monitor/reconciliation | no automatic retry |
| `run_bybit_monitor_now` | `bybit-testnet-monitor` | manual monitor trigger | 12s | monitor/reconciliation | no automatic retry |
| `repair_protection_now` | `binance-testnet-execution` | `repair_all_protection_now` | 15s | repair attempts | idempotency key required |
| `refresh_exchange` | `binance-testnet-execution` | `sync_all_positions_now` | 12s | exchange truth refresh | idempotency key required |
| `retry_verification` | `binance-testnet-execution` | `run_trade_supervisor_cycle` | 15s | verification/supervisor | idempotency key required |
| `retry_protection` | `binance-testnet-execution` | `repair_all_protection_now` | 15s | repair attempts | idempotency key required |
| pause/resume controls | `scanner_config` update | control field toggle | immediate | DB config toggle | existing config row update |

## Function verify_jwt matrix

No global JWT disablement is required or introduced by this repository change.

| Function | Public browser entry | Internal auth | verify_jwt guidance |
| --- | --- | --- | --- |
| `admin-operator-action` | Admin browser JWT only | n/a | keep JWT verification for browser access |
| `scheduled-market-scanner` | no | `authorizeInternalOrAdmin` | may be `verify_jwt=false` only if custom internal secret validation is deployed |
| `market-scanner` | no | existing scanner/service validation | internal only; do not make public |
| `binance-testnet-execution` | no | `authorizeInternalOrAdmin` | may be custom-internal only; do not make public |
| `binance-testnet-monitor` | no | `authorizeInternalOrAdmin` | may be custom-internal only; do not make public |
| `bybit-testnet-monitor` | no | `authorizeInternalOrAdmin` | may be custom-internal only; do not make public |
| `telegram-test` | no | `authorizeInternalOrAdmin` | internal/admin only |
| `intelligence-engine` | no | `authorizeInternalOrAdmin` | internal/admin only |

## Timeout policy

The shared helper aborts requests with `AbortController`. Default timeout is 12 seconds; repair/retry mutations use 15 seconds. HTTP 401/403/404/409/422/500 responses are returned immediately with normalized fields: `ok`, `target`, `httpStatus`, `durationMs`, `timedOut`, `authFailed`, `responseBody`, `errorCode`, and `errorMessage`.

## Idempotency and unknown outcomes

Mutating repair/retry/refresh actions receive an `Idempotency-Key` header and the same value in the downstream payload. The router records the operator event before invoking the target. If a mutating request times out after it may have reached the target, the result includes `UNKNOWN_OUTCOME_REQUIRES_RECONCILIATION`; the router does not retry automatically.

## Deployment and rollback steps

1. Deploy shared internal auth/invocation helper.
2. Deploy downstream internal functions that validate `x-hashibot-internal-secret`.
3. Deploy `admin-operator-action`.
4. Deploy frontend.
5. Run Runtime Proof test.
6. Run Scanner test.
7. Run Binance monitor test.
8. Run Bybit monitor test.
9. Run controlled provider tests.
10. Activate cron only after certification.

Rollback: redeploy the previous function bundle and frontend build. Do not change production data during rollback; keep cron disabled until operator certification passes again.

## Manual validation sequence

1. Log in as admin and click Run Runtime Proof once.
2. Confirm UI shows target, HTTP status, duration, and exact error code or success.
3. Confirm one `operator_runtime_events` row exists for that click.
4. Click Run Scanner once and confirm `scheduled-market-scanner` receives internal auth and calls `market-scanner` once.
5. Click Binance Monitor and Bybit Monitor once each.
6. Run one controlled repair/protection action and verify idempotency key propagation.
7. Confirm no duplicate Telegram sends and no duplicate operator events.
8. Confirm no cron job was enabled as part of this repair.

## Final deployment configuration verification

`supabase/config.toml` uses per-function `verify_jwt`; there is no global JWT disablement. `admin-operator-action` remains gateway-JWT protected and still verifies the browser user/admin role inside the handler. Internal-only downstream functions set `verify_jwt=false` so the Supabase gateway lets the request reach the handler, where `authorizeInternalOrAdmin` validates `x-hashibot-internal-secret` or supported legacy internal headers.

| Function | Current verify_jwt | Required verify_jwt | Handler validates `x-hashibot-internal-secret` | Admin browser access | Internal-only | Code changes still required |
| --- | --- | --- | --- | --- | --- | --- |
| `admin-operator-action` | `true` | `true` | n/a | yes, admin JWT + role check | no | no |
| `scheduled-market-scanner` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes | no |
| `market-scanner` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes | no |
| `binance-testnet-execution` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes | no |
| `binance-testnet-monitor` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes | no |
| `bybit-testnet-monitor` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes | no |
| `telegram-test` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes | no |
| `intelligence-engine` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes | no |
| `evaluate-signal-outcomes` | `false` | `false` | yes, via `authorizeInternalOrAdmin` | no direct browser UI target | yes; invoked by scheduled scanner | no |

### Exact deployment commands, in dependency order only

Do not run these until the deployment window:

```bash
supabase functions deploy scheduled-market-scanner --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy market-scanner --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy evaluate-signal-outcomes --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy binance-testnet-execution --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy binance-testnet-monitor --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy bybit-testnet-monitor --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy telegram-test --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy intelligence-engine --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy admin-operator-action --project-ref "$SUPABASE_PROJECT_REF"
npm run build
# deploy the frontend artifact through the repository's approved hosting pipeline
```
