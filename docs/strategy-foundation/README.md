# HashiBot Phase 1A — Professional Strategy Foundation

**Audit date:** 2026-07-26  
**Scope:** active root runtime only (`supabase/functions/market-scanner` and its `_shared` imports)  
**Change class:** documentation and architecture audit; no runtime, database, execution, customer, arbitration, signal, Telegram, or deployment change

This directory is the Phase 1A source of truth:

1. [Professional strategy audit report](professional-strategy-audit.md)
2. [Strategy inventory](strategy-inventory.md)
3. [Specifications for every discovered strategy](strategy-specifications.md)
4. [Lifecycle and future unified strategy contract](lifecycle-and-contract.md)
5. [Per-strategy gap analysis and Phase 1B priorities](gap-analysis-and-priorities.md)
6. [Phase 1B qualification taxonomy](phase-1b-qualification-taxonomy.md)
7. [Phase 1B lifecycle certification report](phase-1b-lifecycle-certification.md)
8. [Phase 1B completion report and Phase 1C handoff](phase-1b-completion-report.md)
9. [Phase 1C existing-risk-system audit](phase-1c-existing-risk-audit.md)
10. [Phase 1C provider-aware risk architecture](phase-1c-risk-architecture.md)
11. [Phase 1C Risk Engine UI/backend contract](phase-1c-risk-ui-contract.md)
12. [Phase 1C completion report and Phase 1D handoff](phase-1c-completion-report.md)
13. [Phase 1D current-capital audit](phase-1d-existing-capital-audit.md)
14. [Phase 1D capital-allocation architecture](phase-1d-capital-allocation-architecture.md)
15. [Phase 1D Capital UI/backend contract](phase-1d-capital-ui-contract.md)
16. [Phase 1D completion report and Phase 1E handoff](phase-1d-completion-report.md)
17. [Phase 1E existing-execution audit](phase-1e-existing-execution-audit.md)
18. [Phase 1E execution-planning architecture](phase-1e-execution-planning-architecture.md)
19. [Phase 1E Execution UI/backend contract](phase-1e-execution-ui-contract.md)
20. [Phase 1E completion report and Phase 1F handoff](phase-1e-completion-report.md)

## Scope boundary and method

The inventory was built by tracing the active scanner's imports, registration, eligibility, evaluation, distance-guard, arbitration, candidate, and signal paths. The abandoned `v2/` tree was deliberately excluded. Historical reports, migrations, UI labels, manual-signal labels, and browser backtest approximations are corroborating material, not evidence that a strategy participates in the active scanner.

“Current” below means what the repository can prove. Database-overridable values are identified as such; this audit did not query or alter the database. “Intended” describes the strategy's professional thesis without claiming the implementation enforces it.

## Executive conclusion

The active runtime contains **12 strategy definitions**: six configurable live-publishable legacy evaluators wrapped by the professional registry and six research/shadow definitions that cannot publish. Crypto has six definitions (four live, two research); Forex/Gold has six (two live, four research). The registry provides a useful normalization seam, but only the evaluation result is normalized. Strategy metadata, risk intent, lifecycle ownership, data-quality requirements, reporting, and protection policy remain split across evaluator code, scanner configuration, shared engines, and execution services.

Phase 1B should certify the existing end-to-end lifecycle without changing strategy economics: first freeze identity and configuration provenance, then introduce a versioned plan envelope at the evaluator/arbitrator boundary, then prove every downstream transition and terminal outcome.

## Phase 1F — provider execution adoption and protection

- [Exact adoption audit](phase-1f-execution-adoption-audit.md)
- [Adoption architecture](phase-1f-adoption-architecture.md)
- [Protection and recovery](phase-1f-protection-and-recovery.md)
- [Provider certification verdicts](phase-1f-provider-certification.md)
- [Operations and proof contract](phase-1f-operations-contract.md)
- [Completion report / Phase 1G handoff](phase-1f-completion-report.md)
