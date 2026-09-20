import { parseBrokerOhlcv } from '../backtest/brokerCsv';
import type { CanonicalCandle, HistoricalDataRequest, HistoricalProvider, HistoricalRange } from './types';
import { TIMEFRAME_MS } from './validation';

export interface HistoricalAdapterResult { bars:CanonicalCandle[];sourceSymbol:string;broker?:string;server?:string;accountId?:string;environment?:string;sourceName?:'DUKASCOPY'|'TWELVE_DATA'|'BINANCE'|'BYBIT'|'MT5'|'CSV';sourceVersion?:string;sourceUrl?:string }
export interface HistoricalAdapter {readonly provider:HistoricalProvider;fetch(request:HistoricalDataRequest,range:HistoricalRange):Promise<HistoricalAdapterResult>}
export interface MT5HistoryContractRequest {version:'1.0';operation:'FETCH_HISTORY';account_id:string;symbol:string;source_symbol?:string;timeframe:string;from:string;to:string}
export interface MT5HistoryContractResponse {version:'1.0';provider:'MT5';broker:string;server:string;account_id:string;environment:string;canonical_symbol:string;source_symbol:string;timeframe:string;from:string;to:string;bars:Array<{time:number|string;open:number;high:number;low:number;close:number;tick_volume?:number;real_volume?:number;spread?:number}>}
export type MT5HistoryTransport=(request:MT5HistoryContractRequest)=>Promise<MT5HistoryContractResponse>;

export class MT5BridgeHistoricalAdapter implements HistoricalAdapter {
  readonly provider='MT5_BRIDGE' as const;
  constructor(private transport:MT5HistoryTransport){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange):Promise<HistoricalAdapterResult>{
    if(!r.accountId)throw new Error('MT5_ACCOUNT_REQUIRED');
    const payload:MT5HistoryContractRequest={version:'1.0',operation:'FETCH_HISTORY',account_id:r.accountId,symbol:r.symbol,source_symbol:r.sourceSymbol,timeframe:r.timeframe,from:new Date(range.from).toISOString(),to:new Date(range.to).toISOString()};
    const response=await this.transport(payload);
    if(response.version!=='1.0'||response.provider!=='MT5'||response.timeframe!==r.timeframe||response.account_id!==r.accountId)throw new Error('MT5_HISTORY_CONTRACT_INVALID');
    return {sourceSymbol:response.source_symbol,broker:response.broker,server:response.server,accountId:response.account_id,environment:response.environment,bars:response.bars.map(b=>({timestamp:typeof b.time==='number'?(b.time<1e12?b.time*1000:b.time):Date.parse(b.time),open:b.open,high:b.high,low:b.low,close:b.close,tickVolume:b.tick_volume,realVolume:b.real_volume,spread:b.spread}))};
  }
}

type Fetcher=typeof fetch;
const sleep=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{const id=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(id);reject(new DOMException('Aborted','AbortError'));},{once:true});});
async function fetchRetry(fetcher:Fetcher,url:string,signal?:AbortSignal,retries=3){for(let attempt=0;;attempt++){try{const response=await fetcher(url,{signal});if(response.ok)return response;if(attempt>=retries-1||![408,418,425,429,500,502,503,504].includes(response.status))throw new Error(`HISTORY_HTTP_${response.status}`);}catch(error){if(attempt>=retries-1||signal?.aborted)throw error;}await sleep(100*2**attempt,signal);}}
function finalize(bars:CanonicalCandle[],r:HistoricalDataRequest){const unique=new Map(bars.map(b=>[b.timestamp,b]));const now=Date.now(),width=TIMEFRAME_MS[r.timeframe];return [...unique.values()].sort((a,b)=>a.timestamp-b.timestamp).filter(b=>r.includeOpenCandle||b.timestamp+width<=now);}

export class BinanceHistoricalAdapter implements HistoricalAdapter {
  readonly provider='BINANCE' as const;
  constructor(private fetcher:Fetcher=fetch){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){const symbol=(r.sourceSymbol||r.symbol).toUpperCase(),bars:CanonicalCandle[]=[];let cursor=range.from,pages=0;while(cursor<=range.to){if(++pages>10000)throw new Error('BINANCE_HISTORY_PAGE_LIMIT');const url=`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${r.timeframe}&startTime=${cursor}&endTime=${range.to}&limit=1000`;const response=await fetchRetry(this.fetcher,url,r.signal);const rows=await response.json() as unknown[][];if(!rows.length)break;for(const x of rows)bars.push({timestamp:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])});const last=Number(rows[rows.length-1][0]);if(last<cursor)throw new Error('BINANCE_HISTORY_NON_ADVANCING');cursor=last+TIMEFRAME_MS[r.timeframe];if(rows.length<1000)break;}return {sourceSymbol:symbol,bars:finalize(bars,r)};}
}

