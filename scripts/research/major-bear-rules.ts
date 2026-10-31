import {majorHistoryReason,type MajorVariant} from './major-breakout-rules.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
export function proposeMajorBear(history:readonly StrategyCandle[],reference:readonly StrategyCandle[],variant:MajorVariant,asOf:string):{candidate:ArbitrationCandidate|null;reason:string}{
 const no=(reason:string)=>({candidate:null,reason}),invalid=majorHistoryReason(history,reference,asOf);
 if(invalid||!['PEER_RELATIVE','PEER_BREADTH'].includes(variant))return no(invalid??'CONFIGURATION_OR_WARMUP');
 const h=history.slice(-240),peer=reference.slice(-240),c=h.at(-1)!,symbol=c.symbol,at=Date.parse(asOf),change=c.close/h[h.length-25].close-1,peerChange=peer.at(-1)!.close/peer[peer.length-25].close-1,week=c.close/h[h.length-169].close-1,prior=h.slice(-25,-1);
 if(!(peerChange<0&&change<=-.03&&week<0&&c.close<Math.min(...prior.map(b=>b.low))&&c.quote_volume!>=1.5*prior.reduce((n,b)=>n+b.quote_volume!,0)/24))return no('NO_SELLING_BREADTH_BREAKDOWN');
 if(variant==='PEER_RELATIVE'&&peerChange-change<.02)return no('NO_PEER_UNDERPERFORMANCE');
 const atr=h.slice(-21,-1).reduce((n,b,i)=>{const previous=h[h.length-22+i].close;return n+Math.max(b.high-b.low,Math.abs(b.high-previous),Math.abs(b.low-previous));},0)/20,stop=Math.max(c.close+2*atr,...prior.map(b=>b.high)),risk=stop-c.close,target=c.close-3*risk;
 if(!(atr>0&&target>0&&risk/c.close>=.01&&(c.close-target)/c.close>=5*25/10000))return no('GEOMETRY_OR_COST_FLOOR');
 return {reason:'CANDIDATE',candidate:{id:`BEAR_${variant}:${symbol}:${at}`,strategyId:`major.bear_${variant.toLowerCase()}`,strategyVersion:'research-v1',market:'crypto',symbol,timeframe:'1h',side:'sell',entry:c.close,stop,targets:[target],riskReward:3,confidence:0,score:80,grade:'RESEARCH',expiry:new Date(at+3600000).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',rejectionReasons:[],evidence:{peer:symbol==='BTCUSDT'?'ETHUSDT':'BTCUSDT',return24h:change,peerReturn24h:peerChange,variant,scoreIsNotProbability:true,costBps:25}}};
}
