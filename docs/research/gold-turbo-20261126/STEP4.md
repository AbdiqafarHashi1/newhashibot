# Work period 4: Range and Trend Scalpers

Status: independently selectable Python research engines implemented and functionally tested. No historical performance, broker connectivity or profitability qualification is claimed. No existing sixteen-configuration catalog, live account, cloud worker or Telegram route was changed.

## Distinct entries

| Engine | Execution/context | Entry requirement | Planned management |
| --- | --- | --- | --- |
| `gold.turbo-range-scalper` | M1 or M5 execution; M5 regime context | A range classified from completed history, separated boundary touch/recovery episodes, then support/resistance rejection or a failed break returning inside | Target capped inside the observed range, structural invalidation, fast trailing, directional-regime exit, ten-minute default ceiling |
| `gold.turbo-trend-scalper` | M5 or M15 execution; established M15 trend | A real counter-direction pullback reaching EMA20 or a previously confirmed structure level, followed by a live resumption break | Structural invalidation, ATR trailing, observed-fill-dependent partial capture, trend/structure invalidation, 45-minute default ceiling |

Both support long and short. Research defaults are explicit and configurable; they are not optimized parameters or a demonstrated edge. No entry quota is imposed. A range middle, a genuine breakout outside the range, a standalone trend impulse without a pullback, and a late/chased trend resumption are rejected.

Range boundaries exclude the trigger candle. Reactions require recovery and configurable bar separation rather than counting every touch as independent. The target cannot be extended through the opposite boundary merely to satisfy reward/risk. A strict Range regime is required on the execution frame; unknown or strongly directional M5 context cannot justify fading it.

Trend permits ordinary primary-frame transitions during a pullback, but not opposite trend/confirmed swing structure. A structure pivot must have been confirmed before the pullback began to qualify as the retested level. Neither the current trigger nor a future pivot creates its own historical support.

## Reuse and protection

- Existing shared cost checks, bid/ask geometry, price rounding, immutable decisions, rejection diagnostics, expiry and admission cooldowns are reused.
- New engines also remember the last admitted structural anchor. Returning to an old rejection/pullback after a neutral observation cannot create another independent admission; a fresh structural episode is needed. This is research state, not a substitute for durable account/order idempotency in period 6.
- `propose` now accepts a structural target cap and optional regime-exit/early-failure policy. Micro and Momentum retain their original defaults and pass their existing tests.
- Shared management can exit Range on an observed directional regime and Trend on an opposite trend, range regime or opposite confirmed swing structure. Missing context is not fabricated into an exit signal; broker stops, targets, timeout, invalidation and quote-based protection continue to apply.
- Trend disables the micro-only five-second adverse-velocity exit so a normal short counter-move alone does not close an otherwise intact trend position. It retains hard stops, structural invalidation, shock exits and time limits.
- Partial and stop proposals remain unacknowledged until actual provider feedback. No broker fill or profit is invented.

## Targeted verification

```bash
PYTHONPATH=mt5-agent python3 -m unittest discover -s mt5-agent/tests -p 'test_gold_turbo*.py' -q
python3 -m compileall -q mt5-agent/gold_turbo
git diff --check
```

94 tests pass: 28 new Range/Trend tests plus all 66 previous tests. New checks cover both directions, both supported execution frames, reaction counting, failed versus genuine breakouts, range target bounds, previously confirmed structure, resumption/chase filtering, costs, stale/partial/gapped context, consumed structural anchors, fresh qualified re-entry/cooldowns, regime invalidation, profit trailing, partial feedback and trend survival through a micro counter-move.

These are synthetic correctness tests, not trading performance results. No downloads, optimization sweeps, full-repository suite, deployments or live orders were performed. Four of five entry engines are now implemented as research modules; none has been newly profitability-qualified by these functional tests.

## Next: number 5

Implement the flagship Adaptive Price-Action Basket Scalper and its coordinated research basket state. Reuse these four distinct entry families where appropriate while preserving explicit model attribution, shared original risk allowance, realized plus unrealized net basket accounting, bounded operational controls and reliable closure semantics. Existing MT5/authorization integration remains number 6, admin/adaptive assignment number 7, and historical baseline/improvement numbers 8-9.
