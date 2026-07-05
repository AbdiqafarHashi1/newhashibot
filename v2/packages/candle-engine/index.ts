import { createEvent, type BaseEvent, type EventBus, type MarketTick } from '../events/index.js';
import type { Candle, CandleLifecycleState, CandleSourceMetadata, Market, Timeframe } from '../types/index.js';
import { candleCacheKey, type CandleCache } from '../runtime-cache/index.js';

export const SUPPORTED_CANDLE_TIMEFRAMES: Timeframe[] = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w'];
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m':60_000,'3m':180_000,'5m':300_000,'15m':900_000,'30m':1_800_000,
  '1h':3_600_000,'2h':7_200_000,'4h':14_400_000,'6h':21_600_000,'12h':43_200_000,'1d':86_400_000,'1w':604_800_000,
};

export type CandleInputKind = 'tick'|'trade'|'markPrice'|'ohlc';
export type LateTickPolicy='apply-to-recent-closed'|'drop';
export interface CandleEngineOptions { retentionLimit?:number; gapCandles?:boolean; lateTickPolicy?:LateTickPolicy; allowedClockDriftMs?:number; maxLateTickMs?:number; now?:()=>number }
export interface CandleEngineMetrics { candlesOpened:number; candlesUpdated:number; candlesClosed:number; averageBuildLatencyMs:number; gapCount:number; gapRecoveryCount:number; lateTickCount:number; droppedTickCount:number; warmupDurationMs:number; providerSynchronizationHealth:Record<string,'healthy'|'degraded'|'stale'> }
export interface WarmupRequest { market:Market; symbol:string; timeframe:Timeframe; candles:readonly Candle[]; provider:string }
export type CanonicalCandle = Candle & { lifecycleState:CandleLifecycleState; sequence:number; provider:string };
type MutableCandle = CanonicalCandle;
type Input = { kind:CandleInputKind; market:Market; symbol:string; provider:string; source:string; price:number; volume:number; exchangeVolume?:number; tickVolume?:number; occurredAt:string; receivedAt:string; event?:BaseEvent<'MarketTickReceived', MarketTick> };

const iso=(ms:number)=>new Date(ms).toISOString();
export const timeframeMs=(tf:Timeframe):number=>{ const ms=TIMEFRAME_MS[tf]; if(!ms) throw new Error(`unsupported timeframe ${tf}`); return ms; };
export const alignTime=(value:string|number, tf:Timeframe):number=> Math.floor((typeof value==='number'?value:Date.parse(value))/timeframeMs(tf))*timeframeMs(tf);
export const closeTimeFor=(openMs:number, tf:Timeframe):number=>openMs+timeframeMs(tf);
const engineKey=(m:Market,s:string,tf:Timeframe,p:string)=>`${p}:${candleCacheKey(m,s,tf)}`;
const cacheKey=(c:{market:Market;symbol:string;timeframe:Timeframe})=>candleCacheKey(c.market,c.symbol,c.timeframe);

export function validateCandle(c:Candle):void{
  const open=Date.parse(c.openTime), close=Date.parse(c.closeTime);
  if(!Number.isFinite(open)||!Number.isFinite(close)||close<=open) throw new Error('invalid candle timestamp ordering');
  for(const k of ['open','high','low','close','volume'] as const) if(!Number.isFinite(c[k]) || c[k] < 0 && k==='volume') throw new Error(`invalid candle ${k}`);
  if(c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||c.high<c.low) throw new Error('invalid candle OHLC');
  if(alignTime(c.openTime,c.timeframe)!==open) throw new Error('invalid candle timeframe alignment');
}

