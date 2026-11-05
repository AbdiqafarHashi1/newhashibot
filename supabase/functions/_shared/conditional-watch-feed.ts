import {watchWidth,type WatchTimeframe} from './conditional-contract.ts';
import {decodeNativeKline} from './native-kline.ts';
import {loadMT5Candles} from './mt5-market-data-provider.ts';
import {conditionalMarket} from './conditional-market.ts';
import type {WatchFeed} from './conditional-watch.ts';
import type {StrategyCandle} from './professional-strategies.ts';

/** Crypto stays on its recorded venue; a fallback venue is never used to infer an outcome. */
export async function conditionalWatchFeed(db:any,symbol:string,tf:WatchTimeframe,now:number,feedIdentity?:string,fetcher=fetch,historyBars=240):Promise<WatchFeed> {
 if(![240,960].includes(historyBars))throw Error('WATCH_HISTORY_LIMIT_INVALID');
 if(conditionalMarket(symbol)==='forex'){
  const r=await loadMT5Candles(db,symbol,tf,historyBars,{now,feedIdentity});
  return {candles:r.candles,currentOpen:r.currentOpen,error:r.error,spreadObservedAt:r.lineage?.last_update_at,spreadPrice:now-Date.parse(r.lineage?.last_update_at)>=0&&now-Date.parse(r.lineage?.last_update_at)<=120000&&Number(r.lineage?.bid)>0&&Number(r.lineage?.ask)>=Number(r.lineage?.bid)?Number(r.lineage.ask)-Number(r.lineage.bid):null};
 }
 const r=await fetcher(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&limit=${historyBars+1}`,{signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error(`CRYPTO_FEED_HTTP_${r.status}`);
 const raw=await r.json();if(!Array.isArray(raw)||!raw.length)throw Error('CRYPTO_FEED_EMPTY');
 const rows:StrategyCandle[]=raw.map(row=>decodeNativeKline(symbol,tf,row,'SPOT')),w=watchWidth(tf);
 return {candles:rows.filter(b=>Date.parse(b.open_time)+w<=now),currentOpen:rows.find(b=>Date.parse(b.open_time)<=now&&Date.parse(b.open_time)+w>now)};
}
