# Market Intelligence Engine

Status: implemented as a pre-arbitration opportunity layer inside `market-scanner`.

For each candidate context the scanner computes trend strength, momentum, volatility expansion/contraction, compression, breakout, chop/overextension risk, recent move %, expected move bucket, invalidation distance, risk quality, liquidity quality, strategy match, and opportunity score. These values feed arbitrator scoring and are stored with the signal arbitrator decision.
