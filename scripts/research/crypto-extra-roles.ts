import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import type {RoleProposal} from './crypto-three-role-rules.ts';
export const EXTRA_ROLES=['MAJOR_WEEKLY_MOMENTUM','POST_SHOCK_RECOVERY'] as const;
export type ExtraRole=typeof EXTRA_ROLES[number];
const avg=(a:number[])=>a.reduce((n,v)=>n+v,0)/a.length;
export function proposeExtra(role:ExtraRole,history:readonly StrategyCandle[],btcHistory:readonly StrategyCandle[]):RoleProposal|null{
 if(history.length<744||btcHistory.length<744)return null;
 const h=history.slice(-744),btc=btcHistory.slice(-744),c=h.at(-1)!,p=h.at(-2)!;
 if(h.some((v,i)=>v.symbol!==c.symbol||v.timeframe!=='1h'||v.instrument_type!=='USDT_PERPETUAL'||![v.open,v.high,v.low,v.close,v.quote_volume].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0)||v.low<=0||v.low>Math.min(v.open,v.close)||v.high<Math.max(v.open,v.close)||i>0&&Date.parse(v.open_time)!==Date.parse(h[i-1].open_time)+3600000)||btc.some((v,i)=>v.symbol!=='BTCUSDT'||v.instrument_type!=='USDT_PERPETUAL'||v.timeframe!=='1h'||v.open_time!==h[i].open_time||!Number.isFinite(v.close)||v.close<=0))return null;
 const at=Date.parse(c.open_time)+3600000;let risk=0,horizon=0;
 if(role==='MAJOR_WEEKLY_MOMENTUM'){
  if(!['BTCUSDT','ETHUSDT'].includes(c.symbol)||at%86400000!==0)return null;
  const ret=(v:readonly StrategyCandle[],n:number)=>v.at(-1)!.close/v[v.length-1-n].close-1;
  if(!(ret(h,168)>=.05&&ret(h,720)>=.1&&ret(btc,168)>0&&ret(btc,720)>0&&ret(h,24)>0))return null;
  const days=[];for(let end=h.length;end>=24;end-=24){const group=h.slice(end-24,end);days.unshift({high:Math.max(...group.map(v=>v.high)),low:Math.min(...group.map(v=>v.low)),close:group.at(-1)!.close});}
  risk=2*avg(days.slice(-14).map((v,i)=>{const prior=days[days.length-15+i].close;return Math.max(v.high-v.low,Math.abs(v.high-prior),Math.abs(v.low-prior));}));horizon=672;
 }else{
  if(!['BTCUSDT','ETHUSDT','SOLUSDT'].includes(c.symbol))return null;
  const prior=h.slice(-26,-2),ret24=p.close/h[h.length-26].close-1,ret6=p.close/h[h.length-8].close-1;
  if(!(ret24<=-.08&&ret6<=-.04&&p.low<Math.min(...prior.map(v=>v.low))&&c.close>p.high&&c.close/c.open-1>=.01&&c.quote_volume!>=2*avg(prior.map(v=>v.quote_volume!))&&btc.at(-2)!.close<btc[btc.length-8].close))return null;
  const atr=avg(h.slice(-21,-1).map((v,i)=>{const previous=h[h.length-22+i].close;return Math.max(v.high-v.low,Math.abs(v.high-previous),Math.abs(v.low-previous));}));
  risk=Math.max(2*atr,c.close-Math.min(p.low,c.low)+atr*.25);horizon=48;
 }
 const costBps=16+Math.ceil(horizon/32)*3;
 if(!(risk>0&&c.close-risk>0&&risk/c.close>=.01&&3*risk/c.close>=5*costBps/10000))return null;
 return {regime:role==='MAJOR_WEEKLY_MOMENTUM'?'WEEKLY_RISK_ON':'POST_SHOCK',horizon,candidate:{id:`${role}:${c.symbol}:${at}`,strategyId:role,strategyVersion:'research-v1',market:'crypto',symbol:c.symbol,timeframe:'1h',side:'buy',entry:c.close,stop:c.close-risk,targets:[c.close+3*risk],riskReward:3,score:75,confidence:0,grade:'RESEARCH',expiry:new Date(at+3600000).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',rejectionReasons:[],evidence:{costBps,scoreIsNotProbability:true}}};
}
