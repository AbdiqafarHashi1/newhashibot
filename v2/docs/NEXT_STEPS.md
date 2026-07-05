# NEXT_STEPS

Current V2 strategy layer is complete as a Research Ready candidate producer. It is not production certified.

Required before production:
1. Research Lab certification pipeline with historical datasets.
2. Backtest and walk-forward testing per symbol/timeframe/session.
3. Monte Carlo and regime sensitivity analysis.
4. Shadow-mode live observation with immutable candidate and rejected-setup records.
5. Performance review and approval gates before any `PRODUCTION_CERTIFIED` promotion.

Recommended next build prompt: implement Arbitrator + Risk Engine + Capital Manager + Immutable Signal approval flow, consuming `StrategyCandidate` objects without execution side effects.
