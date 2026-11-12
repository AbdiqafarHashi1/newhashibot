import { CORE_CRYPTO_SYMBOLS } from './opportunity-universe.ts';
import { FOREX_RUNTIME_SYMBOLS, runtimeInstrument } from './forex-runtime-contracts.ts';

export type ConditionalMarket = 'crypto'|'forex';
export function conditionalMarket(symbol:string):ConditionalMarket|null {
 if(CORE_CRYPTO_SYMBOLS.includes(symbol))return 'crypto';
 return FOREX_RUNTIME_SYMBOLS.includes(symbol as typeof FOREX_RUNTIME_SYMBOLS[number])?'forex':null;
}
export const CONDITIONAL_ASSETS=[...CORE_CRYPTO_SYMBOLS,...FOREX_RUNTIME_SYMBOLS];
/** Published weekly FX convention, including New York DST; broker holidays are never inferred. */
export function scheduledMarketClosed(symbol:string,at:number):boolean {
 if(conditionalMarket(symbol)!=='forex')return false;
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date(at));
 const day=p.find(x=>x.type==='weekday')!.value,hour=Number(p.find(x=>x.type==='hour')!.value);
 return day==='Sat'||day==='Fri'&&hour>=17||day==='Sun'&&hour<17||symbol==='XAUUSD'&&day!=='Sun'&&hour===17;
}
export function consecutiveMarketBars(symbol:string,previous:number,next:number,width:number):boolean {
 if(next<=previous||next-previous>4*86400000||(next-previous)%width!==0)return false;
 for(let t=previous+width;t<next;t+=width)if(!scheduledMarketClosed(symbol,t))return false;
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
