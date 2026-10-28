import {dailyCandidate} from './daily-trend-contract.ts';
import type {ArbitrationCandidate} from './arbitrator.ts';
import type {StrategyCandle} from './professional-strategies.ts';
import {evaluateReplayOutcome,type ReplayFillAssumptions} from './replay-outcomes.ts';
export const REPLAY_LIFECYCLE_VERSION='observed-closed-bars/v1';
export interface ReplayTrackedPosition {candidate:ArbitrationCandidate;decisionAt:string;datasetId:string;assumptions:ReplayFillAssumptions}
export function replayCandleWidth(timeframe:string){const match=/^(\d+)(m|h|d)$/.exec(timeframe);if(!match)throw Error('LIFECYCLE_TIMEFRAME_INVALID');const n=Number(match[1])*(match[2]==='m'?60000:match[2]==='h'?3600000:86400000);if(!(n>0))throw Error('LIFECYCLE_TIMEFRAME_INVALID');return n;}
/** Never evaluates a candle whose close is after the current scanner event. No future outcome time enters state. */
export function observeReplayPosition(position:ReplayTrackedPosition,candles:readonly StrategyCandle[],asOf:string){
 const width=replayCandleWidth(position.candidate.timeframe),at=Date.parse(asOf),start=Date.parse(position.decisionAt);
 if(!Number.isFinite(at)||!Number.isFinite(start)||at<start)return null;
 const lower=(time:number)=>{let left=0,right=candles.length;while(left<right){const mid=(left+right)>>>1;if(Date.parse(candles[mid].open_time)<time)left=mid+1;else right=mid;}return left;};
 const from=lower(start),until=lower(at-width+1),path=candles.slice(from,Math.min(until,from+(position.assumptions.maxBarsInTrade??candles.length)));
 if(!path.length||Date.parse(path[0].open_time)!==start)return null;
 if(path.some((c,i)=>c.symbol!==position.candidate.symbol||c.timeframe!==position.candidate.timeframe||Date.parse(c.open_time)!==start+i*width||![c.open,c.high,c.low,c.close].every(Number.isFinite)||c.low<=0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)))return null;
 const result=evaluateReplayOutcome(position.candidate,dailyCandidate(position.candidate)?candles.slice(0,until):path,position.decisionAt,position.assumptions);
 if(!result||result.status==='OPEN'||result.status==='AMBIGUOUS')return null;
 // A gap-excluded entry is only knowable after this first admitted candle; do not backdate it.
 const knownAt=Date.parse(result.exitTime??path[0].open_time)+width;
 return knownAt<=at?{result,knownAt:new Date(knownAt).toISOString()}:null;
}