export class CandleEngine {
  private open = new Map<string,MutableCandle>();
  private closedOpenTimes = new Map<string,Set<string>>();
  private sequence = 0;
  private unsub?: () => void;
  private readonly metrics: CandleEngineMetrics = { candlesOpened:0,candlesUpdated:0,candlesClosed:0,averageBuildLatencyMs:0,gapCount:0,gapRecoveryCount:0,lateTickCount:0,droppedTickCount:0,warmupDurationMs:0,providerSynchronizationHealth:{} };
  constructor(private readonly bus: EventBus, private readonly cache: CandleCache, private readonly timeframes: Timeframe[] = SUPPORTED_CANDLE_TIMEFRAMES, private readonly options:CandleEngineOptions={}) {}
  start():void{ this.unsub = this.bus.subscribe('MarketTickReceived', (event) => this.onTick(event)); }
  stop():void{ this.unsub?.(); this.unsub = undefined; }
  getMetrics():CandleEngineMetrics{ return {...this.metrics, providerSynchronizationHealth:{...this.metrics.providerSynchronizationHealth}}; }
  current(market:Market,symbol:string,timeframe:Timeframe,provider='*'):CanonicalCandle|undefined{ return [...this.open.entries()].find(([k,c])=>(provider==='*'||k.startsWith(`${provider}:`))&&c.market===market&&c.symbol===symbol&&c.timeframe===timeframe)?.[1]; }
  async warmup(reqOrKey:WarmupRequest|string, legacyCandles?:Candle[]):Promise<void>{
    const started=(this.options.now?.() ?? Date.now());
    const req = typeof reqOrKey==='string' ? this.legacyWarmup(reqOrKey, legacyCandles ?? []) : reqOrKey;
    const sorted=[...req.candles].sort((a,b)=>Date.parse(a.openTime)-Date.parse(b.openTime));
    let prev:Candle|undefined;
    for(const raw of sorted){
      const c=this.canonicalClosed({...raw, market:req.market, symbol:req.symbol, timeframe:req.timeframe, source:raw.source || req.provider}, req.provider, 'warmup');
      if(prev && Date.parse(c.openTime)>Date.parse(prev.closeTime)) await this.recoverGap(prev as CanonicalCandle, Date.parse(c.openTime), req.provider, undefined);
      this.rememberClosed(c); this.cache.append(cacheKey(c), c); prev=c;
    }
    this.metrics.warmupDurationMs += (this.options.now?.() ?? Date.now())-started;
    await this.bus.publish(createEvent('WarmupCompleted' as never, { market:req.market, symbol:req.symbol, timeframe:req.timeframe, candles:sorted.length, provider:req.provider } as never, { source:'candle-engine' }) as never);
  }
  async flush(now:Date):Promise<void>{ for(const [key,c] of [...this.open]) if(Date.parse(c.closeTime)<=now.getTime()) await this.close(key,c,undefined,'timer'); }
  async processTrade(input:Omit<Input,'kind'|'receivedAt'> & { receivedAt?:string }):Promise<void>{ await this.process({...input, kind:'trade', receivedAt:input.receivedAt ?? input.occurredAt}); }
  async processMarkPrice(input:Omit<Input,'kind'|'volume'|'receivedAt'> & { receivedAt?:string; volume?:number }):Promise<void>{ await this.process({...input, kind:'markPrice', volume:input.volume ?? 0, receivedAt:input.receivedAt ?? input.occurredAt}); }
  private legacyWarmup(key:string,candles:Candle[]):WarmupRequest{ const [market,symbol,timeframe]=key.split(':') as [Market,string,Timeframe]; return {market,symbol,timeframe,provider:candles[0]?.source ?? 'warmup',candles}; }
  private async onTick(event: BaseEvent<'MarketTickReceived', MarketTick>): Promise<void> { const t=event.payload; await this.process({kind:'tick',market:t.market,symbol:t.symbol,provider:t.provider,source:t.source,price:t.price,volume:t.volume,exchangeVolume:t.exchangeVolume,tickVolume:t.tickVolume,occurredAt:t.occurredAt,receivedAt:t.receivedAt,event}); }
  private async process(input:Input):Promise<void>{ const start=this.options.now?.() ?? Date.now(); const drift=Math.abs(Date.parse(input.receivedAt)-Date.parse(input.occurredAt)); this.metrics.providerSynchronizationHealth[input.provider]=drift>(this.options.allowedClockDriftMs ?? 5000)?'degraded':'healthy'; for(const tf of this.timeframes) await this.apply(input,tf); const elapsed=(this.options.now?.() ?? Date.now())-start; const n=Math.max(1,this.metrics.candlesUpdated+this.metrics.candlesOpened); this.metrics.averageBuildLatencyMs=((this.metrics.averageBuildLatencyMs*(n-1))+elapsed)/n; }
  private async apply(input:Input,timeframe:Timeframe):Promise<void>{
    const openMs=alignTime(input.occurredAt,timeframe), key=engineKey(input.market,input.symbol,timeframe,input.provider), current=this.open.get(key);
    if(current && openMs < Date.parse(current.openTime)){ this.metrics.lateTickCount++; await this.handleLate(input,timeframe,openMs); return; }
    if(current && openMs >= Date.parse(current.closeTime)){ await this.close(key,current,input.event); await this.recoverGap(current, openMs, input.provider, input.event); }
    else if(!current){ const prev=this.latestClosed(input.market,input.symbol,timeframe,input.provider); if(prev) await this.recoverGap(prev, openMs, input.provider, input.event); }
    const existing=this.open.get(key);
    if(existing && existing.openTime===iso(openMs)){ this.update(existing,input); await this.bus.publish(createEvent('CandleUpdated' as never, existing as never, { source:'candle-engine', correlationId:input.event?.correlationId, causationId:input.event?.eventId }) as never); this.metrics.candlesUpdated++; return; }
    if(this.hasClosed(key, iso(openMs))){ this.metrics.droppedTickCount++; return; }
    const candle=this.create(input,timeframe,openMs); this.open.set(key,candle); this.metrics.candlesOpened++;
    await this.bus.publish(createEvent('CandleOpened' as never, candle as never, { source:'candle-engine', correlationId:input.event?.correlationId, causationId:input.event?.eventId }) as never);
  }
  private create(input:Input,timeframe:Timeframe,openMs:number):MutableCandle{ return { market:input.market,symbol:input.symbol,timeframe,openTime:iso(openMs),closeTime:iso(closeTimeFor(openMs,timeframe)),open:input.price,high:input.price,low:input.price,close:input.price,volume:input.volume,exchangeVolume:input.exchangeVolume,tickVolume:input.tickVolume ?? 1,source:input.source,provider:input.provider,isClosed:false,lifecycleState:'OPEN',sequence:++this.sequence,sourceMetadata:this.meta(input,1)}; }
  private update(c:MutableCandle,input:Input):void{ c.lifecycleState='UPDATING'; c.high=Math.max(c.high,input.price); c.low=Math.min(c.low,input.price); c.close=input.price; c.volume+=input.volume; c.exchangeVolume=(c.exchangeVolume??0)+(input.exchangeVolume??0); c.tickVolume=(c.tickVolume??0)+(input.tickVolume??1); c.sourceMetadata=this.meta(input,(c.sourceMetadata?.tickCount??0)+1,c.sourceMetadata?.firstTickAt); validateCandle(c); }
  private async close(key:string,c:MutableCandle,event?:BaseEvent<'MarketTickReceived',MarketTick>, source='candle-engine'):Promise<void>{ c.lifecycleState='FINALIZING'; await this.bus.publish(createEvent('CandleClosing' as never, c as never, { source, correlationId:event?.correlationId, causationId:event?.eventId }) as never); const closed={...c,isClosed:true,lifecycleState:'CLOSED' as const}; validateCandle(closed); this.cache.append(cacheKey(closed), closed); this.rememberClosed(closed); this.open.delete(key); this.metrics.candlesClosed++; await this.bus.publish(createEvent('CandleClosed', closed, { source, correlationId:event?.correlationId, causationId:event?.eventId })); }
  private async recoverGap(prev:CanonicalCandle, nextOpenMs:number, provider:string, event?:BaseEvent<'MarketTickReceived',MarketTick>):Promise<void>{ let t=Date.parse(prev.closeTime); if(t>=nextOpenMs) return; this.metrics.gapCount++; await this.bus.publish(createEvent('GapDetected' as never, { market:prev.market,symbol:prev.symbol,timeframe:prev.timeframe,from:prev.closeTime,to:iso(nextOpenMs),provider } as never, { source:'candle-engine', correlationId:event?.correlationId, causationId:event?.eventId }) as never); while(this.options.gapCandles!==false && t<nextOpenMs){ const g=this.gap(prev,t,provider); this.cache.append(cacheKey(g),g); this.rememberClosed(g); this.metrics.candlesClosed++; t=Date.parse(g.closeTime); } this.metrics.gapRecoveryCount++; await this.bus.publish(createEvent('GapRecovered' as never, { market:prev.market,symbol:prev.symbol,timeframe:prev.timeframe,recoveredTo:iso(nextOpenMs),provider } as never, { source:'candle-engine', correlationId:event?.correlationId, causationId:event?.eventId }) as never); }
  private gap(prev:CanonicalCandle,openMs:number,provider:string):CanonicalCandle{ return this.canonicalClosed({market:prev.market,symbol:prev.symbol,timeframe:prev.timeframe,openTime:iso(openMs),closeTime:iso(closeTimeFor(openMs,prev.timeframe)),open:prev.close,high:prev.close,low:prev.close,close:prev.close,volume:0,exchangeVolume:0,tickVolume:0,source:prev.source,isClosed:true},provider,'gap'); }
  private latestClosed(market:Market,symbol:string,timeframe:Timeframe,provider:string):CanonicalCandle|undefined{ const rows=(this.cache.get(candleCacheKey(market,symbol,timeframe)) ?? []) as CanonicalCandle[]; return [...rows].reverse().find(c=>c.sourceMetadata?.provider===provider || c.provider===provider); }
  private async handleLate(input:Input,timeframe:Timeframe,openMs:number):Promise<void>{ if((this.options.lateTickPolicy ?? 'drop')==='drop'){ this.metrics.droppedTickCount++; return; } const key=engineKey(input.market,input.symbol,timeframe,input.provider); const candles=this.cache.get(cacheKey({market:input.market,symbol:input.symbol,timeframe})) ?? []; const idx=candles.findIndex(c=>c.openTime===iso(openMs) && c.sourceMetadata?.provider===input.provider); if(idx<0){ this.metrics.droppedTickCount++; return; } const maxLate=this.options.maxLateTickMs ?? timeframeMs(timeframe); if(Date.parse(input.receivedAt)-Date.parse(input.occurredAt)>maxLate){ this.metrics.droppedTickCount++; return; } const updated={...(candles[idx] as CanonicalCandle)}; this.update(updated,input); updated.isClosed=true; updated.lifecycleState='CLOSED'; candles[idx]=updated; this.cache.set(cacheKey(updated),candles); await this.bus.publish(createEvent('LateTickProcessed' as never, updated as never, { source:'candle-engine', correlationId:input.event?.correlationId, causationId:input.event?.eventId }) as never); this.closedOpenTimes.get(key)?.add(updated.openTime); }
  private canonicalClosed(c:Candle,provider:string,generatedBy:CandleSourceMetadata['generatedBy']):CanonicalCandle{ const out={...c,isClosed:true,provider,lifecycleState:'CLOSED' as const,sequence:++this.sequence,sourceMetadata:c.sourceMetadata ?? {provider,tickCount:c.tickVolume??0,generatedBy,quality:generatedBy==='gap'?'gap_fill':generatedBy==='warmup'?'warmup':'complete'}}; validateCandle(out); return out; }
  private meta(input:Input,tickCount:number,firstTickAt=input.occurredAt):CandleSourceMetadata{ return { provider:input.provider,tickCount,firstTickAt,lastTickAt:input.occurredAt,generatedBy:input.kind==='markPrice'?'tick':'tick',quality:'complete' }; }
  private rememberClosed(c:CanonicalCandle):void{ const k=engineKey(c.market,c.symbol,c.timeframe,c.provider); const set=this.closedOpenTimes.get(k) ?? new Set<string>(); set.add(c.openTime); this.closedOpenTimes.set(k,set); }
  private hasClosed(key:string,openTime:string):boolean{ return this.closedOpenTimes.get(key)?.has(openTime) ?? false; }
}
