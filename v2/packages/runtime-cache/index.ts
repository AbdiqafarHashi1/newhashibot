import type { Candle, IndicatorSnapshot, Signal, TradeId } from '../types/index.js';
import type { Command } from '../../execution/command-queue/index.js';
export interface CacheStore<T> { get(key:string): T|undefined; set(key:string,value:T): void; delete(key:string): boolean; list(): T[]; clear(): void }
class InMemoryStore<T> implements CacheStore<T> { private data = new Map<string,T>(); constructor(private readonly maxItems = 1000) {} get(key:string):T|undefined{return this.data.get(key)} set(key:string,value:T):void{ if(!this.data.has(key) && this.data.size >= this.maxItems){ const oldest=this.data.keys().next().value; if(oldest) this.data.delete(oldest); } this.data.set(key,value)} delete(key:string):boolean{return this.data.delete(key)} list():T[]{return [...this.data.values()]} clear():void{this.data.clear()} }
export interface CandleCache extends CacheStore<Candle[]> { append(key:string,candle:Candle): void }
export class InMemoryCandleCache extends InMemoryStore<Candle[]> implements CandleCache { constructor(maxKeys=500, private readonly maxCandlesPerKey=1000){ super(maxKeys) } append(key:string,candle:Candle):void{ const candles = [...(this.get(key) ?? []), candle].slice(-this.maxCandlesPerKey); this.set(key,candles); } }
export interface IndicatorCache extends CacheStore<IndicatorSnapshot> {}
export class InMemoryIndicatorCache extends InMemoryStore<IndicatorSnapshot> implements IndicatorCache {}
export interface ActiveSignalStore extends CacheStore<Signal> { put(signal:Signal): void; remove(signalId:string): void }
export class InMemoryActiveSignalStore extends InMemoryStore<Signal> implements ActiveSignalStore { put(signal:Signal):void{this.set(signal.signalId,signal)} remove(signalId:string):void{this.delete(signalId)} }
export interface ActiveTradeStore<T=unknown> extends CacheStore<T> { put(tradeId:TradeId|string, trade:T): void; remove(tradeId:TradeId|string): void }
export class InMemoryActiveTradeStore<T=unknown> extends InMemoryStore<T> implements ActiveTradeStore<T> { put(tradeId:TradeId|string, trade:T):void{this.set(String(tradeId),trade)} remove(tradeId:TradeId|string):void{this.delete(String(tradeId))} }
export interface PendingCommandStore extends CacheStore<Command> { put(command:Command): void; remove(commandId:string): void }
export class InMemoryPendingCommandStore extends InMemoryStore<Command> implements PendingCommandStore { put(command:Command):void{this.set(command.id,command)} remove(commandId:string):void{this.delete(commandId)} }
export class InMemoryExecutorHealthStore<T=unknown> extends InMemoryStore<T> {} export class InMemoryAdapterHealthStore<T=unknown> extends InMemoryStore<T> {} export class InMemoryProtectionStateStore<T=unknown> extends InMemoryStore<T> {} export class InMemoryMarketFeedStateStore<T=unknown> extends InMemoryStore<T> {}
export type ExecutorHealthStore<T=unknown> = CacheStore<T>; export type AdapterHealthStore<T=unknown> = CacheStore<T>; export type ProtectionStateStore<T=unknown> = CacheStore<T>; export type MarketFeedStateStore<T=unknown> = CacheStore<T>;
export const candleCacheKey = (market:string,symbol:string,timeframe:string) => `${market}:${symbol}:${timeframe}`;
