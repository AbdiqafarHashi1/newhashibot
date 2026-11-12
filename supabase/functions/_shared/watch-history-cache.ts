import {watchWidth,type WatchTimeframe} from './conditional-contract.ts';
import type {StrategyCandle} from './professional-strategies.ts';
const immutableCache=new WeakMap<readonly StrategyCandle[],{symbol:string;tf:WatchTimeframe;rows:readonly StrategyCandle[]}>();
const validated=new WeakSet<readonly StrategyCandle[]>();
/** Only fully frozen arrays of frozen candles can reuse structural validation.
 * Mutable/live responses are checked again. Clock and freshness checks always run. */
export function validatedWatchHistory(input:readonly StrategyCandle[],symbol:string,tf:WatchTimeframe,now:number):readonly StrategyCandle[]{
 const w=watchWidth(tf),cached=immutableCache.get(input);let rows:readonly StrategyCandle[];
 if(cached){if(cached.symbol!==symbol||cached.tf!==tf)throw Error('INVALID_WATCH_CANDLES');rows=cached.rows;}
 else {
  rows=[...input].sort((a,b)=>Date.parse(a.open_time)-Date.parse(b.open_time));
  if(!rows.length||rows.some((b,i)=>b.symbol!==symbol||b.timeframe!==tf||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||!b.source||Date.parse(b.open_time)%w!==0||Date.parse(b.open_time)+w>now||(i>0&&Date.parse(b.open_time)<=Date.parse(rows[i-1].open_time))))throw Error('INVALID_WATCH_CANDLES');
  if(Object.isFrozen(input)&&input.every(b=>Object.isFrozen(b))){rows=Object.freeze(rows);immutableCache.set(input,{symbol,tf,rows});validated.add(rows);}
 }
 const close=Date.parse(rows.at(-1)!.open_time)+w;if(close>now)throw Error('INVALID_WATCH_CANDLES');if(now-close>=w)throw Error('STALE_CLOSED_CANDLES');return rows;
}
export function firstUnobservedBar(rows:readonly StrategyCandle[],lastBar:string){
 if(!validated.has(rows))return 0;const at=Date.parse(lastBar);let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(Date.parse(rows[mid].open_time)<=at)lo=mid+1;else hi=mid;}return lo;
}
