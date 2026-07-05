import type { Command } from '../command-queue/index.js';
export interface AdapterHealth { status:'healthy'|'degraded'|'down'; message?:string; checkedAt:string }
export interface ExecutionAdapter { connect():Promise<void>; disconnect():Promise<void>; health():Promise<AdapterHealth>; heartbeat():Promise<AdapterHealth>; openPosition(command:Command):Promise<unknown>; modifyPosition(command:Command):Promise<unknown>; closePosition(command:Command):Promise<unknown>; partialClose(command:Command):Promise<unknown>; moveStopLoss(command:Command):Promise<unknown>; moveTakeProfit(command:Command):Promise<unknown>; startTrailing(command:Command):Promise<unknown>; cancelOrder(command:Command):Promise<unknown>; getPosition(positionId:string):Promise<unknown>; getOrders(accountId:string):Promise<unknown[]>; getBalance(accountId:string):Promise<unknown>; getSymbolInfo(symbol:string):Promise<unknown>; reconnect():Promise<void>; synchronize(accountId:string):Promise<unknown>; repair(command:Command):Promise<unknown> }
export { ExchangeProviderExecutionAdapter } from './provider-adapter.js';
export { BinanceExecutionAdapter } from './binance/index.js';
export { BybitExecutionAdapter } from './bybit/index.js';
export { Mt5ExecutionAdapter } from './mt5/index.js';
