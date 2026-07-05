# Operations Runbook

## Daily
Check runtime health, queue health, Telegram delivery, provider health, bridge heartbeat, monitoring summaries, storage growth, and failed actions.

## Weekly
Review audit archive status, RLS policy drift, provider key validity, Netlify deploys, storage lifecycle cleanup, and cost/egress metrics.

## Monthly
Rotate internal tokens where feasible, verify restore procedure, archive old research artifacts, review subscriptions and approvals, and run full smoke certification on staging.

## Emergency
Provider outage: pause affected executors and notify customers. Telegram outage: queue messages and switch to ops alerts. Supabase outage: freeze execution and monitor recovery. Netlify rollback: restore last good deploy and verify `/health`. HashiBridge offline: stop MT5 executors and run bridge recovery. Executor recovery: use `executor-recovery`, verify Trade Truth, then resume. Customer recovery: verify role/subscription/package and replay notifications if needed. Database cleanup: run retention jobs only after backup. Archive verification: sample restore archives. Storage/egress/cost monitoring: enforce bucket limits and investigate spikes.
