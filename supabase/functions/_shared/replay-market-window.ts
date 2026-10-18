import type {StrategyCandle} from './professional-strategies.ts';
export const ACTIVE_MARKET_WINDOW=110;
/** Aggregate only complete, aligned, already-closed groups. Never fill missing bars. */
export function closedFifteenMinuteContext(input:readonly StrategyCandle[],asOf:string):StrategyCandle[] {
 const limit=Date.parse(asOf);if(!Number.isFinite(limit))throw new Error('INVALID_HIGHER_TIMEFRAME_BOUNDARY');
 const groups=new Map<number,StrategyCandle[]>();
 for(const c of input){const at=Date.parse(c.open_time);if(c.timeframe!=='5m'||!Number.isFinite(at)||at+300000>limit)continue;const bucket=Math.floor(at/900000)*900000;if(bucket+900000>limit)continue;const group=groups.get(bucket)??[];group.push(c);groups.set(bucket,group);}
 const output:StrategyCandle[]=[];
 for(const [at,bars] of [...groups.entries()].sort(([a],[b])=>a-b)){
  bars.sort((a,b)=>Date.parse(a.open_time)-Date.parse(b.open_time));
  if(bars.length!==3||bars.some((c,i)=>Date.parse(c.open_time)!==at+i*300000||c.symbol!==bars[0].symbol||c.source!==bars[0].source))continue;
  output.push({...bars[0],timeframe:'15m',open_time:new Date(at).toISOString(),open:bars[0].open,high:Math.max(...bars.map(c=>c.high)),low:Math.min(...bars.map(c=>c.low)),close:bars[2].close,volume:bars.reduce((s,c)=>s+c.volume,0),source:bars[0].source+':CLOSED_5M_AGGREGATE'});
 }
 return output.slice(-ACTIVE_MARKET_WINDOW);
}
