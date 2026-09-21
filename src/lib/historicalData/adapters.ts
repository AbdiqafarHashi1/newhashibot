import { parseBrokerOhlcv } from '../backtest/brokerCsv';
import type { CanonicalCandle, HistoricalDataRequest, HistoricalProvider, HistoricalRange } from './types';
import { TIMEFRAME_MS } from './validation';

export interface HistoricalAdapterResult { bars:CanonicalCandle[];sourceSymbol:string;broker?:string;server?:string;accountId?:string;environment?:string;sourceName?:'DUKASCOPY'|'TWELVE_DATA'|'BINANCE'|'BYBIT'|'COINBASE'|'MT5'|'CSV';sourceVersion?:string;sourceUrl?:string }
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
export interface HistoricalHttpAttempt {url:string;attempt:number;status:number|null;retryDelayMs:number;outcome:'SUCCESS'|'RETRY'|'FAILED'}
export interface HistoricalHttpOptions {maxAttempts?:number;baseDelayMs?:number;retryDelaysMs?:number[];requestDelayMs?:number;requestTimeoutMs?:number;retryBudgetMs?:number;maximumRetryAfterMs?:number;jitter?:()=>number;sleep?:typeof sleep;now?:()=>number;onAttempt?:(event:HistoricalHttpAttempt)=>void}
let nextRequestAt=0;
export async function fetchHistoricalWithRetry(fetcher:Fetcher,url:string,signal?:AbortSignal,options:HistoricalHttpOptions={}){
  const max=Math.max(1,options.maxAttempts??Number(process.env.HISTORICAL_MAX_ATTEMPTS??4)),base=options.baseDelayMs??Number(process.env.HISTORICAL_RETRY_BASE_MS??2000),delays=options.retryDelaysMs??(options.baseDelayMs===undefined?[2000,5000,10000]:[]),pace=options.requestDelayMs??Number(process.env.HISTORICAL_REQUEST_DELAY_MS??0),requestTimeout=options.requestTimeoutMs??Number(process.env.HISTORICAL_REQUEST_TIMEOUT_MS??15000),budget=options.retryBudgetMs??Number(process.env.HISTORICAL_RETRY_BUDGET_MS??60000),retryAfterCap=options.maximumRetryAfterMs??15000,wait=options.sleep??sleep,jitter=options.jitter??Math.random,now=options.now??Date.now,started=now();
  for(let attempt=1;attempt<=max;attempt++){
    if(now()-started>=budget)throw new Error('HISTORY_RETRY_BUDGET_EXCEEDED');
    const pacing=Math.max(0,nextRequestAt-now());if(pacing)await wait(pacing,signal);nextRequestAt=now()+pace;
    const controller=new AbortController(),abort=()=>controller.abort(signal?.reason),timer=setTimeout(()=>controller.abort(new DOMException('Request timed out','TimeoutError')),requestTimeout);signal?.addEventListener('abort',abort,{once:true});let response:Response;
    try{response=await fetcher(url,{signal:controller.signal})}catch(error){clearTimeout(timer);signal?.removeEventListener('abort',abort);if(attempt===max||signal?.aborted||now()-started>=budget){options.onAttempt?.({url,attempt,status:null,retryDelayMs:0,outcome:'FAILED'});throw signal?.aborted?signal.reason:error}const delay=delays[attempt-1]??Math.round(base*2**(attempt-1)*(1+.25*jitter()));if(now()-started+delay>budget)throw new Error('HISTORY_RETRY_BUDGET_EXCEEDED');options.onAttempt?.({url,attempt,status:null,retryDelayMs:delay,outcome:'RETRY'});await wait(delay,signal);continue}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
    if(response.ok){options.onAttempt?.({url,attempt,status:response.status,retryDelayMs:0,outcome:'SUCCESS'});return response}
    const retryable=[408,418,425,429,500,502,503,504].includes(response.status);if(!retryable||attempt===max){options.onAttempt?.({url,attempt,status:response.status,retryDelayMs:0,outcome:'FAILED'});throw new Error(`HISTORY_HTTP_${response.status}`)}
    const header=response.headers.get('retry-after'),parsed=header?(Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-now()):0,backoff=delays[attempt-1]??Math.round(base*2**(attempt-1)*(1+.25*jitter())),retryAfter=Math.max(0,Number.isFinite(parsed)?parsed:0),delay=retryAfter?Math.max(retryAfter,backoff):Math.min(retryAfterCap,backoff);if(now()-started+delay>budget)throw new Error('HISTORY_RETRY_BUDGET_EXCEEDED');options.onAttempt?.({url,attempt,status:response.status,retryDelayMs:delay,outcome:'RETRY'});await wait(delay,signal)
  }throw new Error('HISTORY_RETRY_EXHAUSTED')
}
function finalize(bars:CanonicalCandle[],r:HistoricalDataRequest){const unique=new Map(bars.map(b=>[b.timestamp,b]));const now=Date.now(),width=TIMEFRAME_MS[r.timeframe];return [...unique.values()].sort((a,b)=>a.timestamp-b.timestamp).filter(b=>r.includeOpenCandle||b.timestamp+width<=now);}

