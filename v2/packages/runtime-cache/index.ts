import type { Candle, IndicatorSnapshot, Signal, TradeId } from '../types/index.js';
import type { Command } from '../../execution/command-queue/index.js';
export interface CandleCache { get(key:string): Candle[]|undefined; set(key:string,candles:readonly Candle[]): void }
export interface IndicatorCache { get(key:string): IndicatorSnapshot|undefined; set(key:string,snapshot:IndicatorSnapshot): void }
export interface ActiveSignalStore { get(signalId:string): Signal|undefined; put(signal:Signal): void; remove(signalId:string): void }
export interface ActiveTradeStore<T=unknown> { get(tradeId:TradeId|string): T|undefined; put(tradeId:TradeId|string, trade:T): void; remove(tradeId:TradeId|string): void }
export interface PendingCommandStore { get(commandId:string): Command|undefined; put(command:Command): void; remove(commandId:string): void }
export interface ExecutorHealthStore<T=unknown> { get(executorId:string): T|undefined; set(executorId:string, health:T): void }
export interface AdapterHealthStore<T=unknown> { get(adapterId:string): T|undefined; set(adapterId:string, health:T): void }
export interface ProtectionStateStore<T=unknown> { get(tradeId:string): T|undefined; set(tradeId:string, state:T): void }
export interface MarketFeedStateStore<T=unknown> { get(feedId:string): T|undefined; set(feedId:string, state:T): void }
