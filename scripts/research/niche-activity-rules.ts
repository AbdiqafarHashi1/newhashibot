import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
import {gapAtr,gapEma} from './regime-gap-rules.ts';
export const NICHE_SETUPS=['LEADER_RELAY','RANGE_FLOW_TURN','TREND_SHOCK_RECOVERY'] as const;
export type NicheSetup=typeof NICHE_SETUPS[number];
const avg=(a:number[])=>a.reduce((n,x)=>n+x,0)/a.length;
// Cache only the pure string-to-epoch conversion; never prices, decisions or mutable rows.
const timeCache=new Map<string,number>();
function timeOf(value:string){const cached=timeCache.get(value);if(cached!==undefined)return cached;const parsed=Date.parse(value);if(timeCache.size>=65536)timeCache.clear();timeCache.set(value,parsed);return parsed;}

const share=(h:readonly StrategyCandle[])=>h.reduce((s,b)=>s+b.taker_buy_volume!,0)/h.reduce((s,b)=>s+b.volume,0);
function valid(h:readonly StrategyCandle[],step:number,n:number){const last=h.at(-1);return !!last&&h.length>=n&&h.every((b,i)=>b.symbol===last.symbol&&b.source==='BINANCE_USDM_KLINES'&&b.instrument_type==='USDT_PERPETUAL'&&[b.open,b.high,b.low,b.close,b.volume,b.quote_volume].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&b.low>0&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&Number.isFinite(timeOf(b.open_time))&&(i===0||timeOf(b.open_time)===timeOf(h[i-1].open_time)+step));}
export function proposeNiche(setup:NicheSetup,h:readonly StrategyCandle[],h1:readonly StrategyCandle[],btc:readonly StrategyCandle[]):{candidate:ArbitrationCandidate;horizon:32}|null{
 if(!NICHE_SETUPS.includes(setup)||!valid(h,900000,288)||!valid(h1,3600000,240)||h.some(b=>typeof b.taker_buy_volume!=='number'||!Number.isFinite(b.taker_buy_volume)||b.taker_buy_volume<0||b.taker_buy_volume>b.volume))return null;
 const b=h.at(-1)!,p=h.at(-2)!;if(!['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT'].includes(b.symbol)||b.timeframe!=='15m'||h1.at(-1)!.timeframe!=='1h')return null;const at=timeOf(b.open_time)+900000;
 if(h1.at(-1)!.symbol!==b.symbol||timeOf(h1.at(-1)!.open_time)+3600000!==Math.floor(at/3600000)*3600000)return null;
 const hourlyCloses=h1.map(x=>x.close),e50=gapEma(hourlyCloses,50),e200=gapEma(hourlyCloses,200),atr=gapAtr(h.slice(-110));if(!Number.isFinite(atr)||atr<=0)return null;
 let sign:1|-1=1,stop=0,target=0,regime='';
 if(setup==='LEADER_RELAY'){
  if(b.symbol==='BTCUSDT'||!valid(btc,900000,100)||btc.at(-1)!.symbol!=='BTCUSDT'||btc.at(-1)!.open_time!==b.open_time)return null;
  const leader=btc.at(-1)!.close/btc[btc.length-5].close-1,own=b.close/h[h.length-5].close-1;sign=leader>0?1:-1;
  if(Math.abs(leader)<.01||own*sign<0||own*sign>Math.abs(leader)/2||btc.slice(-4).reduce((s,x)=>s+x.quote_volume!,0)<1.5*4*avg(btc.slice(-100,-4).map(x=>x.quote_volume!))||sign*(e50-e200)<=0||!(sign===1?b.close>p.high&&share(h.slice(-1))>=.55:b.close<p.low&&share(h.slice(-1))<=.45))return null;
  stop=sign===1?Math.min(b.close-2*atr,...h.slice(-8).map(x=>x.low)):Math.max(b.close+2*atr,...h.slice(-8).map(x=>x.high));target=b.close+sign*2.5*Math.abs(b.close-stop);regime=sign===1?'LEADER_UP_LAG':'LEADER_DOWN_LAG';
 }else if(setup==='RANGE_FLOW_TURN'){
  const path=hourlyCloses.slice(-25),travel=path.slice(1).reduce((s,x,i)=>s+Math.abs(x-path[i]),0),eff=travel?Math.abs(path.at(-1)!-path[0])/travel:0;
  if(eff>.2||Math.abs(e50-e200)>gapAtr(h1))return null;
  const recent=h.slice(-16),prior=h.slice(-32,-16),bounds=h.slice(-33,-1),lo=Math.min(...bounds.map(x=>x.low)),hi=Math.max(...bounds.map(x=>x.high)),mid=(hi+lo)/2,currentShare=share(h.slice(-4)),oldShare=share(h.slice(-20,-16));
  const buy=Math.min(...recent.map(x=>x.low))<Math.min(...prior.map(x=>x.low))&&currentShare>=.55&&currentShare-oldShare>=.15&&b.close>p.high&&b.close<=lo+.25*(hi-lo);
  const sell=Math.max(...recent.map(x=>x.high))>Math.max(...prior.map(x=>x.high))&&currentShare<=.45&&oldShare-currentShare>=.15&&b.close<p.low&&b.close>=hi-.25*(hi-lo);
  if(buy===sell)return null;sign=buy?1:-1;stop=buy?Math.min(b.close-1.5*atr,...recent.map(x=>x.low-.25*atr)):Math.max(b.close+1.5*atr,...recent.map(x=>x.high+.25*atr));target=mid;regime='RANGE_FLOW_DIVERGENCE';
 }else{
  const trend=e50>e200&&h1.at(-1)!.close>e50?1:e50<e200&&h1.at(-1)!.close<e50?-1:0;if(!trend)return null;sign=trend;
  const before=h.slice(-112,-2),oldAtr=gapAtr(before),body=(p.close-p.open)*sign,vol=avg(h.slice(-98,-2).map(x=>x.quote_volume!));
  if(!Number.isFinite(oldAtr)||oldAtr<=0||!Number.isFinite(vol)||vol<=0)return null;
  if(body>=-1.5*oldAtr||p.high-p.low<2.5*oldAtr||p.quote_volume!<2*vol||(b.close-b.open)*sign<=0||(b.close-(p.open+p.close)/2)*sign<0||!(sign===1?share(h.slice(-1))>=.60:share(h.slice(-1))<=.40))return null;
  stop=sign===1?Math.min(b.close-1.5*atr,p.low-.25*atr,b.low-.25*atr):Math.max(b.close+1.5*atr,p.high+.25*atr,b.high+.25*atr);target=b.close+sign*2*Math.abs(b.close-stop);regime=sign===1?'UPTREND_SHOCK_RECOVERY':'DOWNTREND_SHOCK_RECOVERY';
 }
 const risk=Math.abs(b.close-stop),rr=(target-b.close)*sign/risk;if(stop<=0||target<=0||rr<1.3||risk/b.close<.005||Math.abs(target-b.close)/b.close<5*.0019)return null;
 const timestamp=new Date(at).toISOString();return{horizon:32,candidate:{id:`${setup}:${b.symbol}:${timestamp}`,strategyId:`niche.${setup.toLowerCase()}`,strategyVersion:'research-v1',market:'crypto',symbol:b.symbol,timeframe:'15m',side:sign===1?'buy':'sell',entry:b.close,stop,targets:[target],riskReward:rr,score:70,confidence:0,grade:'RESEARCH',expiry:new Date(at+900000).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',rejectionReasons:[],evidence:{regime,atr,closedHourlyAt:new Date(timeOf(h1.at(-1)!.open_time)+3600000).toISOString(),nativeFlow:true,scoreIsNotProbability:true}}};
}
export function entryActivity(dates:readonly string[],from:string,until:string){const start=timeOf(from),end=timeOf(until),day=86400000;if(!Number.isFinite(start)||!Number.isFinite(end)||start%day||end%day||end<=start)throw Error('INVALID_ACTIVITY_INTERVAL');const counts=Array.from({length:(end-start)/day},()=>0);for(const s of dates){const t=timeOf(s);if(!Number.isFinite(t)||t<start||t>=end)throw Error('ENTRY_OUTSIDE_ACTIVITY_INTERVAL');counts[Math.floor((t-start)/day)]++;}let longest=0,streak=0;for(const c of counts){streak=c===0?streak+1:0;longest=Math.max(longest,streak);}const sorted=[...counts].sort((a,b)=>a-b),n=counts.length;return{observedDays:n,entries:dates.length,meanPerDay:dates.length/n,medianPerDay:(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2,activeDays:counts.filter(x=>x>0).length,zeroEntryDays:counts.filter(x=>x===0).length,longestZeroEntryDays:longest,maxPerDay:Math.max(...counts),daily:counts.map((entries,i)=>({date:new Date(start+i*day).toISOString().slice(0,10),entries}))};}
