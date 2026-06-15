# Provider Controls Root Cause — Phase X-D Repair

## Findings

1. `execution_provider_controls` was introduced in migration `20260615130000_072_parallel_provider_execution_lab.sql`, but the frontend treated an empty result as an unmigrated table.
2. The Admin Execution UI queried `execution_provider_controls` directly and rendered `Provider controls table not migrated yet.` whenever `providerControls.length === 0`, without checking whether the query failed, RLS blocked the request, or seed rows were missing.
3. Migration 072 created the table and seed rows, but it did not enable/admin-scope RLS policies for the provider controls/parity tables. In a Supabase browser client, this can make admin SELECT/UPDATE fail or return no usable rows depending on deployed policy state.
4. The controls schema used `provider_name`, while the requested operational contract refers to `provider`. The repair keeps `provider_name` for backward compatibility and adds/syncs `provider` for compatibility.
5. Provider comparison used a view grouped only from `execution_orders`, so providers with zero rows (Bybit/MT5) did not appear. That looked like the page was broken even when the correct state was "waiting for provider data".
6. Parity audit rows are expected to be empty until a parallel provider test writes audit data. The UI did not clearly distinguish this safe empty state from a data failure.
7. Env flags are server-side Edge Function inputs. The browser UI must read DB control rows for controls/readiness; changing Edge Function env values alone cannot make missing/blocked DB rows visible.

## Root Cause

The immediate false warning was UI error handling: the Admin Execution page displayed the migration warning for any zero-row provider-control state. The underlying end-to-end break was incomplete DB hardening around provider controls: no additive repair migration guaranteeing rows, global defaults, compatibility columns, indexes, views with zero-provider placeholders, and admin RLS policies.
