# Supabase activation preparation — 21 November 2026

Project `uqiwbzfcntlcyyewawfc` was observed INACTIVE. No remote schema, history,
function version or running schedule has been verified in this change.

## Coordinated release

Use `scripts/phase-p/inspect-deployment.mjs`, `inspect-functions.mjs`, and
`plan-deployment.mjs` as described in OFFLINE_DEPLOYMENT_RUNBOOK.md. Generate a
fresh inventory/manifest from the final source before reconciliation. The planner
builds from current source by default; explicit manifests must match it. The older
committed manifest and rehearsal JSON files describe earlier source states.
The plan now binds **all inventoried source**, not just pending SQL. A changed
function, shared module, workflow or configuration invalidates it.

The manual deployment workflow pins CLI 2.120.0, serializes releases, requires
the reconciled plan, compares the CLI pending set, applies SQL, then deploys all
functions with their own JWT policies. It stops on failure. It cannot make
Postgres migrations and Edge Function uploads one atomic transaction: keep
workers paused through the full operation. A partial function upload requires
recovery before any worker is enabled. No workflow automatically resumes jobs.

Before applying pending SQL, pause existing HashiBot schedules in the dashboard
and stop external workers. Historical migrations can create active jobs while
running; do not treat the final paused installer as protection during migration.
Back up the existing database and reconcile its applied prefix first.

Two source migrations used version `20261118120000`. House-money state keeps
that identity; editorial spacing moves to the CLI-created
`20261121111114_editorial_channel_spacing_unique.sql`. If the old remote history
contains the editorial statements, inspect the stored statements and reconcile
that identity before applying anything. Do not blindly repair history or rerun
CREATE statements. The deployment planner refuses ambiguous history.

## Resource controls

- One database scanner lease covers scheduled and manual pipeline entry. A busy
  request skips provider work. Failed admission fails closed. Only the owning
  token releases the lease; a crashed worker expires after ten minutes, beyond
  the hosted Edge Function wall-clock limit. Deploy the lease SQL before code.
- Existing scanner bounds remain: default 10 crypto + 3 Forex symbols, four
  timeframes maximum; hard cap 31 symbols, 124 requests, concurrency four.
  These caps bound scanner inputs; they do not cap all account/provider work.
- Five-minute workers use different minute offsets. Peak recurring HTTP
  submissions are eight per minute for ALL, excluding nested/manual traffic.
  This is a launch-density check, not a guarantee of simultaneous runtime count.
- Scheduler installation now accepts only the exact name/endpoint/header/cron
  tuples and rejects duplicate names. Installation pauses existing HashiBot jobs
  and installs the reviewed definitions paused. Enable only required services.
- An hourly maintenance job is installed **paused**. It deletes at most 1,000
  archive copies older than 30 days and 1,000 completed HashiBot cron-history
  rows older than seven days per run. It has a ten-second statement timeout,
  one-second lock timeout and nonblocking transaction lock. It never runs on
  migration, and has no client/service-role EXECUTE grant. Review retention,
  then enable this owner-run SQL job separately. Larger backlogs drain gradually.
- This housekeeping does not replace raw runtime-table retention. Review the
  existing per-table policies before using the older noncritical cleanup RPC:
  some include lifecycle records, and referenced candidate/run rows can prevent
  deletion. Same-database archiving alone does not reduce retained storage.
  Never apply blanket deletion to account/trade/payment truth or research data.

## Invocation budget (30 days, continuously enabled)

| Scope | Scheduled HTTP calls |
| --- | ---: |
| Signal service / RELEASE1 | 172,800 |
| All services / ALL | 345,600 |

Counts exclude nested invocations, provider calls, webhooks, manual requests and
retries. Database SQL housekeeping adds no Edge invocation. These are workload
estimates, not billing forecasts or a promise that any plan cannot exhaust quota.
Check the selected plan's current limits and actual Usage dashboard on activation.

Run `npm run check:supabase-activation` to recalculate from the current schedules.
Use `resource-preflight.sql` for a read-only storage/job inventory, before and
after migration. Check usage daily during the first week and after onboarding
more accounts: database bytes/dead rows, invocations, egress, errors, queue age,
provider limits and worker duration. Set usage alerts/budget controls in the
Supabase dashboard; leave paid agents and unused execution monitors paused.

## Validation boundary

Local targeted tests and static import/schedule checks cover source contracts.
PR native PostgreSQL 15/17 rehearsal must pass against the final commit. The
inactive hosted database still requires real history/schema/ACL/function/cron
reconciliation and post-deployment smoke tests before activation. Older stored
rehearsal reports are not proof for this release.