export class BinanceHistoricalAdapter implements HistoricalAdapter {
  readonly provider='BINANCE' as const;
  constructor(private fetcher:Fetcher=fetch,private http:HistoricalHttpOptions={}){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){const symbol=(r.sourceSymbol||r.symbol).toUpperCase(),bars:CanonicalCandle[]=[];let cursor=range.from,pages=0;while(cursor<=range.to){if(++pages>10000)throw new Error('BINANCE_HISTORY_PAGE_LIMIT');const url=`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${r.timeframe}&startTime=${cursor}&endTime=${range.to}&limit=1000`;const response=await fetchHistoricalWithRetry(this.fetcher,url,r.signal,this.http);const rows=await response.json() as unknown[][];if(!rows.length)break;for(const x of rows)bars.push({timestamp:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])});const last=Number(rows[rows.length-1][0]);if(last<cursor)throw new Error('BINANCE_HISTORY_NON_ADVANCING');cursor=last+TIMEFRAME_MS[r.timeframe];if(rows.length<1000)break;}return {sourceSymbol:symbol,bars:finalize(bars,r),sourceName:'BINANCE' as const,sourceVersion:'spot-klines/v1',sourceUrl:'https://api.binance.com/api/v3/klines'};}
}

export class BybitHistoricalAdapter implements HistoricalAdapter {
  readonly provider='BYBIT' as const;
  constructor(private fetcher:Fetcher=fetch,private http:HistoricalHttpOptions={}){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){const symbol=(r.sourceSymbol||r.symbol).toUpperCase(),interval=({'1m':'1','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D'} as Record<string,string>)[r.timeframe],bars:CanonicalCandle[]=[];let cursor=range.from,pages=0;while(cursor<=range.to){if(++pages>10000)throw new Error('BYBIT_HISTORY_PAGE_LIMIT');const url=`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${interval}&start=${cursor}&end=${range.to}&limit=1000`;const response=await fetchHistoricalWithRetry(this.fetcher,url,r.signal,this.http);const json=await response.json() as {retCode:number;retMsg?:string;result:{list:string[][]}};if(json.retCode!==0)throw new Error(`BYBIT_HISTORY_${json.retCode}:${json.retMsg||''}`);const rows=json.result.list;if(!rows.length)break;for(const x of rows)bars.push({timestamp:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])});const last=Math.max(...rows.map(x=>Number(x[0])));if(last<cursor)throw new Error('BYBIT_HISTORY_NON_ADVANCING');cursor=last+TIMEFRAME_MS[r.timeframe];if(rows.length<1000)break;}return {sourceSymbol:symbol,bars:finalize(bars,r),sourceName:'BYBIT' as const,sourceVersion:'v5-market-kline/v1',sourceUrl:'https://api.bybit.com/v5/market/kline'};}
}

