# X-F.5 end-to-end execution breakpoint audit

## Finding
Execution could still fail to produce observable provider attempts after X-F.4 even without a null `.id` crash.

## Breakpoints audited
- Signal creation: scanner inserts approved A/A+ crypto signals with ids and a provider-neutral `symbol_base` derived from the signal symbol.
- Auto-execution trigger: scanner now calls the provider-neutral execution function after signal insert without requiring stale scanner env flags to mirror DB execution settings.
- Global gates: execution function still enforces `execution_settings`, live-trading guard, kill switch, bot pause, and governor gates.
- Provider controls: router validates Binance and Bybit controls before provider tasks start.
- Symbol tradability: router checks `provider_symbol_cache`/fresh sync per provider and returns per-provider `missing_symbol_cache` instead of showing an unsupported provider as executable.
- Execution row creation: Binance and Bybit create `pending_submit` rows before exchange calls and return `execution_order_insert_failed` on insert failure.
- Order paths: Binance uses Binance USD-M testnet rules; Bybit now uses Bybit V5 linear USDT instrument rules instead of Binance symbol rules.
- UI proof: proof panel now distinguishes executable rows from research-only unsupported symbols and latest executions show provider/blocker/submitted-order columns.

## Why signals were not executing
The likely remaining breakpoint was the scanner auto-execution trigger: it required `TESTNET_ENABLED=true`, `EXECUTION_MODE=testnet`, and `EXCHANGE=binance_usdm_testnet` environment variables before even calling the execution function. That could silently block execution despite DB controls being valid. The DB-backed execution function is now the source of truth for these gates.
