import type {StrategyCandle} from './professional-strategies.ts';
import { CORE_CRYPTO_SYMBOLS } from './opportunity-universe.ts';
import { FOREX_RUNTIME_SYMBOLS, runtimeInstrument } from './forex-runtime-contracts.ts';

export type ConditionalMarket = 'crypto'|'forex';
export function conditionalMarket(symbol:string):ConditionalMarket|null {
 if(CORE_CRYPTO_SYMBOLS.includes(symbol))return 'crypto';
 return FOREX_RUNTIME_SYMBOLS.includes(symbol as typeof FOREX_RUNTIME_SYMBOLS[number])?'forex':null;
}
export const CONDITIONAL_ASSETS=[...CORE_CRYPTO_SYMBOLS,...FOREX_RUNTIME_SYMBOLS];
const newYorkSessionFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'numeric',hourCycle:'h23'});
/** Published weekly FX convention, including New York DST; broker holidays are never inferred. */
export function scheduledMarketClosed(symbol:string,at:number,source?:string):boolean {
 if(conditionalMarket(symbol)!=='forex')return false;
 const p=newYorkSessionFormatter.formatToParts(new Date(at));
 const day=p.find(x=>x.type==='weekday')!.value,hour=Number(p.find(x=>x.type==='hour')!.value),minute=Number(p.find(x=>x.type==='minute')!.value);
 if(source==='EXNESS_BROKER_BID_ASK'){const clock=hour*60+minute;return day==='Sat'||day==='Fri'&&clock>=(symbol==='XAUUSD'?1018:1019)||day==='Sun'&&clock<(symbol==='XAUUSD'?1085:1025)||symbol==='XAUUSD'&&day!=='Sun'&&clock>=1018&&clock<1082;}
 return day==='Sat'||day==='Fri'&&hour>=17||day==='Sun'&&hour<17||symbol==='XAUUSD'&&day!=='Sun'&&hour===17;
}
/** A session-opening bucket can contain real quotes even if its first minute is closed.
 * Published daily open spans exceed one hour; endpoints plus hourly samples distinguish whole closed buckets. */
export function scheduledBarClosed(symbol:string,start:number,width:number,source?:string):boolean {
 if(!scheduledMarketClosed(symbol,start,source)||!scheduledMarketClosed(symbol,start+width-1,source))return false;
 for(let t=start+3600000;t<start+width;t+=3600000)if(!scheduledMarketClosed(symbol,t,source))return false;
 return true;
}
export function consecutiveMarketBars(symbol:string,previous:number,next:number,width:number,source?:string):boolean {
 if(next<=previous||next-previous>4*86400000||(next-previous)%width!==0)return false;
 for(let t=previous+width;t<next;t+=width)if(!scheduledBarClosed(symbol,t,width,source))return false;
 return true;
}
/** Frozen modeled price cost, never represented as an observed broker spread/fill. */
export function conditionalCost(symbol:string,price:number,instrumentType?:'SPOT'|'USDT_PERPETUAL'):{price:number;label:string} {
 if(!(Number.isFinite(price)&&price>0))throw Error('INVALID_COST_PRICE');
 if(conditionalMarket(symbol)==='crypto'){
  if(instrumentType==='USDT_PERPETUAL')return {price:price*16/10000,label:'16bps modeled perpetual round trip; funding charged separately in account research'};
  const reserve:Record<string,number>={BTCUSDT:25,ETHUSDT:25,BNBUSDT:27,SOLUSDT:30,XRPUSDT:32,ADAUSDT:35,DOGEUSDT:40,LINKUSDT:35,AVAXUSDT:40,LTCUSDT:32};
  const bps=reserve[symbol];return {price:price*bps/10000,label:`${bps}bps modeled spot round trip, including asset liquidity reserve; not an observed spread or derivatives funding`};
 }
 if(!conditionalMarket(symbol))throw Error('UNSUPPORTED_COST_INSTRUMENT');
 const instrument=runtimeInstrument(symbol)!;
 const pips=symbol==='XAUUSD'?5:symbol==='GBPUSD'?2.5:2;
 return {price:pips*instrument.pip_size,label:`${pips} pips modeled spread/slippage reserve; excludes unobserved swaps`};
}

/** Discovery can restart after a proven fresh warmup. Existing watches still observe the full feed
 * and retain DATA_GAP handling; no missing candle or existing position outcome is invented. */
export function continuousDiscoveryHistory(rows:readonly StrategyCandle[],width:number):readonly StrategyCandle[]{
 if(!rows.length||conditionalMarket(rows[0].symbol)!=='forex')return rows;
 for(let i=rows.length-1;i>0;i--)if(!consecutiveMarketBars(rows[i].symbol,Date.parse(rows[i-1].open_time),Date.parse(rows[i].open_time),width,rows[i].source))return rows.slice(i);
 return rows;
}
