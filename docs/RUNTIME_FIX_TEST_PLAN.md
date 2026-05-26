# Runtime Fix Test Plan

1. Set `FOREX_DATA_PROVIDER=twelvedata` and set `TWELVEDATA_API_KEY` (or `FOREX_DATA_API_KEY`).
2. Open Provider Health and run **Test Forex Provider**.
3. Run **Run One Scan Now** from Control Room.
4. Verify forex candles/signals are `REAL DATA` when TwelveData succeeds.
5. If `FOREX_DEMO_FALLBACK=true`, verify fallback rows are labeled `DEMO DATA`.
6. Enable schedule and invoke `scheduled-market-scanner`.
7. Verify `scanner_runs.run_type='scheduled'` and heartbeat updated.
8. Run `evaluate-signal-outcomes`.
9. Verify signal status transitions for TP/SL/active/expired.
10. Verify `signal_updates` rows are created for transitions.
11. Verify Telegram delivery exists once per lifecycle event.
12. Verify duplicate Telegram update attempts are blocked/logged.
