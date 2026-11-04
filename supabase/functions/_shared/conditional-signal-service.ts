import {entryPriceAssessment,entryPolicyQualified} from './entry-decision.ts';
import type {EntryDecision} from './entry-decision.ts';
import type {PaperLearningEvidence} from './paper-learning.ts';
import {watchWidth,type WatchTimeframe,type WatchTrack} from './conditional-contract.ts';
import {strategyContextDecision,watchedMarketContext,type WatchedIntelligence,type StrategyThesis} from './watched-market-context.ts';
import type {StrategyRuntimeConfig} from './professional-strategies.ts';
import type {DeepReadonly,StrategyPlan} from './strategy-plan.ts';
/** Conditional signal service: deterministic candle authority, no account or order access. */
import { atrRootV1, emaRootV1 } from './indicator-engine.ts';
import { closedAggregate } from './regime-opportunities.ts';
import { arbitrateActiveScanner } from './active-scanner-core.ts';
import type { ArbitrationCandidate } from './arbitrator.ts';
import type { StrategyCandle } from './professional-strategies.ts';
import {conditionalMarket,conditionalCost,consecutiveMarketBars,scheduledMarketClosed} from './conditional-market.ts';
export const CONDITIONAL_POLICY = 'conditional-signals/v1';
export type SetupStatus = 'WAITING'|'ARMED'|'ACTIVE'|'CLOSED'|'EXPIRED'|'INVALIDATED'|'DATA_GAP';
export interface ConditionalSetup {
 id:string; market?:'crypto'|'forex'; symbol:string; timeframe:WatchTimeframe; track:WatchTrack; side:'buy'|'sell';
 strategy:string; variant:string; policy:string; sourceClose:string; source:string; trigger:number;
 stop:number; tp1:number; tp2:number; expiresAt:string; holdBars:number; score:number; reason:string;
 status:SetupStatus; version:number; lastBar:string; armedAt?:string; fill?:number; bars?:number;
 partial?:boolean; netR?:number; result?:string; exit?:number; fillAt?:string; observedAt?:string;
 validation?:{kind:'TREND_PULLBACK'|'RANGE_REJECTION'|'STRATEGY';boundary:number;higherMinutes:number;lookbackBars?:number;fastPeriod?:number;slowPeriod?:number};
 cost?:{price:number;label:string};
 learning?:PaperLearningEvidence;selectionScore?:number;
 entryDecision?:EntryDecision;
 evaluationOutcome?:'STILL_WAITING'|'DATA_UNAVAILABLE';
 intelligence?:WatchedIntelligence;confirmationIntelligence?:WatchedIntelligence;
 origin?:{version:string;configuration:StrategyRuntimeConfig;plan:DeepReadonly<StrategyPlan>;thesis:StrategyThesis};
 management?:{partialFraction:number;breakEvenAfterTp1:boolean;maximumChaseR:number};
}
const width=watchWidth;
export function validClosedBars(rows:readonly StrategyCandle[],symbol:string,tf:string,now:number):boolean {
 const w=width(tf);return rows.length>=100 && Number.isFinite(now) && rows.every((r,i)=>r.symbol===symbol&&r.timeframe===tf&&
 [r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)&&r.low>0&&r.volume>=0&&r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)&&
 Boolean(r.source)&&r.source!=='UNKNOWN'&&r.source===rows[0].source&&Date.parse(r.open_time)%w===0&&Date.parse(r.open_time)+w<=now&&(!i||consecutiveMarketBars(symbol,Date.parse(rows[i-1].open_time),Date.parse(r.open_time),w)))&&
 now-Date.parse(rows.at(-1)!.open_time)-w<w;
}
/** Two broad tracks; trend continuation or balanced-range rejection is selected by observed context. */
export function conditionalCandidates(symbol:string,tf:WatchTimeframe,rows:readonly StrategyCandle[],now:number):ConditionalSetup[] {
 if(tf!=='15m'&&tf!=='1h')return [];
 rows=rows.slice(-110);
 const market=conditionalMarket(symbol);
 if(!market||scheduledMarketClosed(symbol,now)||!validClosedBars(rows,symbol,tf,now))return [];
 const last=rows.at(-1)!,prior=rows.slice(0,-1),atr=atrRootV1([...prior],14),closes=rows.map(r=>r.close);
 if(!(atr>0)||last.high-last.low>3*atr)return [];
 const higher=closedAggregate(rows,tf==='15m'?60:240,new Date(now).toISOString());
 if(higher.length<24)return [];
 const hc=higher.map(r=>r.close),fast=emaRootV1(hc,8),slow=emaRootV1(hc,20),trend=(fast-slow)/atr;
 const range=prior.slice(-20),hi=Math.max(...range.map(r=>r.high)),lo=Math.min(...range.map(r=>r.low));
 const volume=range.reduce((n,r)=>n+r.volume,0)/20;
 if(!(volume>0)||last.volume<.7*volume)return [];
 let side:1|-1,trigger:number,stop:number,variant:string,reason:string;
 if(Math.abs(trend)>=.5){
  side=trend>0?1:-1;const ema=emaRootV1(closes,20);
  if(Math.abs(last.close-ema)>2*atr||!rows.slice(-4).some(r=>side*(r.close-r.open)<-.25*atr))return [];
  trigger=side===1?last.high+.1*atr:last.low-.1*atr;
  stop=side===1?Math.min(...rows.slice(-4).map(r=>r.low))-.25*atr:Math.max(...rows.slice(-4).map(r=>r.high))+.25*atr;
  variant='TREND_PULLBACK';reason=`Higher-timeframe ${side===1?'uptrend':'downtrend'}; wait for a closed ${tf} candle beyond the pullback boundary.`;
 }else{
  if(hi-lo<4*atr)return [];
  const buy=last.low<lo&&last.close>lo&&last.close>last.open;
  const sell=last.high>hi&&last.close<hi&&last.close<last.open;
  if(buy===sell)return [];side=buy?1:-1;trigger=side===1?last.high+.1*atr:last.low-.1*atr;
  stop=side===1?last.low-.25*atr:last.high+.25*atr;variant='RANGE_REJECTION';
  reason=`Balanced higher-timeframe context; ${side===1?'buyers reclaimed range support':'sellers rejected range resistance'} after a sweep of ${side===1?lo.toPrecision(7):hi.toPrecision(7)}. A completed ${tf} close through the trigger confirms the rejection.`;
 }
 const risk=Math.max(side*(trigger-stop),1.5*atr);stop=trigger-side*risk;
 const cost=conditionalCost(symbol,trigger);
 if(risk/trigger<(market==='crypto'?.003:.0002)||risk/trigger>(market==='crypto'?.08:.03)||trigger<=0||stop<=0||cost.price/risk>.3)return [];
 if(variant==='RANGE_REJECTION'&&side*((hi+lo)/2-trigger)<1.5*risk)return [];
 const track=tf==='15m'?'INTRADAY':'SWING',close=new Date(Date.parse(last.open_time)+width(tf)).toISOString();
 const score=Math.min(94,75+Math.min(Math.abs(trend),3)*4+Math.min(last.volume/volume,2)*3);
 return [{id:`${CONDITIONAL_POLICY}:${symbol}:${tf}:${close}:${side}`,symbol,market,timeframe:tf,track,side:side===1?'buy':'sell',
 strategy:`${market}.conditional-${track.toLowerCase()}`,variant,policy:CONDITIONAL_POLICY,sourceClose:close,source:String(last.source??'UNKNOWN'),
 trigger,stop,tp1:trigger+side*risk,tp2:trigger+side*2*risk,expiresAt:new Date(Date.parse(close)+(tf==='15m'?8:24)*width(tf)).toISOString(),
 holdBars:tf==='15m'?48:168,score,reason,cost,validation:{kind:variant as 'TREND_PULLBACK'|'RANGE_REJECTION',boundary:variant==='RANGE_REJECTION'?(side===1?lo:hi):stop,higherMinutes:tf==='15m'?60:240,lookbackBars:110,fastPeriod:8,slowPeriod:20},status:'WAITING',version:1,lastBar:last.open_time}];
}
export function selectConditionalSetup(setups:readonly ConditionalSetup[],now:number):ConditionalSetup|undefined {
 const candidates:ArbitrationCandidate[]=setups.map(s=>({id:s.id,strategyId:s.strategy,strategyVersion:s.origin?.version??'1.0.0',market:s.market??conditionalMarket(s.symbol)??'crypto',symbol:s.symbol,timeframe:s.timeframe,
 side:s.side,confidence:s.score,grade:s.origin?.plan.diagnostics.grade??(s.score>=85?'A+':'A'),score:s.selectionScore??s.score,entry:s.trigger,stop:s.stop,targets:[s.tp1,s.tp2],riskReward:Math.abs(s.tp2-s.trigger)/Math.abs(s.trigger-s.stop),expiry:s.expiresAt,
 fresh:now-Date.parse(s.sourceClose)<width(s.timeframe),lifecycle:'ENABLED',publicationMode:'LIVE',eligible:true,
 evidence:{policy:CONDITIONAL_POLICY,score_is_probability:false,conditional_only:true},rejectionReasons:[]}));
 const opposing=new Set(setups.map(s=>s.side)).size>1;
 const result=arbitrateActiveScanner(candidates,{now:new Date(now),minimumRiskReward:0,forceNoTradeReason:opposing?'OPPOSING_CONDITIONAL_SETUPS':undefined});
 return setups.find(s=>s.id===result.winner?.id);
}
/** Revalidate the ORIGINAL variant against available closed context; no strategy switching. */
export function originalThesisValid(s:ConditionalSetup,rows:readonly StrategyCandle[],at:number):boolean|null {
 if(s.origin){const r=strategyContextDecision(s.origin.thesis,s.side,rows,watchedMarketContext(rows,at));return r==='VALID'?true:r==='INVALID'?false:null;}
 if(!s.validation)return true; // existing immutable plans retain their original price-only rules
 const d=s.side==='buy'?1:-1,last=rows.at(-1);if(!last)return true;
 if(s.validation.kind==='RANGE_REJECTION')return d*(last.close-s.validation.boundary)>0;
 const higher=closedAggregate(rows.slice(-(s.validation.lookbackBars??110)),s.validation.higherMinutes,new Date(at).toISOString());
 if(higher.length<24)return null;
 const hc=higher.map(r=>r.close);return d*(emaRootV1(hc,s.validation.fastPeriod??8)-emaRootV1(hc,s.validation.slowPeriod??20))>0;
}
/** Only the next OPEN is used here. The mutable bar's high/low/close never determine outcomes. */
export function enterConditionalAtOpen(old:ConditionalSetup,b:StrategyCandle,now:number):ConditionalSetup {
 if(old.status!=='ARMED'||Date.parse(b.open_time)<Date.parse(old.armedAt!)||Date.parse(b.open_time)>now)return old;
 if(now-Date.parse(b.open_time)>90000)return {...old,version:old.version+1,status:'INVALIDATED',observedAt:new Date(now).toISOString(),result:'Next open was not observed within the executable entry window; no retroactive fill.'};
 if(!Number.isFinite(Date.parse(b.open_time))||b.symbol!==old.symbol||b.timeframe!==old.timeframe||!Number.isFinite(b.open)||b.open<=0||b.source!==old.source)throw Error('INVALID_NEXT_OPEN');
 if(Date.parse(b.open_time)!==Date.parse(old.armedAt!)){
  if(!consecutiveMarketBars(old.symbol,Date.parse(old.lastBar),Date.parse(b.open_time),width(old.timeframe)))return old;
  return {...old,version:old.version+1,status:'INVALIDATED',observedAt:new Date(now).toISOString(),result:'Confirmation led into a scheduled market closure; original next-open condition cancelled, no paper fill.'};
 }
 if(now>=Date.parse(old.expiresAt))return {...old,version:old.version+1,status:'EXPIRED',observedAt:new Date(now).toISOString(),result:'Entry deadline elapsed; no paper fill.'};
 const d=old.side==='buy'?1:-1,s={...old,version:old.version+1,observedAt:new Date(now).toISOString()};
 if(d*(b.open-old.stop)<=0||d*(b.open-old.trigger)>(old.management?.maximumChaseR??.25)*Math.abs(old.trigger-old.stop))return {...s,status:'INVALIDATED',result:'Next open crossed invalidation or exceeded chase limit; no paper fill.'};
 if(old.origin&&entryPolicyQualified(old.origin.configuration)){const checks=entryPriceAssessment(old,b.open,old.confirmationIntelligence?.spreadPrice);if(checks.reasons.length)return {...s,status:'INVALIDATED',result:checks.reasons.join('|')+'; no paper entry.'};}
 return {...s,evaluationOutcome:undefined,status:'ACTIVE',fill:b.open,fillAt:b.open_time,bars:0,netR:0,result:'Paper entry at observed next open; outcomes await closed candles.'};
}
/** Confirmation at a completed candle close, paper fill at the NEXT bar open. Never retroactive entry. */
export function advanceConditionalSetup(old:ConditionalSetup,b:StrategyCandle):ConditionalSetup {
 const s={...old},w=width(s.timeframe),t=Date.parse(b.open_time),previous=Date.parse(s.lastBar),d=s.side==='buy'?1:-1;
 if(t<=previous||['CLOSED','EXPIRED','INVALIDATED','DATA_GAP'].includes(s.status))return old;
 if(![b.open,b.high,b.low,b.close].every(Number.isFinite)||b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.symbol!==s.symbol||b.timeframe!==s.timeframe)throw Error('INVALID_OBSERVATION');
 s.version++;s.lastBar=b.open_time;
 if(!b.source||b.source!==s.source){if(old.status==='WAITING'||old.status==='ARMED')return old;s.status='DATA_GAP';s.result='Price source changed; outcome unknown.';return s;}
 if(!consecutiveMarketBars(s.symbol,previous,t,w)){if(old.status==='WAITING'||old.status==='ARMED')return old;s.status='DATA_GAP';s.result='Missing candles; outcome unknown, manual review required.';return s;}
 if(s.status==='WAITING'){
  if(t+w>=Date.parse(s.expiresAt)){s.status='EXPIRED';s.result='Condition did not confirm before expiry.';}
  else if(d*((d===1?b.low:b.high)-s.stop)<=0){s.status='INVALIDATED';s.result='Original invalidation touched before entry.';}
  else if(d*(b.close-s.trigger)>0){s.status='ARMED';s.armedAt=new Date(t+w).toISOString();s.result='Confirmed at close; waiting for next candle open.';}
  return s;
 }
 if(s.status==='ARMED'){
  if(t!==Date.parse(s.armedAt!)||t>=Date.parse(s.expiresAt)){s.status='INVALIDATED';s.result='Original next-open window unavailable or expired; no paper fill.';return s;}
  if(d*(b.open-s.stop)<=0||d*(b.open-s.trigger)>(s.management?.maximumChaseR??.25)*Math.abs(s.trigger-s.stop)){
   s.status='INVALIDATED';s.result='Next open crossed invalidation or exceeded chase limit; no paper fill.';return s;
  }
  s.status='ACTIVE';s.fill=b.open;s.bars=0;s.netR=0;s.result='Paper entry at next open, not a provider fill.';
 }
 const risk=Math.abs(s.fill!-s.stop);s.bars=(s.bars??0)+1;
 const stopped=d*((d===1?b.low:b.high)-s.stop)<=0;
 const first=d*((d===1?b.high:b.low)-s.tp1)>=0,final=d*((d===1?b.high:b.low)-s.tp2)>=0;
 const remaining=s.partial?.5:1;
 if(stopped){s.status='CLOSED';s.exit=d===1?Math.min(b.open,s.stop):Math.max(b.open,s.stop);
  s.netR=(s.netR??0)+remaining*d*(s.exit-s.fill!)/risk;s.result=first?'STOP_FIRST_AMBIGUOUS_BAR':'STOP';}
 else if(final){s.status='CLOSED';s.exit=d===1?Math.max(b.open,s.tp2):Math.min(b.open,s.tp2);
  s.netR=(s.netR??0)+(s.partial?.5*d*(s.exit-s.fill!)/risk:.5*d*(s.tp1-s.fill!)/risk+.5*d*(s.exit-s.fill!)/risk);s.partial=true;s.result='TP2';}
 else{if(first&&!s.partial){s.partial=true;s.netR=.5*d*(s.tp1-s.fill!)/risk;s.result='TP1; half paper position remains, original stop unchanged.';}
  if(s.bars>=s.holdBars||t+w-Date.parse(s.fillAt??s.armedAt!)>=s.holdBars*w){s.status='CLOSED';s.exit=b.close;s.netR=(s.netR??0)+(s.partial?.5:1)*d*(b.close-s.fill!)/risk;s.result='TIME_STOP';}}
 if(s.status==='CLOSED')s.netR=(s.netR??0)-(s.cost?.price??conditionalCost(s.symbol,s.fill!).price)/risk;
 return s;
}
export function conditionalMessage(s:ConditionalSetup):string {
 const price=(v:number)=>Number(v.toPrecision(8)).toString();
 const time=(iso:string)=>new Intl.DateTimeFormat('en-KE',{timeZone:'Africa/Nairobi',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(iso))+' EAT';
 const headline=s.status==='WAITING'?'SETUP WATCH':s.status==='ARMED'?'CONDITION CONFIRMED':s.status==='ACTIVE'?(s.partial?'TP1 REACHED · HALF REMAINS':'PAPER ENTRY TRACKED'):s.status==='CLOSED'?'SETUP CLOSED':s.status==='EXPIRED'?'WATCH EXPIRED':s.status==='INVALIDATED'?'SETUP CANCELLED':'TRACKING PAUSED';
 const rows=[`HASHIBOT · ${s.track} · ${s.symbol} · ${s.side==='buy'?'LONG':'SHORT'}`,headline];
 if(s.status==='WAITING')rows.push('',s.reason,`Confirmation: ${s.timeframe} candle close ${s.side==='buy'?'above':'below'} ${price(s.trigger)}. Entry tracked at the next open, within ${price((s.management?.maximumChaseR??.25)*Math.abs(s.trigger-s.stop))} of the trigger on the chase side.`,`Stop: ${price(s.stop)}`,s.tp1===s.tp2?`Target: ${price(s.tp2)} · full paper position`:`TP1: ${price(s.tp1)} · take 50% | TP2: ${price(s.tp2)} · remainder`,`Valid until ${time(s.expiresAt)} · maximum hold ${s.holdBars} ${s.timeframe} bars`,'Risk guide: 0.25%–0.5% of account at the stop.');
 else if(s.status==='ARMED')rows.push(`Confirmed ${time(s.armedAt!)}. Next open must respect the original stop and chase limit.`);
 else if(s.status==='ACTIVE')rows.push(`Paper entry: ${price(s.fill!)}.`,s.partial?`TP1 ${price(s.tp1)} reached. 50% remains toward ${price(s.tp2)}; stop stays ${price(s.stop)}.`:`Stop ${price(s.stop)} · TP1 ${price(s.tp1)} · TP2 ${price(s.tp2)}.`);
 else if(s.status==='CLOSED')rows.push(`Paper entry ${price(s.fill!)} → exit ${price(s.exit!)}.`,`${s.result==='TP2'?'TP2 reached':s.result==='TIME_STOP'?'Holding period completed':'Stop reached'} · net ${(s.netR??0).toFixed(3)}R.`,`Paper result includes ${s.cost?.label??conditionalCost(s.symbol,s.fill!).label}; not actual fills.${s.result==='STOP_FIRST_AMBIGUOUS_BAR'?' Stop used where candle order is ambiguous.':''}`);
 else rows.push(s.status==='DATA_GAP'?'Outcome unknown.':s.status==='EXPIRED'?'The confirmation window closed without an entry.':'Original entry conditions no longer valid; no paper entry.');
 if(s.intelligence&&s.status==='WAITING')rows.push(`Context: ${s.intelligence.session} · higher timeframe ${s.intelligence.higherDirection>0?'up':s.intelligence.higherDirection<0?'down':'balanced'} · volume ${s.intelligence.volumeRatio.toFixed(2)}× recent average.`,s.intelligence.news==='SOURCE_AVAILABLE'?'News sources recorded alongside the setup.':s.intelligence.news==='HIGH_IMPACT_WINDOW'?'High-impact event window is being monitored.':'Price and market-structure evidence recorded.');
 rows.push('',`Strategy: ${s.strategy} · ${s.variant}`,`Ref: ${s.id}`);if(s.status!=='CLOSED')rows.push('Paper tracking');return rows.join('\n');
}
