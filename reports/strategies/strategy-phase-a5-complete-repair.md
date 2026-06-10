# Hashibot Strategy Phase A.5 — Complete Repair + Arbitration Semantics

Date: 2026-06-10

## 1. What Phase A already changed

Phase A introduced the shared scanner/backtest/outcome instrumentation needed for controlled strategy repair:

- Market-aware arbitration context and role-fit scoring.
- Expiry classification vocabulary instead of treating all expiries as equal.
- Candidate-level arbitration diagnostics.
- Backtest Lab expiry classification parity.
- A safety report confirming no Binance execution changes.

## 2. What Phase A did not fix

Phase A did not finish three important items:

1. It added market-aware arbitration, but mixed-market handling was still only a soft penalty. In very noisy regimes, the scanner could still choose a non-A+ candidate instead of choosing no trade.
2. It did not encode strategy-specific repairs for the dominant code-level weaknesses visible from the new diagnostics: stale/late breakouts for CompressionBreakout and loose quality reclaim/chop acceptance for SwingContinuation.
3. It did not add freshness as an explicit arbitration factor, even though freshness is part of expected value for scalps and breakouts.

Live production counts were not available inside this local container, so Phase A.5 applies only repairs that were directly supported by code-path evidence and the diagnostic fields already being recorded. No broad loosening was performed.

## 3. Exact MicroScalper bottleneck and repair

### Bottleneck

MicroScalper's proven Phase A.5 bottleneck was arbitration semantics, not evaluator looseness. The scanner already evaluates MicroScalper independently and records its candidate before arbitration. The risk was that a qualified fresh scalp could be down-ranked in mixed regimes without a dedicated freshness component.

### Repair

- Added `strategyFreshnessScore()` for MicroScalper using low EMA overextension, absence of chase risk, and short-term momentum context.
- Added freshness to `arbitrationScore()` so fresh, non-overextended MicroScalper A/A+ setups compete more fairly against slower strategies.
- Did **not** change MicroScalper score, RR, distance, RSI, momentum, or body gates.

## 4. Exact CompressionBreakout bottleneck and repair

### Bottleneck

CompressionBreakout already had compression, breakout, and ATR-expansion gates, but it lacked a late-breakout/exhaustion check. That is a code-level explanation for fakeout/expiry risk: a breakout that is already too far from the box can pass if raw expansion and score remain acceptable.

### Repair

- Added `breakout_freshness_score` and `late_breakout_penalty`.
- Added `late_breakout_exhausted` rejection only when the breakout is beyond the configured late threshold **and** momentum/expansion do not justify chasing.
- Kept participation alive for strong late breakouts by making the rejection conditional rather than globally widening/locking the breakout gate.
- Mirrored the late-breakout check and score penalty in Backtest Lab.

## 5. Exact SwingContinuation bottleneck and repair

### Bottleneck

SwingContinuation's weakest code path was loose continuation approximation through `reclaimByQuality`, especially for A-grade candidates. A non-strict reclaim could pass from score quality alone, which could let weak continuation setups compete too strongly in noisy markets.

### Repair

- Tightened `trendQualityPass` so quality-based trend acceptance requires stronger slope/spread and lower chop.
- Tightened `reclaimByQuality` with stronger pullback, momentum, trend, EMA slope, and chop requirements.
- Added `strict_reclaim_required_for_A`: quality-only reclaim can no longer produce ordinary A-grade continuation signals; it must be strong enough for A+.
- Added `chop_continuation_risk` to reject sub-A+ SwingContinuation candidates in high chop.
- Mirrored chop-risk rejection in Backtest Lab.

## 6. Arbitration semantics confirmation

Confirmed correct flow after Phase A.5:

1. MicroScalper evaluates independently.
2. CompressionBreakout evaluates independently.
3. SwingContinuation evaluates independently.
4. All evaluator outputs are inserted into `strategy_candidates` before arbitration decisions.
5. Passing candidates enter arbitration.
6. Arbitration chooses one best signal only after all candidates exist.
7. Losing candidates are retained with clear arbitration/no-trade reasons.

Arbitration now considers:

- market regime fit
- strategy role fit
- grade
- score
- RR
- freshness
- overextension/chase risk
- mixed-market/no-trade protection
- expected value

## 7. Proof each strategy can still produce candidates independently

The scanner builds `allEvals` first, then calls `evaluateStrategy()` independently for each enabled strategy. Candidate rows are inserted for every evaluation before distance guard and arbitration processing. Phase A.5 does not add any market-regime pre-filter before these evaluator calls.

This means arbitration cannot prevent MicroScalper, CompressionBreakout, or SwingContinuation from producing and recording a qualified candidate. Arbitration can only decide which already-produced candidate becomes the signal.

## 8. Expected frequency impact

- MicroScalper: no forced frequency increase, but fresh qualified scalps should lose less often to slower strategies when short-term momentum is the better role fit.
- CompressionBreakout: slightly fewer stale/late breakouts; fresh breakouts should continue to participate.
- SwingContinuation: lower frequency in noisy/choppy regimes, especially for non-A+ continuation approximations.

No hardcoded per-strategy trade quota, daily cap, or frequency target was added.

## 9. Expected expiry impact

- Fewer CompressionBreakout expiries caused by late/chased breakouts.
- Fewer SwingContinuation expiries caused by weak reclaim, chop, or loose continuation structure.
- Better post-reset attribution because live expiries now include `expiry_cause=<bucket>` and evaluator response evidence.

## 10. Backtest parity changes

### Scanner changes

- CompressionBreakout now records breakout freshness and rejects/penalizes exhausted late breakouts.
- SwingContinuation now tightens quality-based reclaim and sub-A+ chop acceptance.
- Arbitration now uses freshness and can choose no trade in unclear mixed/choppy regimes unless an A+ candidate exists.

### Backtest changes

- CompressionBreakout Backtest Lab logic now rejects exhausted late breakouts and applies a late-breakout score penalty.
- SwingContinuation Backtest Lab logic now rejects high-chop sub-A+ continuation candidates.
- Expiry-cause metrics from Phase A remain in Backtest Lab.

### Parity impact

The live scanner and Backtest Lab now share the same adopted behavioral themes: late breakout caution for CompressionBreakout, stricter continuation quality/chop handling for SwingContinuation, and explicit expiry-cause reporting. Backtest Lab remains a browser approximation and does not execute Supabase Edge Function code directly.

## 11. Rollback instructions

1. Revert the Phase A.5 commit.
2. If needed, also revert the prior Phase A commit.
3. Redeploy `market-scanner` and `evaluate-signal-outcomes` Edge Functions.
4. Rebuild/redeploy the frontend if Backtest Lab rollback is required.
5. Reset trading history only if a clean measurement window is desired; rollback itself does not require reset.

## 12. Confirmation no hardcoded frequency caps were added

Confirmed. No hardcoded MicroScalper cap, strategy quota, daily target, or fixed number of signals was added. Market quality still determines participation.

## 13. Confirmation protected systems were untouched

Confirmed untouched:

- Binance execution
- Binance monitor
- TP/SL placement engine
- Telegram delivery engine
- reset logic
- live trading controls
- governor behavior
- customer/product pages
