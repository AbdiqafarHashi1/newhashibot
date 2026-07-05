# 01 Repository Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- Repository is a Vite React/Supabase monolith with frontend pages, browser-side domain helpers, Supabase SQL migrations, and Deno Edge Functions in one repo.
- Build tooling is simple and useful: Vite, TypeScript, ESLint, Tailwind, Supabase JS. Classification: MODERNIZE into /v2/apps/customer-web, /v2/apps/admin-web, /v2/services, and /v2/packages.
- V1 has accumulated many dated migrations and hotfix-style files. Classification: REWRITE database baseline for V2; retain migration history as reference only.
- The current app name/package remains generic. Classification: MODERNIZE metadata for V2.

## Component classification
| Component | Classification | V2 destination | Notes |
|---|---:|---|---|
| package.json scripts | MODERNIZE | /v2/package.json | Keep build/lint/typecheck pattern; split service tests. |
| src/ | MODERNIZE | /v2/apps/* and /v2/packages/* | UI concepts useful; runtime/trading code must be extracted/rebuilt. |
| supabase/functions | REWRITE | /v2/services and /v2/supabase/functions | Too much runtime logic in Edge Functions. |
| supabase/migrations | REWRITE | /v2/supabase/migrations | Use fresh schema from constitution. |
| scripts/ | MODERNIZE | /v2/scripts | Useful deployment/check patterns; execution proof scripts need adapter certification framing. |
