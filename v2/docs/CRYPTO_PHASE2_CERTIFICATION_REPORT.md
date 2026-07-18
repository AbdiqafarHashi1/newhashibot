# HashiBot V2 Phase 2 Crypto Certification Report

Repository-only certification completed on 2026-07-18. No deployment, SQL, cron, MT5, Forex, Google Cloud, or Telegram redesign changes were performed.

## Scanner

- The certified crypto scanner contract scans exactly 10 deterministic symbols: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, AVAXUSDT, LINKUSDT, and TONUSDT.
- Candle retrieval is provider-truth checked for each symbol/timeframe pair; empty candles, thrown provider errors, open candles, wrong market, wrong symbol, or wrong timeframe are reported as explicit scanner row reasons.
- Failed symbols are emitted as `FAILED` rows with `candleError`; rejected symbols carry human-readable rejection reasons and are not silently skipped.
- Timeframe mapping is fixed for the approved crypto strategies: MicroScalper `5m/15m`, CompressionBreakout `15m/1h`, and SwingContinuation `1h/4h`.

## Strategies

- Approved crypto strategy certification is scoped to MicroScalper, CompressionBreakout, and SwingContinuation.
- Certification reports evaluation count, candidate count, arbitration count, published signal count, rejection reasons, participation percentage, and status per strategy.
- SwingContinuation is now a crypto production strategy rather than being incorrectly registered under Forex, matching the crypto-only certification scope.
- Strategy participation is measured, not artificially equalized; a dead or suppressed strategy is flagged by certification stats instead of hidden.

## Paper Trading

- Stable `signal_id` and `paper_trade_id` helpers link every paper outcome back to the originating signal.
- Paper truth separates `Signal Created`, `Waiting Entry`, `Entered`, `Cancelled`, `Expired Unfilled`, `Time Stop Close`, `SL`, `TP1`, `BE`, `TP2`, `Manual Close`, and `Recovery Close`.
- An entered paper trade can no longer certify as an expired-unfilled trade; this is flagged as a truth error.
- Entered paper trades must close with a real close price before realized R is computed.

## Binance

- Existing exchange-provider tests certify Binance signing, symbol normalization, precision, minimums, balances, positions, open orders, open/cancel/protection commands, and adapter delegation without live network dependency.
- Execution adapter entry conversion now preserves TP1/TP2 from planner `takeProfits` arrays, preventing protection commands from losing take-profit truth.

## Bybit

- Existing provider tests certify Bybit signing, query ordering, symbol normalization, precision, minimums, balances, positions, open orders, open/cancel/protection commands, and adapter delegation without provider-specific hacks.
- The same adapter TP extraction fix applies provider-neutrally to Bybit because it is in the shared exchange-provider execution adapter.

## Protection

- Existing protection-engine tests verify complete native protection classification, missing SL/TP repair, break-even, trailing stop, profit lock, orphan detection, manual close detection, manual SL/partial-close persistence, recovery command enqueue, and provider-neutral behavior.
- Protection state persists expected SL/TP/quantity, actual SL/TP/quantity, verification attempts, exchange acknowledgements, repair state, and missing-protection reasons.

## Reporting

- Scanner, strategy, paper-trade, execution, and protection truth now have deterministic certification outputs suitable for manual reporting.
- Reports must continue to consume these truth records rather than inferred wins, losses, or expiries.

## Known Remaining Issues

- This certification is repository-level and fixture-based; live/manual exchange dry-runs against real Binance testnet and Bybit demo credentials are still required before trusting unattended capital.
- The repository still contains broader research/demo crypto strategies, but this phase's approved crypto certification gate is intentionally restricted to MicroScalper, CompressionBreakout, and SwingContinuation.
- No SQL migrations were added in this phase, so any database schema enforcement for paper-trade IDs must be handled in a later explicitly-approved SQL phase.

## Recommended Fixes Before Professional Telegram

1. Run manual scanner certification against Binance testnet and Bybit demo candle providers and archive the generated report.
2. Run a manual paper-trade replay and verify no entered paper trade ends as `Expired Unfilled`.
3. Run one manual Binance testnet lifecycle and one manual Bybit demo lifecycle from signal through protection and close.
4. Only after those manual runtime proofs pass, wire Professional Telegram to the certified truth outputs.

## Ready / Not Ready for Professional Telegram

**Status: Ready for repository-level Professional Telegram integration, but not ready for unattended live capital.**

The crypto engine now has repository-level certification gates for scanner truth, approved strategy participation, paper-trade outcome truth, shared Binance/Bybit execution adapter TP truth, and protection verification. Manual provider dry-runs remain the final operational prerequisite.
