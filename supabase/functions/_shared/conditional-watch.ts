import {entryPolicyQualified} from './entry-decision.ts';
import {CONDITIONAL_ASSETS,conditionalMarket,scheduledMarketClosed} from './conditional-market.ts';
import {type ConditionalStore,observeConditionalSymbol,admitConditionalBatch} from './conditional-signal-runtime.ts';
import {enterConditionalAtOpen,type ConditionalSetup} from './conditional-signal-service.ts';
import {watchWidth,type WatchTimeframe} from './conditional-contract.ts';
import type {StrategyCandle} from './professional-strategies.ts';
import {strategyContextDecision,type WatchedIntelligence} from './watched-market-context.ts';
export interface WatchFeed {candles:readonly StrategyCandle[];currentOpen?:StrategyCandle;error?:string|null;spreadPrice?:number|null;spreadObservedAt?:string;}
export interface WatchDependencies {
 store:ConditionalStore;feed:(symbol:string,tf:WatchTimeframe,now:number)=>Promise<WatchFeed>;
 health:(record:Record<string,unknown>)=>Promise<void>;discovery:{crypto:boolean;forex:boolean};
 streams?:readonly {symbol:string;tf:WatchTimeframe}[];
 timeframes?:readonly WatchTimeframe[];additionalTasks?:readonly {symbol:string;tf:WatchTimeframe}[];
 assess?:(i:{symbol:string;tf:WatchTimeframe;rows:readonly StrategyCandle[];now:number;feed:WatchFeed;load:(symbol:string,tf:WatchTimeframe)=>Promise<WatchFeed>})=>Promise<{setups:ConditionalSetup[];qualification?:(s:ConditionalSetup)=>boolean;confirmation?:(s:ConditionalSetup,rows:readonly StrategyCandle[],at:number)=>'CONFIRMED'|'STILL_WAITING'|'DATA_UNAVAILABLE';intelligence:(rows:readonly StrategyCandle[],at:number)=>WatchedIntelligence}>;
}
/** Every stream is visited; one shared four-request cache includes higher-timeframe and anchor reads. */
export async function runConditionalWatch(deps:WatchDependencies,now=Date.now()) {
 const byKey=new Map((deps.streams??CONDITIONAL_ASSETS.flatMap(symbol=>(deps.timeframes??['15m','1h'] as const).map(tf=>({symbol,tf})))).map(t=>[`${t.symbol}:${t.tf}`,t] as const));
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
   if(deps.store.expire)await deps.store.expire(symbol,tf,now);
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
    const discovered=await observeConditionalSymbol(deps.store,symbol,tf,rows,now,assessed?{intelligence:assessed.intelligence,qualification:assessed.qualification,confirmation:assessed.confirmation}:undefined);
    if(deps.discovery[market])candidates.push(...(assessed?.setups??discovered));
    if(feed.currentOpen)for(const s of await deps.store.open(symbol,tf)){
     if(s.status!=='ARMED')continue;
     const proposed=enterConditionalAtOpen(s,feed.currentOpen,now);if(proposed===s)continue;
     const intel=s.origin&&assessed?assessed.intelligence(rows,now):undefined;
     const decision=intel&&s.origin?(intel.spreadPrice!==null&&intel.spreadPrice/Math.abs(s.trigger-s.stop)>.2?'WAIT':strategyContextDecision(s.origin.thesis,s.side,rows,intel)):'VALID';
     const currentQualified=!s.origin||!entryPolicyQualified(s.origin.configuration)||assessed?.qualification?.(s)===true;
     const next=(!currentQualified||decision!=='VALID')&&proposed.status==='ACTIVE'?{...s,version:s.version+1,status:'INVALIDATED' as const,observedAt:new Date(now).toISOString(),confirmationIntelligence:intel,result:!currentQualified?'CURRENT_STRATEGY_QUALIFICATION_REQUIRED; no paper entry.':'Next-open strategy context did not qualify; no paper entry.'}:intel?{...proposed,confirmationIntelligence:intel}:proposed;
     await deps.store.save(next,s.version);
    }
   }
  }catch(e){record={...record,state:'FEED_UNAVAILABLE',error:e instanceof Error?e.message:'WATCH_FAILED'};
   // Preserve the watch and frozen watermark. A recovered complete feed retries it.
   for(const s of await deps.store.open(symbol,tf))if(['WAITING','ARMED'].includes(s.status)&&s.evaluationOutcome!=='DATA_UNAVAILABLE')await deps.store.save({...s,version:s.version+1,evaluationOutcome:'DATA_UNAVAILABLE',observedAt:new Date(now).toISOString()},s.version);
  }
  await deps.health(record);results.push(record);
 }}));
 const admission=await admitConditionalBatch(deps.store,candidates,now);
 return {assets:CONDITIONAL_ASSETS.length,streams:tasks.length,results,admission};
}
