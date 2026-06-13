# Edge Function Deploy / Bundle Fix

## 1. Exact root cause

The missing-module deployment failure was caused by deploying from the Supabase dashboard editor instead of deploying from the repository/CLI bundle context. The real Edge Functions import shared modules from `supabase/functions/_shared`, for example `../_shared/intelligence-engine.ts` and `../_shared/telegram-router.ts`. Those imports are valid in the repository layout, but the dashboard editor bundles a temporary single-function source tree and can omit sibling shared modules, producing errors such as:

- `Module not found: ../_shared/intelligence-engine.ts`
- `Module not found: ../_shared/telegram-router.ts`

Deploy from repo/CLI or GitHub Actions, not from dashboard editor, because shared modules under `supabase/functions/_shared` must be available during bundling.

## 2. Files causing it

The deployable functions that rely on shared modules are:

- `supabase/functions/intelligence-engine/index.ts` imports `../_shared/intelligence-engine.ts` and `../_shared/telegram-router.ts`.
- `supabase/functions/telegram-orchestrator/index.ts` imports `../_shared/intelligence-engine.ts` and `../_shared/telegram-router.ts`.
- `supabase/functions/telegram-send/index.ts` imports `../_shared/telegram-router.ts`.
- `supabase/functions/telegram-test/index.ts` imports `../_shared/telegram-router.ts`.
- `supabase/functions/market-scanner/index.ts` imports `../_shared/telegram-router.ts`.
- `supabase/functions/evaluate-signal-outcomes/index.ts` imports `../_shared/telegram-router.ts`.
- `supabase/functions/binance-testnet-execution/index.ts` imports `../_shared/telegram-router.ts`.
- `supabase/functions/binance-testnet-monitor/index.ts` imports `../_shared/telegram-router.ts`.

The shared modules verified in this fix are:

- `supabase/functions/_shared/intelligence-engine.ts`
- `supabase/functions/_shared/telegram-router.ts`

## 3. Fix applied

- Verified `supabase/functions/_shared/intelligence-engine.ts` exists.
- Verified all imports that reference `intelligence-engine` and `telegram-router` use repository-correct relative paths with explicit `.ts` extensions.
- Added `scripts/check-edge-functions.mjs`, a deploy-readiness/import guard that verifies:
  - required shared modules exist,
  - all real function directories exist and have `index.ts`,
  - shared imports resolve from each real deployable function,
  - shared-only module names are not deployable function directories,
  - `deploy:edge-functions` deploys only the approved real functions.
- Did not modify strategy logic, Binance execution logic, monitor logic, Binance truth logic, intelligence behavior, Telegram routing behavior, Forex, MT5, or Portfolio Governor behavior.

## 4. Deploy script added/verified

`package.json` contains:

```json
"deploy:edge-functions": "supabase functions deploy binance-testnet-execution && supabase functions deploy binance-testnet-monitor && supabase functions deploy market-scanner && supabase functions deploy evaluate-signal-outcomes && supabase functions deploy telegram-send && supabase functions deploy telegram-test && supabase functions deploy telegram-orchestrator && supabase functions deploy intelligence-engine"
```

This script deploys only these real Edge Functions:

1. `binance-testnet-execution`
2. `binance-testnet-monitor`
3. `market-scanner`
4. `evaluate-signal-outcomes`
5. `telegram-send`
6. `telegram-test`
7. `telegram-orchestrator`
8. `intelligence-engine`

It does not deploy `_shared`, `telegram-router`, `intelligence-feed`, or any shared `.ts` file.

## 5. GitHub Actions workflow added/verified

Added `.github/workflows/deploy-supabase-functions.yml`.

Workflow behavior:

- runs on push to `main`,
- supports manual `workflow_dispatch`,
- installs dependencies with `npm ci`,
- runs `npm run check:edge-functions`,
- installs Supabase CLI with `supabase/setup-cli@v1`,
- deploys only the eight real Edge Functions using `--project-ref "$SUPABASE_PROJECT_REF"`.

## 6. Real functions that should appear in Supabase

After deployment from CLI/GitHub Actions, Supabase Functions should show:

- `binance-testnet-execution`
- `binance-testnet-monitor`
- `market-scanner`
- `evaluate-signal-outcomes`
- `telegram-send`
- `telegram-test`
- `telegram-orchestrator`
- `intelligence-engine`

## 7. Shared modules that should NOT appear as functions

These must remain shared modules only and must not be deployed as standalone Edge Functions:

- `_shared`
- `telegram-router`
- `intelligence-feed`
- `intelligence-engine.ts`
- `telegram-router.ts`
- `intelligence-feed.ts`
- any file under `supabase/functions/_shared`

## 8. Required GitHub/Supabase secrets

Configure these GitHub repository secrets before relying on automatic deployment:

- `SUPABASE_ACCESS_TOKEN`: Supabase personal access token used by the CLI in GitHub Actions.
- `SUPABASE_PROJECT_REF`: Supabase project reference, for example the project ref from the project URL.

Runtime Edge Function secrets are still managed separately in Supabase and must already be configured for each function's behavior, such as Supabase service role, Telegram, scanner, and provider credentials. This fix does not add or change runtime secret values.

## 9. Tests run

- `npm run check:edge-functions`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

## 10. Whether deployment should now succeed

Yes. Deployment should now succeed when run from the repository via `npm run deploy:edge-functions` or the GitHub Actions workflow, because the Supabase CLI bundles each real function with the repository's `supabase/functions/_shared` modules available.

Do not deploy these shared-module-dependent functions from the Supabase dashboard editor unless the dashboard deployment flow includes the same `_shared` files in the bundle context.