/** Independent Dukascopy candle feed for research; it is not MT5 broker proof. */
export class DukascopyHistoricalAdapter implements HistoricalAdapter {
  readonly provider='PUBLIC_RESEARCH' as const;
  constructor(private fetcher:Fetcher=fetch,private endpoint='https://freeserv.dukascopy.com/2.0/index.php',private http:HistoricalHttpOptions={}){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){
    const source=(r.sourceSymbol||r.symbol).toUpperCase(),interval=({'1m':'1MIN','5m':'5MIN','15m':'15MIN','30m':'30MIN','1h':'1HOUR','4h':'4HOURS','1d':'1DAY'} as Record<string,string>)[r.timeframe];
    const bars:CanonicalCandle[]=[];let cursor=range.from,pages=0;
    while(cursor<=range.to){if(++pages>10000)throw new Error('DUKASCOPY_HISTORY_PAGE_LIMIT');const end=Math.min(range.to,cursor+TIMEFRAME_MS[r.timeframe]*999);const query=new URLSearchParams({path:'chart/json3',instrument:source,offer_side:'B',interval,splits:'true',stocks:'true',limit:'1000',start:String(cursor),end:String(end)});const response=await fetchHistoricalWithRetry(this.fetcher,`${this.endpoint}?${query}`,r.signal,this.http);const raw=await response.text(),payload=raw.trim().replace(/^[^(]*\(/,'').replace(/\);?\s*$/,'');let rows:unknown;try{rows=JSON.parse(payload)}catch{throw new Error('DUKASCOPY_HISTORY_INVALID_JSON')};if(!Array.isArray(rows))throw new Error('DUKASCOPY_HISTORY_INVALID_PAYLOAD');for(const value of rows){const x=value as Record<string,unknown>|unknown[],rawTime=Number(Array.isArray(x)?x[0]:x.timestamp??x.time),timestamp=rawTime<1e12?rawTime*1000:rawTime;if(Array.isArray(x))bars.push({timestamp,open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]??0)});else bars.push({timestamp,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume??0)})}cursor=end+TIMEFRAME_MS[r.timeframe];}
    return {sourceSymbol:source,bars:finalize(bars,r),sourceName:'DUKASCOPY' as const,sourceVersion:'chart-json3/v2',sourceUrl:this.endpoint};
  }
}

/** Coinbase Exchange public candles. Canonical USDT symbols are mapped to the venue's USD product. */
export class CoinbaseHistoricalAdapter implements HistoricalAdapter {
  readonly provider='COINBASE' as const;
  constructor(private fetcher:Fetcher=fetch,private http:HistoricalHttpOptions={}){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){const asset=r.symbol.toUpperCase().replace(/USDT$/,''),source=`${asset}-USD`,granularity=TIMEFRAME_MS[r.timeframe]/1000;if(![60,300,900,3600,21600,86400].includes(granularity))throw new Error('COINBASE_TIMEFRAME_UNSUPPORTED');const bars:CanonicalCandle[]=[];let cursor=range.from;while(cursor<=range.to){const end=Math.min(range.to,cursor+granularity*1000*299),url=`https://api.exchange.coinbase.com/products/${encodeURIComponent(source)}/candles?granularity=${granularity}&start=${encodeURIComponent(new Date(cursor).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`;const response=await fetchHistoricalWithRetry(this.fetcher,url,r.signal,this.http),rows=await response.json() as unknown[][];for(const x of rows)bars.push({timestamp:Number(x[0])*1000,low:Number(x[1]),high:Number(x[2]),open:Number(x[3]),close:Number(x[4]),volume:Number(x[5])});cursor=end+TIMEFRAME_MS[r.timeframe]}return{sourceSymbol:source,bars:finalize(bars,r),sourceName:'COINBASE' as const,sourceVersion:'exchange-candles/v1',sourceUrl:'https://api.exchange.coinbase.com/products/{product}/candles'}}
}

