# Prompt 2 — Automated Strategy Qualification

## Status

**PROMPT 2 STATUS: PASS.** The Backtest Lab now runs bounded, deterministic strategy qualification campaigns over Prompt 1 canonical pipeline evidence. Campaigns produce research candidates and versioned eligibility sets; they never mutate a production, live, or frozen forward configuration and never grant `PRODUCTION_APPROVED` automatically.

## Calibration engine and registry

Every canonical registry strategy has an explicit safe research registry. It exposes only formula parameters genuinely consumed by that evaluator, separately from candidate minimum score and account risk execution-policy parameters. Arbitrary internals are not exposed. Each entry defines its type, reference, minimum, maximum, step, discrete values, safe range, and `productionMutationAllowedAutomatically: false`.

Search supports deterministic `GRID`, `RANDOM_SEEDED`, and `LATIN_HYPERCUBE`. Variants receive new research config IDs and versions. The reference input is copied, never mutated.

## Progressive qualification

Each variant starts with a real raw-bar `runCandidatePipelineReplay`. It progresses through:

1. IS screening
2. chronological OOS
3. walk-forward OOS windows
4. execution-cost stress
5. deterministic Monte Carlo
6. decision-time regime concentration
7. candidate-level portfolio evidence
8. `FULL_PROP_PIPELINE_REPLAY` when required by policy
9. funded survival when required by policy

Failed variants stop immediately. Every variant retains its stage reached, completed stages, elimination reasons, thesis diagnostics, canonical pipeline run hash, and evidence summaries. Expensive later stages do not run for configurations already eliminated.

## Research score and overfit safety

`RESEARCH SCORE` is a configurable weighted composite of OOS expectancy, OOS profit factor, walk-forward consistency, return/drawdown, parameter stability, stress and Monte Carlo resilience, portfolio robustness, historical Prop evidence, funded survival, cost sensitivity, and sample size.

Penalties cover IS/OOS divergence, fragile neighboring parameter variants, low samples, regime concentration, symbol concentration, stress sensitivity, drawdown tails, unstable walk-forward behavior, and poor Prop/funded outcomes. Raw profit cannot independently select the winner. Policies and weights are versioned and may differ between Personal and Prop qualification.

## Failure and thesis review

`NO_ROBUST_CONFIGURATION_FOUND` is a normal campaign outcome. The engine does not expand bounds or keep searching until it finds profit. Diagnostics include low sample, negative IS/OOS expectancy, weak OOS PF, unstable walk-forward, cost sensitivity, Monte Carlo tail risk, regime/symbol dependency, fragile parameters, and poor Prop survival. Changing strategy thesis or formulas requires a separate strategy version.

## Qualified strategy sets

Frozen campaign outputs use:

- `FOREX_PERSONAL_QUALIFIED_SET`
- `FOREX_PROP_QUALIFIED_SET`
- `CRYPTO_PERSONAL_QUALIFIED_SET`
- `CRYPTO_PROP_QUALIFIED_SET`

Each entry binds strategy/version, research config/version, exact pinned strategy parameters, qualification status, supported symbols/timeframes, canonical run IDs, certification date, and research-policy version. `AUTO_QUALIFIED_SET` is regenerated from campaigns satisfying the requested product and policy version. Execution routing never resolves these values from mutable defaults.

## Prop versus Personal

Personal and Prop policies are independent. Prop policy can require Prompt 1 full pipeline replay plus a successful two-step/custom challenge and funded survival; ordinary profitability is insufficient. Crypto Prop campaigns use an explicitly supplied compatible profile and do not inherit FTMO/MT5 assumptions automatically.

## Forward freeze and mutation safety

Only a `FORWARD_VALIDATION_CANDIDATE` may be frozen. The immutable handoff contains strategy/config versions, exact parameters, symbols/timeframes, risk/capital policies, execution model, research evidence, policy version, qualified-set version, and approval timestamp. Recalibration creates a new research config version; it cannot alter a frozen or production config.

## UI and persistence

The existing Research & Strategy Validation workspace now exposes **CALIBRATE**, **RUN QUALIFICATION CAMPAIGN**, **RUN FULL VALIDATION**, **COMPARE VARIANTS**, and **FREEZE FORWARD CANDIDATE**. Operators choose Personal/Prop policy, deterministic search method, and bounded variant count. Visible state is `QUEUED`, `RUNNING`, `COMPLETED`, or `FAILED`, and the results table shows real stages, scores, elimination reasons, and survivors.

Campaign summaries are persisted to `backtest_runs` with the campaign/policy hashes, bounded parameters, stages, diagnostics, scores, pipeline run references, and qualified set. Large candle paths and duplicated completed-trade payloads are not copied into campaign persistence.

## Boundaries for Prompt 3

Prompt 2 does not alter onboarding, customers, production routing, live configurations, or account UI. A qualified set is research/forward evidence only. Explicit forward validation and later controlled approval remain required before any production use.

## Formula-parameter calibration follow-up

Qualification now separates frozen strategy-formula parameters from research execution-policy parameters. Each of the six canonical Forex, metals, and crypto evaluators consumes only its bounded registered parameters; invalid relationships are rejected before evaluation. Neighboring formula configurations contribute to the robustness penalty (`FRAGILE_PARAMETER_REGION`). Qualified sets and forward-validation freezes carry exact strategy parameters rather than resolving mutable defaults later. Production mutation remains disabled.
