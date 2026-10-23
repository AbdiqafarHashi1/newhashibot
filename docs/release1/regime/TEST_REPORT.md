# Rebuild verification — 23 October 2026

- Full92 selected local repository test commands: **92 passed, zero failed**; commands, durations, output tails and log hashes in [test-results.json](test-results.json).
- `npm run test:release1`: passed. Adds real development fixtures and semantic tests for regime routing, malformed/stale/open/gapped data, shock rejection, incomplete higher timeframes, version/symbol restrictions, excessive costs, approved-registry parity, disabled publication, and stage refusal before held-out prices are loaded.
- `npm run typecheck`, `npm run typecheck:cloud`: passed.
- `npm run check:edge-bundles`:38 passed, zero failed. This does not execute external runtime imports.
- `npm run lint`: zero errors,27 existing warnings.
- `npm run build:web`: passed.
- Final development benchmark:9 complete configurations, **all rejected**. This is a failed research gate, not a software-test failure.
- Production security audit refresh: `npm audit --omit=dev --audit-level=moderate --fetch-timeout=15000 --fetch-retries=0` now **passed with zero vulnerabilities**. Earlier candidate GitHub verification failed on an npm registry timeout after build/types/release1 tests passed. The workflow now runs ordinary checks before the mandatory audit, disables only the redundant install-time audit, and bounds audit network retries; an unavailable audit still fails the job.

No new database migration, production deployment, provider charge or trading activation occurred. Browser and native PostgreSQL15/17 evidence from the preceding candidate remains in the main release report; this iteration does not claim a new live-platform check. Final GitHub check status is reported in PR#269.
