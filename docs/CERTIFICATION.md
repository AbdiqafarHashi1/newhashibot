# V2 Strategy Certification

## Purpose
No strategy reaches production until it graduates through the Research Lab.

## Required Stages
1. Replay validation.
2. Backtesting.
3. Walk-forward testing.
4. Optimization with overfit controls.
5. Monte Carlo analysis.
6. Parameter comparison.
7. Shadow mode.
8. Certification decision.
9. Production performance tracking.

## Certification Evidence
Each certified strategy must preserve version, parameters, data period, market, assumptions, performance metrics, risk metrics, failure modes, and approval history.

## Production Rule
Strategies never execute trades directly. Certified strategies may only produce candidates for HashiCore arbitration.
