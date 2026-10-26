import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
export type MajorVariant='PEER_RELATIVE'|'PEER_BREADTH';
export function majorHistoryReason(history:readonly StrategyCandle[],reference:readonly StrategyCandle[],asOf:string):string|null{
 if(history.length<240||reference.length<240)return 'CONFIGURATION_OR_WARMUP';
 const h=history.slice(-240),peer=reference.slice(-240),c=h.at(-1)!,symbol=c.symbol,peerSymbol=symbol==='BTCUSDT'?'ETHUSDT':'BTCUSDT',at=Date.parse(asOf);
 if(!['BTCUSDT','ETHUSDT'].includes(symbol)||!Number.isFinite(at)||Date.parse(c.open_time)+3600000!==at)return 'MARKET_OR_CLOSED_TIME';
 for(const [rows,expected] of [[h,symbol],[peer,peerSymbol]] as const){if(rows.some((b,i)=>b.symbol!==expected||b.timeframe!=='1h'||b.instrument_type!=='USDT_PERPETUAL'||![b.open,b.high,b.low,b.close,b.volume,b.quote_volume].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||Date.parse(b.open_time)!==Date.parse(h[i].open_time)||Date.parse(b.open_time)+3600000>at||i>0&&Date.parse(b.open_time)!==Date.parse(rows[i-1].open_time)+3600000))return 'INVALID_OR_MISALIGNED_NATIVE_DATA';}
 return null;
}
export function proposeMajorBreakout(history:readonly StrategyCandle[],reference:readonly StrategyCandle[],variant:MajorVariant,asOf:string):{candidate:ArbitrationCandidate|null;reason:string}{
 const no=(reason:string)=>({candidate:null,reason}),invalid=majorHistoryReason(history,reference,asOf);
 if(invalid||!['PEER_RELATIVE','PEER_BREADTH'].includes(variant))return no(invalid??'CONFIGURATION_OR_WARMUP');
 const h=history.slice(-240),peer=reference.slice(-240),c=h.at(-1)!,symbol=c.symbol,peerSymbol=symbol==='BTCUSDT'?'ETHUSDT':'BTCUSDT',at=Date.parse(asOf);
 const change=c.close/h[h.length-25].close-1,peerChange=peer.at(-1)!.close/peer[peer.length-25].close-1,week=c.close/h[h.length-169].close-1,prior=h.slice(-25,-1);
 if(!(peerChange>0&&change>=.03&&week>0&&c.close>Math.max(...prior.map(b=>b.high))&&c.quote_volume!>=1.5*prior.reduce((n,b)=>n+b.quote_volume!,0)/24))return no('NO_VOLUME_BREADTH_BREAKOUT');
 if(variant==='PEER_RELATIVE'&&change-peerChange<.02)return no('NO_PEER_OUTPERFORMANCE');
 const atr=h.slice(-21,-1).reduce((n,b,i)=>{const previous=h[h.length-22+i].close;return n+Math.max(b.high-b.low,Math.abs(b.high-previous),Math.abs(b.low-previous));},0)/20;
 const stop=Math.min(c.close-2*atr,...prior.map(b=>b.low)),risk=c.close-stop,target=c.close+3*risk;
 if(!(atr>0&&stop>0&&risk/c.close>=.01&&(target-c.close)/c.close>=5*25/10000))return no('GEOMETRY_OR_COST_FLOOR');
 return {reason:'CANDIDATE',candidate:{id:`${variant}:${symbol}:${at}`,strategyId:`major.${variant.toLowerCase()}`,strategyVersion:'research-v1',market:'crypto',symbol,timeframe:'1h',side:'buy',entry:c.close,stop,targets:[target],riskReward:3,confidence:0,score:80,grade:'RESEARCH',expiry:new Date(at+3600000).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',rejectionReasons:[],evidence:{peer:peerSymbol,return24h:change,peerReturn24h:peerChange,variant,scoreIsNotProbability:true,costBps:25}}};
}
