# 06 Strategies Audit

## Audit stance
V2 is a standalone /v2 product. V1 is evidence and inspiration only; no V1 application code is modified by this audit. Classifications use KEEP, MODERNIZE, REWRITE, REMOVE, MERGE, MOVE, and DEFER.

## Key evidence reviewed
- V2 constitution documents in docs/.
- Vite/React application under src/.
- Supabase migrations and Edge Functions under supabase/.
- Execution tests under tests/.
- Deployment scripts under scripts/.

## Findings
- Strategy configs and candidates are represented in database/UI, and scanner logic contains strategy-like evaluation. Classification: MODERNIZE concepts, REWRITE runtime.
- V1 strategy set appears broader/hotfix-driven and not isolated through a certification pipeline.
- BacktestLab exists in admin UI, but V2 Research Lab must be isolated from production runtime and Supabase load.

## V2 strategy decision
- Crypto: MicroScalper, Compression Breakout, Trend Pullback, Reversal Exhaustion.
- Forex: London Breakout, Trend Pullback, New York Continuation, Swing Continuation.
- Require research, backtest, walk-forward, Monte Carlo, shadow, and certification records before production promotion.
