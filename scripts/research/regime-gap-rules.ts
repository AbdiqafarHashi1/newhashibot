import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
export const GAP_MODES=['RANGE_FAILED_AUCTION','BEAR_RALLY_REJECTION','COMPRESSION_RELEASE'] as const;
export type GapMode=typeof GAP_MODES[number];
const avg=(a:number[])=>a.reduce((s,x)=>s+x,0)/a.length;
export function gapEma(a:number[],n:number){return a.reduce((s,x,i)=>i?s+2/(n+1)*(x-s):x,0);}
export function gapAtr(a:readonly StrategyCandle[]){const tr=a.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-a[i].close),Math.abs(b.low-a[i].close)));let v=avg(tr.slice(0,14));for(const t of tr.slice(14))v=(13*v+t)/14;return v;}
export function aggregateGap(rows:readonly StrategyCandle[],bars:number):StrategyCandle[]{
 if(!Number.isInteger(bars)||bars<1||rows.length%bars)throw Error('INCOMPLETE_AGGREGATION');
 return Array.from({length:rows.length/bars},(_,i)=>{const g=rows.slice(i*bars,(i+1)*bars),t=Date.parse(g[0].open_time);if(t%(bars*900000)||g.some((b,j)=>Date.parse(b.open_time)!==t+j*900000||b.symbol!==g[0].symbol||b.instrument_type!=='USDT_PERPETUAL'||![b.open,b.high,b.low,b.close,b.volume,b.quote_volume].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)))throw Error('INVALID_SOURCE');return{...g[0],timeframe:bars===4?'1h':'4h',close:g.at(-1)!.close,high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low)),volume:g.reduce((s,b)=>s+b.volume,0),quote_volume:g.reduce((s,b)=>s+b.quote_volume!,0)};});
}
/** Closed-prefix-only research proposals; no fetching, account risk or publication. */
export function proposeGap(mode:GapMode,h:readonly StrategyCandle[]):{candidate:ArbitrationCandidate;maxBars:number}|null{
 if(h.length<240)return null;
 const b=h.at(-1)!,p=h.at(-2)!,step=mode==='RANGE_FAILED_AUCTION'?3600000:14400000;
 if(h.some((x,i)=>!Number.isFinite(Date.parse(x.open_time))||i>0&&Date.parse(x.open_time)-Date.parse(h[i-1].open_time)!==step||x.symbol!==b.symbol||x.instrument_type!=='USDT_PERPETUAL'||![x.open,x.high,x.low,x.close,x.quote_volume].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||x.low<=0||x.low>Math.min(x.open,x.close)||x.high<Math.max(x.open,x.close)))throw Error('INVALID_PREFIX');
 const c=h.map(x=>x.close),atr=gapAtr(h);if(!Number.isFinite(atr)||atr<=0)return null;
 const e20=gapEma(c,20),e50=gapEma(c,50),e200=gapEma(c,200),old50=gapEma(c.slice(0,-6),50);let sign=1,stop=0,target=0,maxBars=672,regime='';
 if(mode==='RANGE_FAILED_AUCTION'){
  const path=c.slice(-49,-1),travel=path.slice(1).reduce((s,x,i)=>s+Math.abs(x-path[i]),0),eff=travel?Math.abs(path.at(-1)!-path[0])/travel:0;
  if(eff>.2||Math.abs(e50-old50)>.5*atr)return null;
  const prev=h.slice(-25,-1),hi=Math.max(...prev.map(x=>x.high)),lo=Math.min(...prev.map(x=>x.low)),mid=(hi+lo)/2,range=b.high-b.low;
  const buy=b.low<=lo-.1*atr&&b.close>lo&&b.close<mid&&Math.min(b.open,b.close)-b.low>=.4*range;
  const sell=b.high>=hi+.1*atr&&b.close<hi&&b.close>mid&&b.high-Math.max(b.open,b.close)>=.4*range;
  if(buy===sell)return null;sign=buy?1:-1;stop=buy?b.low-.25*atr:b.high+.25*atr;target=mid;maxBars=48;regime='RANGE';
 }else if(mode==='BEAR_RALLY_REJECTION'){
  if(!(e50<e200&&b.close<e200&&e50<old50&&p.high>=gapEma(c.slice(0,-1),20)&&b.close<p.low&&b.close<b.open))return null;
  sign=-1;stop=Math.max(b.close+2*atr,...h.slice(-3).map(x=>x.high+.25*atr));target=b.close-3*(stop-b.close);regime='TREND_DOWN';
 }else{
  const tr=h.slice(1,-1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-h[i].close),Math.abs(x.low-h[i].close)));
  if(avg(tr.slice(-12))>.75*avg(tr.slice(-60)))return null;
  const prev=h.slice(-21,-1);if(b.quote_volume!<1.5*avg(prev.map(x=>x.quote_volume!)))return null;
  const buy=b.close>Math.max(...prev.map(x=>x.high))&&e50>e200,sell=b.close<Math.min(...prev.map(x=>x.low))&&e50<e200;
  if(buy===sell)return null;sign=buy?1:-1;stop=b.close-sign*2*atr;target=b.close+sign*6*atr;regime=buy?'EXPANSION_UP':'EXPANSION_DOWN';
 }
 const risk=Math.abs(b.close-stop),rr=(target-b.close)*sign/risk;
 if(stop<=0||target<=0||rr<1.3||Math.abs(target-b.close)/b.close<5*.0019)return null;
 const at=new Date(Date.parse(b.open_time)+step).toISOString();
 return{maxBars,candidate:{id:`${mode}:${b.symbol}:${at}`,strategyId:mode,strategyVersion:'research-v1',market:'crypto',symbol:b.symbol,timeframe:step===3600000?'1h':'4h',side:sign===1?'buy':'sell',entry:b.close,stop,targets:[target],riskReward:rr,score:70,confidence:0,grade:'RESEARCH',expiry:new Date(Date.parse(at)+step).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',rejectionReasons:[],evidence:{regime,atr,ema20:e20,ruleScoreIsNotProbability:true}}};
}
