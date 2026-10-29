import {decodeNativeKline} from './native-kline.ts';
import {loadMT5Candles} from './mt5-market-data-provider.ts';
import {conditionalMarket} from './conditional-market.ts';
import type {WatchFeed} from './conditional-watch.ts';
import type {StrategyCandle} from './professional-strategies.ts';

/** Crypto stays on its recorded venue; a fallback venue is never used to infer an outcome. */
export async function conditionalWatchFeed(db:any,symbol:string,tf:'15m'|'1h',now:number,feedIdentity?:string,fetcher=fetch):Promise<WatchFeed> {
 if(conditionalMarket(symbol)==='forex'){
  const r=await loadMT5Candles(db,symbol,tf,180,{now,feedIdentity});
  return {candles:r.candles,currentOpen:r.currentOpen,error:r.error};
 }
 const r=await fetcher(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&limit=180`,{signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error(`CRYPTO_FEED_HTTP_${r.status}`);
 const raw=await r.json();if(!Array.isArray(raw)||!raw.length)throw Error('CRYPTO_FEED_EMPTY');
 const rows:StrategyCandle[]=raw.map(row=>decodeNativeKline(symbol,tf,row,'SPOT')),w=tf==='15m'?900000:3600000;
 return {candles:rows.filter(b=>Date.parse(b.open_time)+w<=now),currentOpen:rows.find(b=>Date.parse(b.open_time)<=now&&Date.parse(b.open_time)+w>now)};
}
