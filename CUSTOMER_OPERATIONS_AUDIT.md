# Customer operations safety audit — work in progress

This draft contains customer-scoped onboarding and transactional account/Brain setup; MT5 pairing consumption; verify-before-store credential safeguards; safer Binance close confirmation and Bybit TP1/stop handling; optional defensive loss-response policy inside Phase D; and connected administrator surfaces replacing misleading or retired controls. Public pricing is unchanged.

## Verification
Focused onboarding/provider safety, embedded PostgreSQL migration tests, Phase D/E/F/G/H/M/N and trade-management checks have passed during development. Embedded database tests use a predecessor-schema fixture and a Vault shim, not actual Supabase Vault encryption or a complete migration-chain rehearsal. Production build passed during development. Repository-wide typecheck remains failing; final comparison and visual review remain pending.

## Still under investigation — do not merge or activate
- Durable production Phase-D decision/plan producer integration has not been established end to end.
- The MT5 executor must resolve the verified physical terminal account from the logical customer account mapping.
- Optional defensive loss-response logic has no connected canonical runtime performance-evidence loader yet.
- Remaining administrator mutation surfaces need runtime review.
- Credential-revocation/order concurrency, complete ordered migrations, real Auth/RLS/Vault and multi-session database behavior require verification.
- Pairing uses the existing owner-managed Windows worker; this is not a public installer that can safely distribute global bridge credentials.
- Portfolio overlap/intratrade equity limitations remain; no strategy or Prop certification is claimed.

No remote SQL, deployments, schedules, external messages, provider orders or live execution were performed. Real provider and forward-demo validation remain NOT_RUN. One scanner, canonical arbitration/signal truth, Phase-D risk authority and E/F execution boundaries remain required.
