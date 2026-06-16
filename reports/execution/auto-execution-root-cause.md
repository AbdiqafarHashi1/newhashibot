# Auto-execution root cause

## Root blocker

Approved scanner signals were inserted, but the scanner only invoked the execution Edge Function when Telegram delivery returned `sent`. If Telegram was skipped or failed, execution was marked `telegram_signal_not_sent` and the routing function was never called.

Exact source fixed:
- `supabase/functions/market-scanner/index.ts` now calls `tryAutoExecuteTestnet(sigData.id)` immediately after signal insertion, independent of Telegram delivery status.

## Blocker category

- `scanner_created_signal_but_never_called_execution`
- Secondary symptom: `execution_function_not_invoked`

## Binance gate

Binance execution is allowed only when:
- `execution_settings.execution_mode = 'testnet'`
- `execution_settings.testnet_enabled = true`
- `execution_settings.auto_execute_testnet = true` for non-manual routes
- `execution_settings.live_trading_enabled = false`
- provider row `execution_provider_controls.provider_name='binance'` has `enabled=true`, `entry_enabled=true`, `read_only=false`, `status='connected'`, and no provider kill switch.

## Bybit gate

Bybit execution is allowed only when:
- the same global testnet gates pass
- provider row `execution_provider_controls.provider_name='bybit'` has `enabled=true`, `entry_enabled=true`, `read_only=false`, `status='connected'`, and no provider kill switch
- Bybit health diagnostics pass using testnet credentials and V5 wallet/position/order endpoints.

## Fix summary

The scanner now invokes the execution route for every newly inserted approved signal. The execution function routes by `execution_provider_global_controls.parallel_mode_enabled`: parallel mode sends to Binance and Bybit; primary mode sends only to `primary_provider`. Provider failures are isolated and stored on each provider row.
