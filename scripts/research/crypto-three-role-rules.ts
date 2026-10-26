import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
export const ROLES=['TREND_PULLBACK','RANGE_REVERSION','ALT_RELATIVE_BREAKOUT'] as const;
export type Role=typeof ROLES[number];
export interface RoleProposal {candidate:ArbitrationCandidate;horizon:number;regime:string}
const mean=(a:number[])=>a.reduce((n,x)=>n+x,0)/a.length;
const ema=(a:number[],period:number)=>a.reduce((n,x,i)=>i===0?x:n+2/(period+1)*(x-n),a[0]);
export function aggregateHours(rows:readonly StrategyCandle[]):StrategyCandle[]{
 if(rows.length%4)throw Error('INCOMPLETE_HOUR');
 const result:StrategyCandle[]=[];
 for(let i=0;i<rows.length;i+=4){const g=rows.slice(i,i+4),at=Date.parse(g[0].open_time);
  if(at%3600000||g.some((c,j)=>Date.parse(c.open_time)!==at+j*900000||c.symbol!==g[0].symbol||c.instrument_type!=='USDT_PERPETUAL'||![c.open,c.high,c.low,c.close,c.volume,c.quote_volume].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)||c.low<=0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)))throw Error('INVALID_HOUR_SOURCE');
  result.push({...g[0],timeframe:'1h',high:Math.max(...g.map(c=>c.high)),low:Math.min(...g.map(c=>c.low)),close:g[3].close,volume:g.reduce((n,c)=>n+c.volume,0),quote_volume:g.reduce((n,c)=>n+c.quote_volume!,0)});
 }
 return result;
}
/** Pure research rules: only provided closed prefixes, no fetching, execution or publication. */
export function proposeRole(role:Role,history:readonly StrategyCandle[],btcHistory:readonly StrategyCandle[],costBps:number):{proposal:RoleProposal|null;reason:string}{
 const reject=(reason:string)=>({proposal:null,reason});
 if(history.length<240||btcHistory.length<240)return reject('WARMUP');
 const h=history.slice(-240),btc=btcHistory.slice(-240),c=h.at(-1)!,p=h.at(-2)!;
 if(!Number.isFinite(costBps)||costBps<0||h.some((v,i)=>v.timeframe!=='1h'||v.symbol!==c.symbol||v.instrument_type!=='USDT_PERPETUAL'||![v.open,v.high,v.low,v.close,v.volume,v.quote_volume].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)||v.low<=0||v.low>Math.min(v.open,v.close)||v.high<Math.max(v.open,v.close)||i>0&&Date.parse(v.open_time)!==Date.parse(h[i-1].open_time)+3600000)||btc.some((v,i)=>v.symbol!=='BTCUSDT'||v.timeframe!=='1h'||v.instrument_type!=='USDT_PERPETUAL'||v.open_time!==h[i].open_time||!Number.isFinite(v.close)||v.close<=0))return reject('INVALID_OR_UNALIGNED_HISTORY');
 const closes=h.map(v=>v.close),previous=closes.slice(0,-1),e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,200),prev20=ema(previous,20);
 const path=h.slice(-49),travel=path.slice(1).reduce((n,v,i)=>n+Math.abs(v.close-path[i].close),0),eff=travel?Math.abs(c.close-path[0].close)/travel:0;
 const atr=mean(h.slice(-21,-1).map((v,i)=>Math.max(v.high-v.low,Math.abs(v.high-h[h.length-22+i].close),Math.abs(v.low-h[h.length-22+i].close))));
 if(!Number.isFinite(atr)||atr<=0)return reject('NO_RANGE');
 let side:1|-1=1,stop=0,target=0,regime='',horizon=0;
 const recent=h.slice(-25,-1);
 if(role==='TREND_PULLBACK'){
  if(eff<.3)return reject('NOT_TREND_REGIME');
  const long=e50>e200&&c.close>e50&&p.close<=prev20&&c.close>e20;
  const short=e50<e200&&c.close<e50&&p.close>=prev20&&c.close<e20;
  if(!long&&!short)return reject('NO_TREND_RECLAIM');side=long?1:-1;
  stop=side===1?Math.min(c.close-2*atr,...recent.map(v=>v.low)):Math.max(c.close+2*atr,...recent.map(v=>v.high));
  target=c.close+side*3*Math.abs(c.close-stop);horizon=192;regime=side===1?'TREND_UP':'TREND_DOWN';
 }else if(role==='RANGE_REVERSION'){
  if(eff>.2)return reject('NOT_RANGE_REGIME');
  const prior=closes.slice(-50,-2),center=mean(prior),sd=Math.sqrt(mean(prior.map(v=>(v-center)**2)));
  const long=sd>0&&p.close<center-2.5*sd&&c.close>center-2.5*sd&&c.close<center;
  const short=sd>0&&p.close>center+2.5*sd&&c.close<center+2.5*sd&&c.close>center;
  if(!long&&!short)return reject('NO_RANGE_REENTRY');side=long?1:-1;
  stop=side===1?Math.min(c.close-1.5*atr,p.low,c.low):Math.max(c.close+1.5*atr,p.high,c.high);target=center;horizon=32;regime='RANGE';
 }else{
  if(!['BNBUSDT','SOLUSDT','XRPUSDT'].includes(c.symbol))return reject('NOT_ALT_UNIVERSE');
  const ret=c.close/h[h.length-25].close-1,btcRet=btc.at(-1)!.close/btc[btc.length-25].close-1,week=c.close/h[h.length-169].close-1;
  if(!(btcRet>0&&ret>=.03&&ret-btcRet>=.02&&week>0&&c.close>Math.max(...recent.map(v=>v.high))&&c.quote_volume!>=1.5*mean(recent.map(v=>v.quote_volume!))))return reject('NO_CONFIRMED_RELATIVE_BREAKOUT');
  stop=Math.min(c.close-2*atr,...recent.map(v=>v.low));target=c.close+3*(c.close-stop);horizon=96;regime='ALT_RELATIVE_STRENGTH';
 }
 const risk=Math.abs(c.close-stop),rr=Math.abs(target-c.close)/risk;
 if(stop<=0||target<=0||rr<1.3||risk/c.close<.01||Math.abs(target-c.close)/c.close<5*costBps/10000)return reject('GEOMETRY_OR_COST_FLOOR');
 const at=Date.parse(c.open_time)+3600000;
 const candidate:ArbitrationCandidate={id:`${role}:${c.symbol}:${at}`,strategyId:role,strategyVersion:'research-v1',market:'crypto',symbol:c.symbol,timeframe:'1h',side:side===1?'buy':'sell',entry:c.close,stop,targets:[target],riskReward:rr,score:role==='ALT_RELATIVE_BREAKOUT'?80:role==='TREND_PULLBACK'?75:70,confidence:0,grade:'RESEARCH',expiry:new Date(at+3600000).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',rejectionReasons:[],evidence:{regime,efficiency:eff,atr,costBps,ruleScoreIsNotProbability:true}};
 return {proposal:{candidate,horizon,regime},reason:'CANDIDATE'};
}
