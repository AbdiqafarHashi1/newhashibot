# Test report — 22 October 2026

Candidate branch: `release1-integration-20261021`. Production was not deployed or tested with real charges. Results are observed command exits, not a claim of exhaustive correctness.

| Command/check | Actual result | Scope |
|---|---|---|
| 92 repository `npm run test:*` commands | 92 passed, zero failing commands | Individual commands, durations, output tails and log hashes in [test-results.json](test-results.json); includes integration/negative paths, not 92 individual assertions |
| `npm run typecheck` | PASS | Application TypeScript |
| `npm run typecheck:cloud` | PASS | Portable cloud worker |
| `npm run typecheck:account-authorization` | PASS | Strict authorization dependency graph |
| `npm run lint` | PASS: 0 errors, 27 warnings | Existing hook/refresh warnings remain; no lint rules disabled |
| `npm run check:edge-bundles` | PASS | 38 Edge Function bundles; bundling is not a live Supabase smoke test |
| `npm run build` and `npm run build:web` | PASS | App plus server bundle; Netlify serves the frontend build |
| `npm run test:release1` | PASS | Publication qualification/Free secrecy/render snapshots/staleness; actual isolated SQL with mocked Daraja/Telegram; Whop envelope/source/cancellation/refund/dispute/outage fixtures |
| `npx playwright test -c playwright.release1.config.ts` | 2 passed | Desktop1440×1000 and phone390×844 Free → VIP → authentication/recovery surfaces |
| `npx playwright test -c playwright.owner-preview.config.ts` | 4 passed | Both viewports: route inventory/auth guards, simulated admin operations and research modes, scoped customer views, denied mutations/network, reset; no real login or save is fabricated |
| `npm run research:release1 -- <extracted-archive> /tmp/hashibot-strategy-results.json` | Completed 288 scenarios; NOT_CERTIFIED | [Strategy report](STRATEGY_CERTIFICATION.md), 1006 overall/regime rows; research rejection is a release blocker, not a test to disable |
| Native PostgreSQL15 and17 migration rehearsals | PASS, both unchanged and explicit compatibility chains | Isolated CI with real Auth platform image; existing production history still must be reconciled |
| Production dependency audit | PASS in GitHub verification | `npm audit --omit=dev --audit-level=moderate`; no runtime vulnerabilities reported at the verified head |
| Full development audit after nonbreaking fixes | 9 advisories: 3 moderate, 6 high | Development/build toolchain, including Vite/esbuild and Tailwind transitive dependencies; major updates require separate regression work |

## Independent GitHub execution

At engineering commit `630cef74b13e7b403e88b86bd679eb6750f9b7d3`, [Original SaaS checks](https://github.com/AbdiqafarHashi1/newhashibot/actions/runs/39711406545) completed successfully: verify, lint, release1-browser and exact-source artifact. Verification also runs Python MT5 agent tests, strategy tests, Phase I/L/M/P integration checks, admin surface audit and production dependency audit.

[Native isolated migration rehearsal](https://github.com/AbdiqafarHashi1/newhashibot/actions/runs/39711406592) passed PostgreSQL15/17, each with unchanged migrations and a separately labelled compatibility rehearsal. Fresh-install success does not establish that the inactive production database has no drift.

Local browser used Chromium153 at `CHROMIUM_PATH`, `LD_LIBRARY_PATH` for the bundled libraries and Playwright's standard webServer. Tests were run sequentially after build, without an evolving `dist` directory. Later candidate additions (transport error redaction, accessible research selectors, browser assertions and documentation) are tested locally and trigger the same CI on the final PR head. Consult the final PR checks for that head; links above identify the exact previously observed passing commit.

## Meaningful negative cases and limitations

The SQL/mock journey includes pending/verified/duplicate payment, wrong Telegram identity, bound admission, renewal and expiry/removal. Provider fixtures include tampered/mismatched lineage, partial/full refunds, disputes, cancellation, late events and outages. Publication tests reject unqualified/stale/invalid plans, leaking Free levels and missing source evidence. These tests do not require real payment credentials and do not weaken production sandbox rejection.

Preview onboarding intentionally has no genuine authenticated customer identity: save remains disabled. The browser test checks that restriction instead of manufacturing authorization. Real authenticated onboarding is covered at contract/SQL layers and still needs a live restored-platform journey.

A final local audit refresh hit an npm registry network timeout; it is not counted as a new passing audit. The production audit result above is the independently observed GitHub run.

Unverified: production Auth/mail configuration, existing deployed schema/data/RLS drift, actual Telegram permissions/delivery/restart recovery, reliable market/news feed uptime, installed cron receipts, live provider source evidence, recoverable production backup, customer analytics conversion and profitable unseen/forward strategy performance. No READY verdict follows from a passing build.
