# Professional Strategy Audit Report

## Audit question and assurance level

This repository-only audit asks: **what strategies can the active root scanner evaluate, what do they intend to do, and what contract do they currently expose to the rest of the trading lifecycle?** It is a static architecture audit, not live certification. No SQL, network deployment, database inspection, venue action, signal run, or customer/Telegram action was performed.

## Evidence boundary

Primary evidence is the active `market-scanner` registration and evaluator code and its imported `_shared` professional, indicator and Forex domain modules. The active scanner registers exactly:

- Crypto live: MicroScalper, QuickScalp, CompressionBreakout, SwingContinuation.
- Crypto research: CryptoTrendPullback, ReversalExhaustion.
- Forex live: ForexMicroScalper, ForexSwingContinuation.
- Forex/Gold research: London Breakout, New York Continuation, Forex Trend Pullback, Gold Volatility Breakout.

The scanner wraps all twelve through `ProfessionalStrategyRegistry`. Research entries have lifecycle `RESEARCH`, publication mode `SHADOW`, certification `RESEARCH`, and are removed before arbitration. This is a real safety boundary. Live entries are called `ENABLED` even when database configuration can disable them; registry publishability correctly also requires `config.enabled`.

## Current architecture

### Strengths

1. **Canonical identity exists.** Each registered strategy has an ID and version independent of the legacy display name.
2. **A normalized evaluation boundary exists.** The wrapper turns legacy candidate/rejection results into a market-neutral professional result with consistent decision, levels, evidence, diagnostics and expiry.
3. **Research isolation is explicit.** Shadow/research results cannot enter live arbitration through the current registry loop.
4. **Diagnostics retain rejections.** Evaluation counts, rejection reasons, runtime failures and symbol/timeframe coverage are tracked.
5. **Forex research has professional preflight.** Canonical instruments, closed-candle normalization, freshness/malformed checks, sessions, precision, spread eligibility and provider-budget eligibility are centralized.
6. **Evaluator failures are contained.** Runtime exceptions are normalized as no-trade errors rather than becoming candidates.

### Architectural findings

1. **The registry is an adapter, not yet a full strategy framework.** Live evaluators remain large functions inside the scanner; configuration, evaluation, qualification, arbitration and persistence are co-located.
2. **The result is not a complete trade plan.** It lacks configuration hash/version, market-data provenance, explicit invalidation thesis, order intent, sizing boundary, management intent, liquidity measurement, and end-to-end correlation.
3. **Metadata is constructed at runtime.** Supported markets/symbols/timeframes and lifecycle are not defined once in a manifest that tooling and documentation can validate.
4. **Configuration truth is multi-layered.** Database rows, loader fallbacks, evaluator fallbacks, and MicroScalper runtime overrides can disagree. Static audit cannot state the actual deployed parameter set.
5. **Qualification is distributed.** Some gates live inside evaluators, some in registry eligibility, some in scanner distance guards, some in market filters, and some in arbitration. Rejection normalization can collapse distinct reasons.
6. **Lifecycle after arbitration is shared but implicit.** Strategy-specific assumptions about partials, BE, trailing, time stops, and exit reporting are not versioned with the candidate.
7. **Live Forex and Forex research do not share one context standard.** Research strategies consume `ForexMarketContext`; live Forex evaluators use legacy helpers and therefore do not receive the same strong freshness/session/spread/provider preflight.
8. **Crypto liquidity and session/news context are upstream assumptions.** The professional result cannot prove the market was liquid or free from event risk at evaluation time.

## Inputs, outputs and ownership

The input contract includes candles, symbol, market, timeframe, a shared indicator snapshot and evaluated time. Crypto candles originate in Binance market-data paths; Forex candles originate in the Twelve Data path. The shared indicator surface is EMA20/50, ATR14, RSI14, range/extrema, volume/body, compression, momentum, volatility and regime. Evaluators also derive local structure and scores.

The output boundary provides enough information for candidate comparison and basic execution planning: direction, entry range, stop, two targets, RR, confidence, grade, expiry and evidence. It does not distinguish the strategy's **risk proposal** from the downstream account-risk decision, and the nested legacy payload means downstream code can still depend on non-canonical fields.

## Lifecycle assessment

| Lifecycle stage | Assessment |
|---|---|
| Candidate | Present; normalized identity/result wrapper exists. Provenance is incomplete. |
| Qualification | Present but scattered; no single gate ledger or policy version. |
| Arbitration | Present in scanner; deliberately unchanged. Candidate immutability needs certification. |
| Sizing | Downstream and shared; not represented in strategy contract. |
| Execution Plan | Downstream; strategy result is used as a partial plan but lacks venue/order semantics. |
| Execution | Separate Binance/Bybit/MT5 services; not modified or certified here. |
| Protection | Shared execution/monitor behavior; strategy-specific intent not versioned. |
| Management | Shared partial/BE/time-stop behavior exists elsewhere; ownership and policy lineage are incomplete. |
| Exit | Venue/monitor outcome paths exist; one canonical terminal-state proof is Phase 1B work. |
| Reporting | Diagnostics and analytics exist; correlation to every lifecycle event is incomplete. |
| Archive | Repository contains retention concepts; reproducible strategy/config/input lineage is incomplete. |

## Repository organization recommendation

Avoid a large refactor. Keep active runtime imports out of `v2/`. Add one active-root strategy domain only when Phase 1B can move code with parity tests:

```text
supabase/functions/_shared/strategies/
  contract.ts          # versioned plan/metadata types
  registry.ts          # eligibility, evaluation, diagnostics
  manifests.ts         # immutable identities and declared capabilities
  crypto/              # evaluators after parity extraction
  forex/               # live and research evaluators using one Forex context
  qualification/       # common gates/reason taxonomy
```

Initially, manifests can point to existing evaluator adapters. Do not relocate all evaluator logic in one change. Documentation belongs in this `docs/strategy-foundation/` directory; generated inventory validation may later compare manifests to these IDs.

## Phase 1A acceptance

- Every active registered strategy is inventoried and specified.
- Purpose, regime, edge, entry, exit, risk assumptions, dependencies and failure modes are recorded for all twelve.
- Lifecycle ownership and future unified contract are documented.
- Per-strategy and framework gaps are prioritized separately.
- No runtime file was changed. Consequently execution, arbitration, live signals, customer paths and external systems are unchanged.

