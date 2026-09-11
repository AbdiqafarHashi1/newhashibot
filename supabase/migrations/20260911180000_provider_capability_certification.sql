alter table public.connected_execution_accounts
  add column if not exists provider_certification_status text not null default 'EXTERNAL_VERIFICATION_REQUIRED'
    check (provider_certification_status in ('CERTIFIED','INCOMPLETE','EXTERNAL_VERIFICATION_REQUIRED')),
  add column if not exists provider_certification_evidence jsonb not null default '{}'::jsonb,
  add column if not exists provider_certified_at timestamptz;

comment on column public.connected_execution_accounts.provider_certification_status is
  'Capability certification (auth, history, market data, symbols and execution), not a generic connected flag.';
