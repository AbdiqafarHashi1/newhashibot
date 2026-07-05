# TRADING_BRAIN

The HashiCore Trading Brain begins where strategies end. It accepts `StrategyCandidate[]`, validates each candidate, arbitrates the batch, builds a `RiskPlan`, builds a `CapitalPlan`, and converts the approved candidate into an immutable signal.

## Pipeline
1. Candidate validation checks freshness, expiry, score, confidence, RR, market open state, forex sessions, trend quality, volatility, spread, and market regime.
2. Arbitrator rejects duplicate candidate fingerprints, duplicate symbols, duplicate strategy outputs, and conflicting directions, then scores viable candidates by strategy score, confidence, RR, regime, trend quality, volatility, liquidity, freshness, strategy weight, and reserved historical weight.
3. Risk Engine calculates ATR/structure stop, TP1, TP2, RR, volatility-adjusted max risk, and expected duration.
4. Capital Manager enforces portfolio rules and computes risk percentage, risk amount, allocation, quantity, notional, and exposure-after percentage for personal, prop, and signal-only modes.
5. Immutable Signal Engine freezes the approved signal, assigns a unique signal ID, version, timestamp, risk, RR, expected duration, research metadata, status, reasons, and content hash.

## Signal lifecycle
Allowed states are `Created`, `Validated`, `Arbitrated`, `Approved`, `Dispatched`, `Executed`, `Managed`, `Closed`, `Cancelled`, `Expired`, and `Rejected`. Illegal transitions throw synchronously.

## Event bus
The brain publishes candidate and signal domain events only. It does not publish execution events.