export class BybitHistoricalAdapter implements HistoricalAdapter {
  readonly provider='BYBIT' as const;
  constructor(private fetcher:Fetcher=fetch){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){const symbol=(r.sourceSymbol||r.symbol).toUpperCase(),interval=({'1m':'1','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D'} as Record<string,string>)[r.timeframe],bars:CanonicalCandle[]=[];let cursor=range.from,pages=0;while(cursor<=range.to){if(++pages>10000)throw new Error('BYBIT_HISTORY_PAGE_LIMIT');const url=`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${interval}&start=${cursor}&end=${range.to}&limit=1000`;const response=await fetchRetry(this.fetcher,url,r.signal);const json=await response.json() as {retCode:number;retMsg?:string;result:{list:string[][]}};if(json.retCode!==0)throw new Error(`BYBIT_HISTORY_${json.retCode}:${json.retMsg||''}`);const rows=json.result.list;if(!rows.length)break;for(const x of rows)bars.push({timestamp:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])});const last=Math.max(...rows.map(x=>Number(x[0])));if(last<cursor)throw new Error('BYBIT_HISTORY_NON_ADVANCING');cursor=last+TIMEFRAME_MS[r.timeframe];if(rows.length<1000)break;}return {sourceSymbol:symbol,bars:finalize(bars,r)};}
}

/** Independent Dukascopy candle feed for research; it is not MT5 broker proof. */
export class DukascopyHistoricalAdapter implements HistoricalAdapter {
  readonly provider='PUBLIC_RESEARCH' as const;
  constructor(private fetcher:Fetcher=fetch,private endpoint='https://freeserv.dukascopy.com/2.0/index.php'){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){
    const source=(r.sourceSymbol||r.symbol).toUpperCase(),interval=({'1m':'1MIN','5m':'5MIN','15m':'15MIN','30m':'30MIN','1h':'1HOUR','4h':'4HOURS','1d':'1DAY'} as Record<string,string>)[r.timeframe];
    const bars:CanonicalCandle[]=[];let cursor=range.from,pages=0;
    while(cursor<=range.to){if(++pages>10000)throw new Error('DUKASCOPY_HISTORY_PAGE_LIMIT');const end=Math.min(range.to,cursor+TIMEFRAME_MS[r.timeframe]*999);const query=new URLSearchParams({path:'chart/json3',instrument:source,offer_side:'B',interval,splits:'true',stocks:'true',limit:'1000',start:String(cursor),end:String(end)});const response=await fetchRetry(this.fetcher,`${this.endpoint}?${query}`,r.signal);const raw=await response.text(),payload=raw.trim().replace(/^[^(]*\(/,'').replace(/\);?\s*$/,'');let rows:unknown;try{rows=JSON.parse(payload)}catch{throw new Error('DUKASCOPY_HISTORY_INVALID_JSON')};if(!Array.isArray(rows))throw new Error('DUKASCOPY_HISTORY_INVALID_PAYLOAD');for(const value of rows){const x=value as Record<string,unknown>|unknown[],rawTime=Number(Array.isArray(x)?x[0]:x.timestamp??x.time),timestamp=rawTime<1e12?rawTime*1000:rawTime;if(Array.isArray(x))bars.push({timestamp,open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]??0)});else bars.push({timestamp,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume??0)})}cursor=end+TIMEFRAME_MS[r.timeframe];}
    return {sourceSymbol:source,bars:finalize(bars,r),sourceName:'DUKASCOPY' as const,sourceVersion:'chart-json3/v2',sourceUrl:this.endpoint};
  }
}

export class CsvHistoricalAdapter implements HistoricalAdapter {readonly provider='CSV' as const;constructor(private text:string){}async fetch(r:HistoricalDataRequest,range:HistoricalRange){return {sourceSymbol:r.sourceSymbol||r.symbol,bars:parseBrokerOhlcv(this.text).map(b=>({timestamp:Date.parse(b.time),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume})).filter(b=>b.timestamp>=range.from&&b.timestamp<=range.to)};}}
