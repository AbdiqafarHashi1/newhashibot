# Binance Capability Audit — Phase X-C

Date: 2026-06-15

## Scope

This audit inventories Binance-specific execution/data paths so the bot can move from Binance-coupled execution toward `Scanner → Arbitrator → Signal → Exchange Router → Exchange Adapters`.

## Binance-specific implementation inventory

| Capability | Current location | Notes |
| --- | --- | --- |
| Entry execution | `supabase/functions/binance-testnet-execution/index.ts`; `src/lib/binanceTruthExecution.ts` | Binance USD-M testnet Edge Function owns order submission, duplicate gating, exchange truth, and execution row lifecycle. |
| Leverage setup | `supabase/functions/binance-testnet-execution/index.ts`; `src/lib/binanceTruthExecution.ts` | Testnet leverage is calculated from settings/governor/stress mode and applied in the Binance function. |
| Quantity sizing | `supabase/functions/binance-testnet-execution/index.ts`; `src/lib/binanceTruthExecution.ts` | Risk, capital basis, min/max/step precision, and TP quantity splitting are Binance-oriented. |
| Margin checks | `supabase/functions/binance-testnet-execution/index.ts`; `src/lib/binanceTruthExecution.ts` | USDT/USDC availability, margin fallback, supported-symbol checks, insufficient-margin reasons. |
| TP placement | `src/lib/binanceTruthExecution.ts`; `supabase/functions/binance-testnet-execution/index.ts` | Native conditional reduce-only take-profit orders. |
| TP1 placement | `src/lib/binanceTruthExecution.ts`; `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | TP1 quantity split, fill detection, partial-close state, BE/profit-lock transition. |
| TP2 placement | `src/lib/binanceTruthExecution.ts`; `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Runner quantity, native conditional verification, lifecycle close state. |
| SL placement | `src/lib/binanceTruthExecution.ts`; `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Native reduce-only stop and replacement stop handling. |
| Protection verification | `src/lib/binanceTruthExecution.ts`; `src/lib/binanceTestnetMonitor.ts` | `verifyNativeProtectionOpenOrders` and monitor protection truth checks validate SL/TP1/TP2. |
| Reconciliation | `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Syncs Binance position/order truth to execution rows. |
| Monitor | `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts`; admin UI `src/pages/admin/Execution.tsx` | 1-minute testnet monitor updates lifecycle, PnL, protection, stale/manual close states. |
| Recovery/self-heal | `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Detects missing/unsafe protection and attempts recovery/replacement actions. |
| Profit lock | `src/lib/binanceTruthExecution.ts`; `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Research + testnet action guardrails; never cancel old SL before verified replacement. |
| Balance/account state | `supabase/functions/binance-testnet-execution/index.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Fetches total margin/wallet, USDT/USDC, unrealized PnL, open position/order counts. |
| Position fetch | `supabase/functions/binance-testnet-execution/index.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Binance futures positions are the current source of execution truth. |
| Symbol validation/exchange info | `supabase/functions/binance-testnet-execution/index.ts`; `supabase/functions/market-scanner/index.ts` | Exchange info, precision, min qty/notional, and public kline symbol support remain Binance-specific. |
| Order status/fill handling | `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts` | Entry/conditional status, avg price, update time, TP/SL classification. |
| Lifecycle updates | `src/lib/binanceTestnetMonitor.ts`; `supabase/functions/binance-testnet-monitor/index.ts`; execution tables | Pending, submitted, filled, protected, partial, closed, stale, failed. |
| Performance calculations | `src/pages/admin/Performance.tsx`; execution rows | Previously labelled Binance execution performance; now labelled provider-aware execution performance with provider columns selected. |

## Extraction result

- Universal provider contract added in `src/lib/exchange/exchangeProvider.ts`.
- Binance adapter facade added in `src/lib/exchange/ExchangeProviderBinance.ts` and delegates to existing Binance helper behavior where the browser-safe helpers exist.
- Database provider columns are additive and backfilled from legacy Binance columns without deleting or renaming existing data.
- Admin execution UI now exposes provider selector/cards while keeping Binance as the only active adapter.

## Remaining Binance-coupled runtime surfaces

The Supabase Edge Function files still contain direct Binance HTTP signing/API calls. This phase adds the adapter foundation and DB/UI separation; the next step is to move the Edge Function HTTP client behind the same provider interface in the Deno runtime without changing behavior.
