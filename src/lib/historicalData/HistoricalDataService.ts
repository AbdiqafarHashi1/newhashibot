import { datasetKey, type HistoricalCache } from './cache';
import type { HistoricalAdapter } from './adapters';
import type { DataQualityClassification, HistoricalDataRequest, HistoricalDataset, HistoricalRange } from './types';
import { normalizeAndValidate } from './validation';
import { createSessionCalendar } from './sessions';

export function hashHistoricalBars(bars: readonly {timestamp:number;open:number;high:number;low:number;close:number;volume?:number}[]):string {
  let hash=2166136261;
  const value=bars.map(b=>[b.timestamp,b.open,b.high,b.low,b.close,b.volume??null].join(':')).join('|');
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return `fnv1a32:${(hash>>>0).toString(16).padStart(8,'0')}`;
}

export class HistoricalDataUnavailableError extends Error {
  constructor(public readonly details:{requested:HistoricalRange;cached:HistoricalRange[];missing:HistoricalRange[];provider:string;bridgeStatus?:string;mt5Status?:string},cause?:unknown){super(`Historical data unavailable from ${details.provider}; missing ${details.missing.map(x=>`${new Date(x.from).toISOString()}..${new Date(x.to).toISOString()}`).join(', ')}`);this.name='HistoricalDataUnavailableError';if(cause)(this as Error & {cause?:unknown}).cause=cause;}
}
export class HistoricalDataService {
  private adapters=new Map<string,HistoricalAdapter>();
  constructor(private cache:HistoricalCache, adapters:HistoricalAdapter[]=[]){adapters.forEach(a=>this.adapters.set(a.provider,a));}
  register(adapter:HistoricalAdapter){this.adapters.set(adapter.provider,adapter);}
  async getCoverage(r:HistoricalDataRequest){return this.cache.getCoverage(r)}
  async getMissingRanges(r:HistoricalDataRequest){return this.cache.getMissingRanges(r)}
  async deleteDataset(r:HistoricalDataRequest){return this.cache.deleteDataset(r)}
  async verifyDataset(r:HistoricalDataRequest){return normalizeAndValidate(await this.cache.getBars(r),r.timeframe,{from:r.from,to:r.to},(await this.cache.getMetadata(r))?.quality.classification)}
  async refreshRange(r:HistoricalDataRequest){return this.get({...r},true)}
  async get(r:HistoricalDataRequest,force=false):Promise<HistoricalDataset>{
    if(!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.from>r.to)throw new Error('HISTORICAL_REQUEST_RANGE_INVALID');
    const kind=r.provider==='BINANCE'||r.provider==='BYBIT'?'CRYPTO':r.symbol.includes('XAU')||r.symbol.includes('XAG')||r.symbol.includes('GOLD')?'METALS':'FOREX',calendar=createSessionCalendar(kind);
    const cached=await this.cache.getBars(r);const missing=force?[{from:r.from,to:r.to}]:normalizeAndValidate(cached,r.timeframe,{from:r.from,to:r.to},'RESEARCH',Date.now(),calendar.isExpected).quality.missingRanges;
    const adapter=this.adapters.get(r.provider);
    if(missing.length&&!adapter){const coverage=await this.cache.getCoverage(r);throw new HistoricalDataUnavailableError({requested:{from:r.from,to:r.to},cached:coverage.ranges,missing,provider:r.provider,bridgeStatus:r.provider==='MT5_BRIDGE'?'unavailable':undefined,mt5Status:r.provider==='MT5_BRIDGE'?'unknown':undefined});}
    for(const range of missing){try{const result=await adapter!.fetch(r,range);const validated=normalizeAndValidate(result.bars,r.timeframe,range,r.provider==='MT5_BRIDGE'?'BROKER_VALIDATED':'RESEARCH',Date.now(),calendar.isExpected);const existing=await this.cache.getBars(r);const combined=normalizeAndValidate([...existing,...validated.bars],r.timeframe,{from:r.from,to:r.to},r.provider==='MT5_BRIDGE'?'BROKER_VALIDATED':'RESEARCH',Date.now(),calendar.isExpected);const coverageBars=combined.bars.filter(b=>b.timestamp>=r.from&&b.timestamp<=r.to);const coverage={ranges:[],from:coverageBars[0]?.timestamp,to:coverageBars[coverageBars.length-1]?.timestamp,barCount:coverageBars.length};const sourceSymbol=result.sourceSymbol||r.sourceSymbol||r.symbol;const metadata={...r,sourceSymbol,broker:result.broker||r.broker,server:result.server||r.server,environment:result.environment||r.environment,accountId:result.accountId||r.accountId,datasetKey:datasetKey(r),requestedRange:{from:r.from,to:r.to},actualCoverage:coverage,barCount:coverageBars.length,timezone:'UTC' as const,lastSync:new Date().toISOString(),quality:combined.quality,datasetVersion:1 as const,dataHash:hashHistoricalBars(coverageBars),provenance:{provider:r.provider,accountId:result.accountId||r.accountId,sourceSymbol,native:true,sourceName:result.sourceName,sourceVersion:result.sourceVersion,sourceUrl:result.sourceUrl}};await this.cache.putBars(r,validated.bars,metadata);}catch(error){const coverage=await this.cache.getCoverage(r);throw new HistoricalDataUnavailableError({requested:{from:r.from,to:r.to},cached:coverage.ranges,missing,provider:r.provider,bridgeStatus:r.provider==='MT5_BRIDGE'?'offline-or-error':undefined,mt5Status:r.provider==='MT5_BRIDGE'?'unavailable-or-error':undefined},error);}}
    const bars=await this.cache.getBars(r), classification:DataQualityClassification=r.provider==='MT5_BRIDGE'?'BROKER_VALIDATED':'RESEARCH';const checked=normalizeAndValidate(bars,r.timeframe,{from:r.from,to:r.to},classification);const coverage=await this.cache.getCoverage(r);const sourceSymbol=r.sourceSymbol||r.symbol;const metadata=(await this.cache.getMetadata(r))||{...r,sourceSymbol,datasetKey:datasetKey(r),requestedRange:{from:r.from,to:r.to},actualCoverage:coverage,barCount:bars.length,timezone:'UTC',lastSync:new Date().toISOString(),quality:checked.quality,datasetVersion:1,dataHash:hashHistoricalBars(checked.bars),provenance:{provider:r.provider,accountId:r.accountId,sourceSymbol,native:true}};return {bars:checked.bars,metadata:{...metadata,actualCoverage:coverage,barCount:bars.length,quality:checked.quality,dataHash:hashHistoricalBars(checked.bars)}};
  }
}
