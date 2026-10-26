import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
export interface NativeFunding {symbol:string;calcTimeMs:number;intervalHours:number;rate:number}
export type LiteratureId='VOLUME_CLOCK_MOMENTUM'|'HOURLY_OVERREACTION'|'FUNDING_PRICE_DISAGREEMENT';
export interface LiteratureProposal {candidate:ArbitrationCandidate;horizon:number;features:Record<string,string|number>}
export const quantile=(x:readonly number[],p:number)=>{const a=[...x].sort((a,b)=>a-b);if(!a.length)return NaN;const at=(a.length-1)*p,lo=Math.floor(at);return a[lo]+(a[Math.ceil(at)]-a[lo])*(at-lo)};
const mean=(a:readonly number[])=>a.reduce((n,x)=>n+x,0)/a.length;
function validHistory(h:readonly StrategyCandle[],minimum:number){const last=h.at(-1);return !!last&&h.length>=minimum&&['BTCUSDT','ETHUSDT'].includes(last.symbol)&&h.every((b,i)=>b.symbol===last.symbol&&b.timeframe==='15m'&&b.instrument_type==='USDT_PERPETUAL'&&[b.open,b.high,b.low,b.close,b.volume,b.quote_volume].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&b.low>0&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&Number.isFinite(Date.parse(b.open_time))&&(i===0||Date.parse(b.open_time)===Date.parse(h[i-1].open_time)+900000));}
export function wilder14(rows:readonly StrategyCandle[]){if(rows.length<15)return 0;const tr=rows.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-rows[i].close),Math.abs(b.low-rows[i].close)));let a=mean(tr.slice(0,14));for(const x of tr.slice(14))a=(13*a+x)/14;return a;}
export function selectVolumeClock(previousThirtyDays:readonly StrategyCandle[]):number{
 if(previousThirtyDays.length!==2880||previousThirtyDays.some((b,i)=>typeof b.quote_volume!=='number'||!Number.isFinite(b.quote_volume)||b.quote_volume<0||i>0&&Date.parse(b.open_time)!==Date.parse(previousThirtyDays[i-1].open_time)+900000))throw Error('VOLUME_CLOCK_HISTORY');
 const averages=Array.from({length:48},(_,s)=>Array.from({length:30},(_,d)=>previousThirtyDays[d*96+s*2].quote_volume!+previousThirtyDays[d*96+s*2+1].quote_volume!).reduce((n,x)=>n+x,0)/30);
 return averages.indexOf(Math.max(...averages));
}
function make(id:LiteratureId,history:readonly StrategyCandle[],side:'buy'|'sell',horizon:number,features:Record<string,string|number>):LiteratureProposal|null{
 if(history.length<110)return null;const h=history.slice(-110),b=h.at(-1)!,at=Date.parse(b.open_time)+900000;
 if(!['BTCUSDT','ETHUSDT'].includes(b.symbol)||!Number.isFinite(at)||h.some((c,i)=>c.symbol!==b.symbol||c.timeframe!=='15m'||c.instrument_type!=='USDT_PERPETUAL'||![c.open,c.high,c.low,c.close,c.volume].every(v=>Number.isFinite(v)&&v>=0)||c.low<=0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)||i>0&&Date.parse(c.open_time)!==Date.parse(h[i-1].open_time)+900000))return null;
 const atr=wilder14(h),sign=side==='buy'?1:-1,risk=2*atr,stop=b.close-sign*risk,target=b.close+sign*2*risk;
 if(!(atr>0&&stop>0&&target>0&&risk/b.close>=.0025&&Math.abs(target-b.close)/b.close>=5*19/10000))return null;
 return {horizon,features:{...features,atr},candidate:{id:`${id}:${b.symbol}:${at}`,strategyId:`literature.${id.toLowerCase()}`,strategyVersion:'research-v1',market:'crypto',symbol:b.symbol,timeframe:'15m',side,entry:b.close,stop,targets:[target],riskReward:2,confidence:0,score:80,grade:'RESEARCH',expiry:new Date(at+900000).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',rejectionReasons:[],evidence:{...features,costBps:19,scoreIsNotProbability:true}}};
}
export function volumeClockProposal(history:readonly StrategyCandle[],startDay:number,slot:number):LiteratureProposal|null{
 if(startDay<2880||slot<0||slot>47||!Number.isInteger(slot)||history.length!==startDay+slot*2+94||!validHistory(history,2880))return null;
 const start=startDay+slot*2,first=history.slice(start,start+2),vol=first.reduce((n,b)=>n+(b.quote_volume??NaN),0),r=first[1].close/first[0].open-1;
 const past=Array.from({length:30},(_,d)=>{const at=startDay-(d+1)*96+slot*2;return history[at].quote_volume!+history[at+1].quote_volume!});
 if(!Number.isFinite(vol)||!past.every(Number.isFinite)||vol<quantile(past,.75)||Math.abs(r)<.002)return null;
 return make('VOLUME_CLOCK_MOMENTUM',history,r>0?'buy':'sell',2,{clockSlot:slot,firstReturn:r,firstVolume:vol,pastVolume75:quantile(past,.75)});
}
export function hourlyOverreaction(history:readonly StrategyCandle[]):LiteratureProposal|null{
 if(history.length<964||history.length%4||!validHistory(history,964))return null;const current=history.slice(-4),pastReturns=[],pastVolumes=[];
 for(let d=0;d<240;d++){const h=history.slice(history.length-8-d*4,history.length-4-d*4);pastReturns.push(h[3].close/h[0].open-1);pastVolumes.push(h.reduce((n,b)=>n+(b.quote_volume??NaN),0));}
 const r=current[3].close/current[0].open-1,average=mean(pastReturns),sd=Math.sqrt(mean(pastReturns.map(v=>(v-average)**2))),volume=current.reduce((n,b)=>n+(b.quote_volume??NaN),0),last=current[3].close/current[3].open-1,total=current.reduce((n,b)=>n+b.volume,0);
 if(current.some(b=>typeof b.taker_buy_volume!=='number'||!Number.isFinite(b.taker_buy_volume)||b.taker_buy_volume<0||b.taker_buy_volume>b.volume)||!pastVolumes.every(Number.isFinite)||!Number.isFinite(volume)||!Number.isFinite(sd)||sd<=0||total<=0)return null;
 const share=current.reduce((n,b)=>n+b.taker_buy_volume!,0)/total;
 if(Math.abs(r)<2.5*sd||volume<quantile(pastVolumes,.9)||r*last>=0||!(r>0?share>=.65:share<=.35))return null;
 return make('HOURLY_OVERREACTION',history,r>0?'sell':'buy',4,{hourReturn:r,hourSD:sd,quoteVolume:volume,buyerShare:share});
}
export function fundingPriceDisagreement(history:readonly StrategyCandle[],current:NativeFunding,previous:readonly NativeFunding[]):LiteratureProposal|null{
 if(!validHistory(history,110))return null;const at=Date.parse(history.at(-1)!.open_time)+900000;
 if(current.symbol!==history.at(-1)!.symbol||current.intervalHours!==8||!Number.isFinite(current.rate)||!Number.isFinite(current.calcTimeMs)||current.calcTimeMs>=at||Math.floor(current.calcTimeMs/900000)*900000+900000!==at)return null;
 const past=previous.filter(p=>p.symbol===current.symbol&&p.intervalHours===8&&p.calcTimeMs<current.calcTimeMs&&p.calcTimeMs>=current.calcTimeMs-30*86400000).slice(-90);
 if(past.length<90||past.some((p,i)=>!Number.isFinite(p.rate)||!Number.isFinite(p.calcTimeMs)||i>0&&Math.abs(p.calcTimeMs-past[i-1].calcTimeMs-28800000)>60000)||Math.abs(current.calcTimeMs-past.at(-1)!.calcTimeMs-28800000)>60000)return null;
 const threshold=Math.max(.0001,quantile(past.map(p=>Math.abs(p.rate)),.9)),r=history.at(-1)!.close/history[history.length-97].close-1;
 if(Math.abs(current.rate)<threshold||!(current.rate<0&&r>=.01||current.rate>0&&r<=-.01))return null;
 return make('FUNDING_PRICE_DISAGREEMENT',history,current.rate<0?'buy':'sell',12,{fundingObservedMs:current.calcTimeMs,fundingRate:current.rate,threshold,return24h:r});
}
