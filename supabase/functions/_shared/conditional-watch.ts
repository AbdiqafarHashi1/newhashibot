import {CONDITIONAL_ASSETS,conditionalMarket,scheduledMarketClosed} from './conditional-market.ts';
import {ConditionalSignalStore,observeConditionalSymbol,admitConditionalBatch} from './conditional-signal-runtime.ts';
import {enterConditionalAtOpen,type ConditionalSetup} from './conditional-signal-service.ts';
import {watchWidth,type WatchTimeframe} from './conditional-contract.ts';
import type {StrategyCandle} from './professional-strategies.ts';
import {strategyContextDecision,type WatchedIntelligence} from './watched-market-context.ts';
export interface WatchFeed {candles:readonly StrategyCandle[];currentOpen?:StrategyCandle;error?:string|null;spreadPrice?:number|null;spreadObservedAt?:string;}
export interface WatchDependencies {
 store:ConditionalSignalStore;feed:(symbol:string,tf:WatchTimeframe,now:number)=>Promise<WatchFeed>;
 health:(record:Record<string,unknown>)=>Promise<void>;discovery:{crypto:boolean;forex:boolean};
 timeframes?:readonly WatchTimeframe[];additionalTasks?:readonly {symbol:string;tf:WatchTimeframe}[];
 assess?:(i:{symbol:string;tf:WatchTimeframe;rows:readonly StrategyCandle[];now:number;feed:WatchFeed;load:(symbol:string,tf:WatchTimeframe)=>Promise<WatchFeed>})=>Promise<{setups:ConditionalSetup[];intelligence:(rows:readonly StrategyCandle[],at:number)=>WatchedIntelligence}>;
}
/** Every stream is visited; one shared four-request cache includes higher-timeframe and anchor reads. */
export async function runConditionalWatch(deps:WatchDependencies,now=Date.now()) {
 const byKey=new Map(CONDITIONAL_ASSETS.flatMap(symbol=>(deps.timeframes??['15m','1h'] as const).map(tf=>[`${symbol}:${tf}`,{symbol,tf}] as const)));
 for(const t of deps.additionalTasks??[])byKey.set(`${t.symbol}:${t.tf}`,t);
 const tasks=[...byKey.values()],results:Record<string,unknown>[]=[],candidates:ConditionalSetup[]=[],cache=new Map<string,Promise<WatchFeed>>();
 let active=0;const waiting:Array<()=>void>=[];
 const load=(symbol:string,tf:WatchTimeframe):Promise<WatchFeed>=>{const key=`${symbol}:${tf}`;if(cache.has(key))return cache.get(key)!;
  const pending=(async()=>{if(active>=4)await new Promise<void>(r=>waiting.push(r));else active++;
   try{return await deps.feed(symbol,tf,now);}finally{const next=waiting.shift();if(next)next();else active--;}})();cache.set(key,pending);return pending;};
 let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{for(;;){const task=tasks[cursor++];if(!task)break;
  const {symbol,tf}=task,market=conditionalMarket(symbol);if(!market)throw Error('UNSUPPORTED_WATCH_ASSET');
  let record:Record<string,unknown>={symbol,timeframe:tf,market,checked_at:new Date(now).toISOString(),state:'HEALTHY',last_closed_at:null,error:null};
  try{
   const open=await deps.store.open(symbol,tf);
   if(scheduledMarketClosed(symbol,now))record.state='MARKET_CLOSED';
   else if(!deps.discovery[market]&&!open.length)record.state='DISCOVERY_PAUSED';
   else {
    const feed=await load(symbol,tf),w=watchWidth(tf);if(feed.error||!feed.candles.length)throw Error(feed.error??'CANDLES_UNAVAILABLE');
    const rows=[...feed.candles].sort((a,b)=>Date.parse(a.open_time)-Date.parse(b.open_time));
    if(rows.some((b,i)=>b.symbol!==symbol||b.timeframe!==tf||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||!b.source||Date.parse(b.open_time)%w!==0||Date.parse(b.open_time)+w>now||(i>0&&Date.parse(b.open_time)<=Date.parse(rows[i-1].open_time))))throw Error('INVALID_WATCH_CANDLES');
    const last=rows.at(-1)!;if(now-Date.parse(last.open_time)-w>=w)throw Error('STALE_CLOSED_CANDLES');
    record.last_closed_at=new Date(Date.parse(last.open_time)+w).toISOString();
    const assessed=deps.assess?await deps.assess({symbol,tf,rows,now,feed,load}):undefined;
    const discovered=await observeConditionalSymbol(deps.store,symbol,tf,rows,now,assessed?{intelligence:assessed.intelligence}:undefined);
    if(deps.discovery[market])candidates.push(...(assessed?.setups??discovered));
    if(feed.currentOpen)for(const s of await deps.store.open(symbol,tf)){
     if(s.status!=='ARMED')continue;
     const proposed=enterConditionalAtOpen(s,feed.currentOpen,now);if(proposed===s)continue;
     const intel=s.origin&&assessed?assessed.intelligence(rows,now):undefined;
     const decision=intel&&s.origin?(intel.spreadPrice!==null&&intel.spreadPrice/Math.abs(s.trigger-s.stop)>.2?'WAIT':strategyContextDecision(s.origin.thesis,s.side,rows,intel)):'VALID';
     const next=decision!=='VALID'&&proposed.status==='ACTIVE'?{...s,version:s.version+1,status:'INVALIDATED' as const,observedAt:new Date(now).toISOString(),confirmationIntelligence:intel,result:'Next-open strategy context did not qualify; no paper entry.'}:intel?{...proposed,confirmationIntelligence:intel}:proposed;
     await deps.store.save(next,s.version);
    }
   }
  }catch(e){record={...record,state:'FEED_UNAVAILABLE',error:e instanceof Error?e.message:'WATCH_FAILED'};}
  await deps.health(record);results.push(record);
 }}));
 const admission=await admitConditionalBatch(deps.store,candidates,now);
 return {assets:CONDITIONAL_ASSETS.length,streams:tasks.length,results,admission};
}
