# FRONTEND_MIGRATION

V2 frontend work is contained in `/v2` and treats V1 as reference only.

## V1 files inspected
- `src/App.tsx` route inventory.
- `src/components/layout/PublicLayout.tsx`, `AppLayout.tsx`, `AdminLayout.tsx` for HashiBot shell patterns.
- Public pages under `src/pages/public/*`.
- Auth pages under `src/pages/auth/*`.
- Customer pages under `src/pages/app/*`.
- Admin pages under `src/pages/admin/*`.
- Supabase access concepts in `src/contexts/AuthContext.tsx`, `src/lib/customerAccess.ts`, `src/lib/packages.ts`, `src/lib/botSetup.ts`, and `src/lib/supabase.ts`.

## Modernized in V2
- Public, customer, and admin navigation are separated into standalone route maps.
- Shared UI descriptors live in `/v2/packages/ui`.
- Data is served by `/v2/packages/mock-data` mock providers instead of direct V1 Supabase table reads.

## Intentionally skipped
- V1 live scanner, exchange, execution, trading, Telegram send, and raw table polling behavior.
- Production Supabase auth/session wiring.
- Trading logic and adapter behavior.

## Future API wiring plan
Replace mock provider methods with typed API clients after V2 backend contracts, RLS, and summaries are certified. UI route maps should remain stable while data sources move from mocks to API snapshots.
