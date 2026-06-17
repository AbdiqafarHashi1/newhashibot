# X-F.4 null `.id` root cause

## Root cause
The provider-neutral manual action reached both provider paths, but both paths trusted Supabase insert/read calls to return a row and then dereferenced `.id` without validating `data`.

## Exact null-risk sites repaired
- Binance execution order insert used `.select("id").single()` and then `String((exec as { id: string }).id)`. If Supabase returned `data=null` because of RLS, insert failure, or a non-returning insert, this crashed before the exchange call.
- Bybit execution order insert used `.select("id").single()` and then `String((data as { id: string }).id)`. The same null result crashed Bybit independently.
- Skipped execution row creation used `.select("id").single()` and only optionally logged the ID, masking insert failures.

## Fix
A shared `insertExecutionOrderRow` helper now validates `error || !data?.id` and returns the named `execution_order_insert_failed` blocker instead of throwing a generic null `.id` error.
