# Work period 3: Micro and Momentum Scalpers

Status: both implemented as independently instantiable, demo-only research engines; targeted functional tests pass. Not yet daemon-integrated, historically evaluated, provider-certified or profitability-qualified. No existing catalog, live account, scanner, Telegram route or risk setting was changed.

## Distinct entry mechanisms

| Engine | Execution/context | Entry models | Management defaults |
| --- | --- | --- | --- |
| `gold.turbo-micro-scalper` | Local 5s/15s ticks, M1 execution, M5 closed context | Persistent micro burst; resumption after a counter candle; support/resistance or failed-break rejection | 120s holding ceiling, small ATR-scaled target, early invalidation, rapid profit trailing |
| `gold.turbo-momentum-scalper` | Configurable M1 or M5 execution, M15 closed context | Strong completed candle followed by a live break; compression followed by developing directional expansion | 15min holding ceiling, larger ATR-scaled target, exhaustion/chase rejection, dynamic trailing and observed-fill-dependent partial capture |

These are two distinct families, not parameter variants of the same trigger. They may legitimately qualify on the same movement; future arbitration must recognize overlapping opportunities rather than count them as diversification. No opportunity quota is imposed. Defaults are uncalibrated research hypotheses, not measured optimal parameters or promised returns.

## Shared decision and management boundary

`strategy_contracts.py` provides immutable research decisions and protected proposed plans, strategy/model/opportunity lineage, acceptance/rejection reasons and feature evidence. Reference entry uses ask for long and bid for short. Proposed exits use executable-side quote geometry, price-tick rounding, and explicit commission/slippage assumptions. The exact rounded plan must retain positive net reward and meet configurable reward/risk and stop-distance thresholds. ATR targets are proposed price objectives, not probabilistic forecasts of attainable reward.

Known `ExecutionCosts` inputs are required. Missing costs, stale/future or mixed-clock evidence, spread spikes, shocks, insufficient context, excessive chase and incompatible direction can reject entry. The micro engine does not wait for all 30s features or every indicator; the momentum engine can use a fresh observed candle break without requiring micro burst history. Their necessary data differs intentionally.

Evaluation does not open a position. Continuing setup observations keep a deterministic episode identity. Explicit `record_admission` feedback consumes it, enforces a re-entry cooldown and rejects repeated admission. A fresh qualified setup after a neutral observation can re-enter. This bounded in-memory lifecycle is not a replacement for durable authorization, order idempotency, active-position checks, restart recovery or shared account risk in period 6.

`management.py` returns requests for full closure, partial closure or tighter protection, not orders or claimed fills. It handles stop/target crossing, time limits, structural invalidation, adverse momentum failure, volatility shock and trailing-profit retracement. Stops never move backward relative to the observed broker stop. Protection takes priority over partial capture; partial and stop fields change only when the caller supplies observed provider feedback. Stale quotes cannot produce a profit valuation or stop update. A timeout can request closure despite missing quotes, but the eventual adapter must obtain a current executable quote and reconcile the result.

Cost reserves and marked net movement are scenario estimates in XAUUSD quote-price units, not actual realized basket/customer P&L. Account-currency conversion, volume/margin rules, account authorization, minimum executable lots and actual fills remain separate integration responsibilities. No local capital amount, order count, averaging, martingale or live permission is introduced here.

## Files and use

- New: `mt5-agent/gold_turbo/{strategy_contracts.py,micro.py,momentum.py,management.py}`.
- Package exports expose `MicroScalper`, `MomentumScalper`, their configurations, `ExecutionCosts`, `PositionObservation` and `manage_position`.
- `evaluate(snapshot, costs, now_ms)` returns a candidate or explicit `NO_TRADE` decision. `record_admission(decision, at_ms)` is explicit reservation feedback, not broker authorization.
- No daemon wiring or public/admin promotion yet. Existing sixteen reviewed configurations are untouched. All five new Turbo engines remain in scope.

## Verification

```bash
PYTHONPATH=mt5-agent python3 -m unittest discover -s mt5-agent/tests -p 'test_gold_turbo*.py' -q
python3 -m compileall -q mt5-agent/gold_turbo
git diff --check
```

66 targeted tests pass: the previous 41 intelligence tests plus 25 entry/management tests. New checks cover both directions for burst/pullback/rejection/continuation/compression models; M5 momentum selection; unfavorable cost and rounded-price scenarios; stale/shock/context/chase rejection; stable identities, repeated admission and re-entry; long/short protected geometry; expiry, trailing, partial-fill feedback, early failure and scope isolation.

All entry/management fixtures are synthetic correctness examples, not real trade opportunities or backtest evidence. No raw market download, historical optimization, full-repository suite, remote activation or live order was performed. Integration and historical evaluation are still required before demo readiness or any profitability claim.

## Next: number 4

Implement distinct Range and Trend engines using the same intelligence and research-decision contracts. Preserve these two baselines. Reuse the management boundary where appropriate, keeping the five entry mechanisms distinct. Basket management and shared account authorization remain periods 5-6; admin selection is period 7.