export class TwelveDataHistoricalAdapter implements HistoricalAdapter {
  readonly provider='TWELVE_DATA' as const;
  constructor(private apiKey:string,private fetcher:Fetcher=fetch,private http:HistoricalHttpOptions={}){}
  async fetch(r:HistoricalDataRequest,range:HistoricalRange){
    const source=r.symbol==='XAUUSD'?'XAU/USD':r.symbol.replace(/(.{3})(.{3})/,'$1/$2'),interval=({'5m':'5min','15m':'15min','1h':'1h','4h':'4h'} as Record<string,string>)[r.timeframe];
    if(!interval)throw new Error('TWELVE_DATA_TIMEFRAME_MISMATCH');
    const url=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(source)}&interval=${interval}&start_date=${encodeURIComponent(new Date(range.from).toISOString())}&end_date=${encodeURIComponent(new Date(range.to).toISOString())}&outputsize=5000&timezone=UTC&apikey=${encodeURIComponent(this.apiKey)}`,response=await fetchHistoricalWithRetry(this.fetcher,url,r.signal,{...this.http,requestDelayMs:Math.max(900,this.http.requestDelayMs??0)}),json=await response.json() as {status?:string;message?:string;meta?:{symbol?:string;interval?:string};values?:unknown};
    if(json.status==='error')throw new Error(`TWELVE_DATA_${json.message??'INVALID_RESPONSE'}`);
    if(!Array.isArray(json.values))throw new Error('TWELVE_DATA_CORRUPT_PAYLOAD');
    if(json.meta?.symbol&&json.meta.symbol.replace('/','').toUpperCase()!==source.replace('/','').toUpperCase())throw new Error('TWELVE_DATA_SYMBOL_MISMATCH');
    if(json.meta?.interval&&json.meta.interval!==interval)throw new Error('TWELVE_DATA_TIMEFRAME_MISMATCH');
    const bars:CanonicalCandle[]=[];
    for(const value of json.values){
      if(!value||typeof value!=='object')throw new Error('TWELVE_DATA_CORRUPT_PAYLOAD');
      const x=value as Record<string,unknown>,raw=String(x.datetime??''),timestamp=Date.parse(/[zZ]|[+-]\d\d(?::?\d\d)?$/.test(raw)?raw:`${raw}Z`),bar={timestamp,open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:x.volume===undefined?undefined:Number(x.volume)};
      if(!Number.isFinite(timestamp)||timestamp<=0)throw new Error('TWELVE_DATA_INVALID_TIMESTAMP');
      if(![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)||bar.high<Math.max(bar.open,bar.close,bar.low)||bar.low>Math.min(bar.open,bar.close,bar.high))throw new Error('TWELVE_DATA_INVALID_OHLC');
      if(timestamp>=range.from&&timestamp<=range.to)bars.push(bar);
    }
    const normalized=finalize(bars,r);
    if(!normalized.length)throw new Error('TWELVE_DATA_NO_USABLE_BARS');
    return{sourceSymbol:source,bars:normalized,sourceName:'TWELVE_DATA' as const,sourceVersion:'time-series/v1',sourceUrl:'https://api.twelvedata.com/time_series'};
  }
}

export class CsvHistoricalAdapter implements HistoricalAdapter {readonly provider='CSV' as const;constructor(private text:string){}async fetch(r:HistoricalDataRequest,range:HistoricalRange){return {sourceSymbol:r.sourceSymbol||r.symbol,bars:parseBrokerOhlcv(this.text).map(b=>({timestamp:Date.parse(b.time),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume})).filter(b=>b.timestamp>=range.from&&b.timestamp<=range.to)};}}
