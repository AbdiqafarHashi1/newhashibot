# Bybit Adapter — Phase X-D

Date: 2026-06-15

## Summary

`ExchangeProviderBybit` implements the X-C `ExchangeProvider` contract for Bybit testnet only. It uses Bybit V5-style signed REST requests and refuses non-testnet base URLs.

## Implemented capabilities

- Account: `getAccountState`, `getBalances`, `getPositions`, `getOpenOrders`
- Execution: `placeEntry`, `cancelEntry`, `closePosition`
- Protection: `placeSL`, `placeTP1`, `placeTP2`
- Verification: `verifyProtection`, `classifyProtectionState`, `classifySafetyState`
- Recovery: `repairProtection`, `replaceSL`
- Reconciliation: `reconcilePosition`, `reconcileProtection`
- Profit Lock: `evaluateProfitLock`, `executeProfitLock`

## Safety rules

- Testnet-only: default REST base URL is `https://api-testnet.bybit.com`; live domains throw at construction time.
- Reduce-only protection and close orders are used for SL/TP/recovery/profit-lock actions.
- No scanner, arbitrator, strategy, Telegram, capital, or ranking logic was changed.

## Official documentation basis

Bybit V5 docs describe unified product category routing, `/v5/order/create` for order placement, `/v5/position/list` for positions, `/v5/order/realtime` for open orders, and testnet/demo domains. The adapter follows that V5 shape and keeps this phase isolated to testnet behavior.

## Validation evidence

`tests/execution/exchangeProviders.test.ts` verifies:

- live Bybit base URL rejection,
- account state mapping,
- testnet REST endpoint usage,
- reduce-only SL protection order submission,
- parallel router provider failure isolation,
- MT5 stub behavior.
