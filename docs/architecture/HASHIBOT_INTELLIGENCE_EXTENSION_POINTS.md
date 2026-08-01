# HashiBot Intelligence Extension Points — Reservations Only

## Status and safety

Phase 11 reserves type contracts only. There are no agents, models, prompts, registries, factories, persistence implementations, background workers, coaching decisions, strategy changes, or runtime wiring. These reservations cannot execute and have no access to Supabase, providers, Telegram, HTTP, Cloud Run, Pub/Sub, or schedulers.

## Reserved agents

| Extension | Reserved input responsibility | Explicit non-capability in Phase 11 |
|---|---|---|
| Opportunity Intelligence Agent | symbols/timeframes and evidence-based probability assessment | no opportunity discovery or trading decision |
| Market Regime Agent | market evidence and regime assessment | no regime implementation or strategy switching |
| Strategy Performance Agent | certified outcomes/history references | no scoring or lifecycle mutation |
| Strategy Optimization Agent | current version and certified dataset reference | no parameter changes |
| Strategy Discovery Agent | research dataset reference and constraints | no strategy generation |
| Portfolio Allocation Agent | approved strategies/account exposure evidence | no allocation replacement or capital mutation |
| Strategy Governor | lifecycle and certification references | no enable/disable authority |
| Backtesting & Quant Research Agent | strategy/dataset/window references | no backtesting runtime |
| Prop Firm Intelligence Agent | account awareness and explicit challenge-rule facts | no coaching or execution influence |
| Telegram Enhancement Agent | facts plus summary/format/coaching/explanation mode | no message rewriting or sending |
| Knowledge & Memory Agent | typed query/proposal records | no memory store or truth authority |

## Prop-firm reservations

The prop-firm input can represent challenge rules, daily and maximum drawdown remaining, target remaining, minimum-day progress, general rule awareness, requested Telegram coaching, and probability/evidence context. It does not calculate these facts, coach a user, change risk, or send messages.

## Knowledge reservations

Knowledge kinds are strategy history, certification history, market memory, execution lessons, incident knowledge, and optimization history. Records carry references, truth versions, and evidence. `propose` deliberately returns a proposal identity rather than granting a truth write. Any future implementation must preserve Supabase authority, data retention, auditability, deletion, source lineage, and human/operator controls.

## Future admission gate

An intelligence implementation requires a later approved phase, threat/privacy review, deterministic fallback, evidence and probability calibration, prompt/model versioning, cost/rate controls, offline certification, hallucination containment, no direct provider mutation, and explicit authority rules. An interface reservation is not migration readiness or implementation.
