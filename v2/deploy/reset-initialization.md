# Platform Reset and Initialization

Run `v2/deploy/scripts/platform-reset.sh soft` before customer onboarding. Development-only destructive modes require `HASHIBOT_ENV=development` and `PLATFORM_RESET_ALLOW_DESTRUCTIVE=true`.

## Soft reset

Resets research jobs, Telegram queue, notifications, monitoring/runtime metrics, executor state, command queue, orphan commands, mock/demo data, pending approvals, failed runtime actions, and temporary bridge logs while preserving customers, subscriptions, audit records, and Trade Truth.

## Development-only factory reset

Factory reset additionally clears customers, subscriptions, optional audit logs, and Trade Truth. The script refuses this in production.

## Initialization

Reinitialize packages, default roles, Telegram templates/routes, monitoring summaries, runtime caches, indicator cache, strategy registry, provider registry, Telegram registry, executor registry, HashiCore, scanner, then run and verify the first scan, engine, Telegram, monitoring, protection, and UI.
