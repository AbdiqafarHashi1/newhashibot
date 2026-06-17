# X-F.5 auto-execution proof

## Scanner trigger
After a signal insert, the scanner calls the `binance-testnet-execution` Edge Function with `action="execute_signal"` and the inserted `signal_id`.

## Fix
The scanner no longer requires stale local env flags for `TESTNET_ENABLED`, `EXECUTION_MODE`, or `EXCHANGE` before calling execution. It only blocks on the live-trading env guard and missing internal Supabase URL/service-role configuration. The execution Edge Function remains responsible for DB-backed safety gates.

## Safety
This does not enable live trading. The execution function still asserts live trading is impossible and checks DB `live_trading_enabled=false`.
