-- PREPARED ONLY. DO NOT APPLY IN PHASE 1F.
create table if not exists certified_execution_claims (
  claim_key text primary key, execution_plan_id text not null, owner text not null,
  claim_token uuid not null default gen_random_uuid(), state text not null check (state in ('ACTIVE','COMPLETED')),
  lease_expires_at timestamptz not null, completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists certified_execution_events (
  event_id text primary key, execution_plan_id text not null, sequence bigint not null,
  event_type text not null, correlation_id text not null, payload jsonb not null,
  created_at timestamptz not null default now(), unique (execution_plan_id, sequence)
);
-- The implementation must expose a SECURITY DEFINER RPC that claims the plan,
-- configuration actions, entry roles, and protection roles in one transaction.
-- It must return ACQUIRED, CONFLICT, RECOVERED_STALE, or COMPLETED_NOOP and
-- must never interpret an insert/network failure as permission to submit.
