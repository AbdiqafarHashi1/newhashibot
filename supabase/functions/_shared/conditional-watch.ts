import {CONDITIONAL_ASSETS,conditionalMarket,scheduledMarketClosed} from './conditional-market.ts';
import {ConditionalSignalStore,observeConditionalSymbol,admitConditionalBatch} from './conditional-signal-runtime.ts';
import {enterConditionalAtOpen,type ConditionalSetup} from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';

export interface WatchFeed {candles:readonly StrategyCandle[];currentOpen?:StrategyCandle;error?:string|null;}
export interface WatchDependencies {
 store:ConditionalSignalStore;
 feed:(symbol:string,tf:'15m'|'1h',now:number)=>Promise<WatchFeed>;
 health:(record:Record<string,unknown>)=>Promise<void>;
 discovery:{crypto:boolean;forex:boolean};
}
/** Every asset/track is visited. Existing plans remain watched even when discovery is paused. */
export async function runConditionalWatch(deps:WatchDependencies,now=Date.now()) {
 const tasks=CONDITIONAL_ASSETS.flatMap(symbol=>(['15m','1h'] as const).map(tf=>({symbol,tf}))),results:Record<string,unknown>[]=[],candidates:ConditionalSetup[]=[];
 let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{for(;;){const task=tasks[cursor++];if(!task)break;
  const {symbol,tf}=task,market=conditionalMarket(symbol)!;
  let record:Record<string,unknown>={symbol,timeframe:tf,market,checked_at:new Date(now).toISOString(),state:'HEALTHY',last_closed_at:null,error:null};
  try{
   const open=await deps.store.open(symbol,tf);
   if(scheduledMarketClosed(symbol,now)){record.state='MARKET_CLOSED';}
   else if(!deps.discovery[market]&&!open.length){record.state='DISCOVERY_PAUSED';}
   else {
    const feed=await deps.feed(symbol,tf,now),w=tf==='15m'?900000:3600000;
    if(feed.error||!feed.candles.length)throw Error(feed.error??'CANDLES_UNAVAILABLE');
    const rows=[...feed.candles].sort((a,b)=>Date.parse(a.open_time)-Date.parse(b.open_time));
    if(rows.some((b,i)=>b.symbol!==symbol||b.timeframe!==tf||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||!b.source||Date.parse(b.open_time)%w!==0||Date.parse(b.open_time)+w>now||(i>0&&Date.parse(b.open_time)<=Date.parse(rows[i-1].open_time))))throw Error('INVALID_WATCH_CANDLES');
    const last=rows.at(-1)!;
    if(now-Date.parse(last.open_time)-w>=w)throw Error('STALE_CLOSED_CANDLES');
    record.last_closed_at=new Date(Date.parse(last.open_time)+w).toISOString();
    const discovered=await observeConditionalSymbol(deps.store,symbol,tf,rows,now);
    if(deps.discovery[market])candidates.push(...discovered);
    // Reload after CAS/confirmation, so restart or another scanner cannot produce a stale fill.
    if(feed.currentOpen)for(const s of await deps.store.open(symbol,tf)){
     const next=enterConditionalAtOpen(s,feed.currentOpen,now);
     if(next!==s)await deps.store.save(next,s.version);
    }
   }
  }catch(e){record={...record,state:'FEED_UNAVAILABLE',error:e instanceof Error?e.message:'WATCH_FAILED'};}
  // Failure to persist health must fail the cycle; absence cannot masquerade as a healthy tick.
  await deps.health(record);results.push(record);
 }}));
 const admission=await admitConditionalBatch(deps.store,candidates,now);
 return {assets:CONDITIONAL_ASSETS.length,streams:tasks.length,results,admission};
}
