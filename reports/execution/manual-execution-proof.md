# X-F.4 manual execution proof

## Local proof status
The repository was hardened so `execute_latest_approved_signal` cannot dereference null insert IDs in the Binance or Bybit execution paths.

## Runtime proof requirement
A live Supabase Edge Function invocation requires deployed migrations/functions and valid project environment credentials. In this local container, no live Supabase project invocation was performed.

## Expected runtime outcome after deploy
- No `Cannot read properties of null (reading 'id')`
- Per-provider result includes success status or a named blocker
- Binance row creation is attempted independently
- Bybit row creation is attempted independently
- If exchange submission is blocked or fails, the execution row records the exact blocker/error
- Live trading remains disabled
