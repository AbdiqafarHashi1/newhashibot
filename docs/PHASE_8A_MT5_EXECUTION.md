# Phase 8A — Professional MT5 Execution Platform

## Architecture

MT5 is provider `mt5` in the shared execution framework. The canonical planner/request is unchanged. The account-scoped provider translates a request with broker symbol metadata, validates volume/precision/stop distance/fill policy, then submits an idempotent command to a bridge assigned to that account. No credential is returned to the browser or provider: the account API envelope-encrypts credentials and the public view exposes only the last four account-number digits.

The terminal bridge is an external deployment boundary. It authenticates as a service, polls account-specific commands, executes them through the terminal, acknowledges broker results, publishes symbol specifications and snapshots, and reconnects locally. Heartbeat/snapshot timestamps provide connection and synchronization health.

## Components

- `mt5.ts`: account/mode/session contracts, broker-rule translation, readiness and multi-account target selection.
- `ExchangeProviderMT5.ts`: shared `ExchangeProvider` implementation and Supabase gateway.
- `mt5-accounts`: authenticated credential/account management edge function.
- Phase 8A migration: safe account model, RLS, symbol specifications, snapshots, idempotent command queue and service-only synchronization.
- Existing canonical trade truth remains authoritative; bridge results use provider/account/order/position IDs to update that shared lifecycle. Snapshots are provider read models, not a second trade tracker.

## Operations and external requirements

Set `MT5_CREDENTIAL_ENCRYPTION_KEY` to a high-entropy secret and deploy `mt5-accounts`. Deploy one or more compatible Windows MT5 terminal bridge workers with service-role authentication, account assignment, heartbeat, command claim/ack, symbol-spec publishing and `sync_mt5_account` support. MT5 terminal execution cannot run inside Supabase Edge Functions. Broker trading permission, terminal credentials, market availability, VPS connectivity and prop-firm EA policy must be verified externally.

Protection automation, break-even, trailing stops, partial closes, recovery, reconciliation, prop-rule enforcement, lifecycle Telegram, analytics and certification remain intentionally deferred to Phase 8B.
