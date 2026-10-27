import {atrRootV1,emaRootV1,rsiRootV1} from './indicator-engine.ts';
import {altClosedHours,evaluateAltRelativeStrength} from './crypto-relative-strength.ts';
import {CRYPTO_TEAM_ROLES,CRYPTO_TEAM_VERSION,CRYPTO_TEAM_SYMBOLS,CRYPTO_TEAM_ASSUMPTIONS,CRYPTO_TEAM_PROFILE,type CryptoTeamId} from './coordinated-crypto-contract.ts';
import {ALT_SYMBOLS} from './crypto-relative-strength-contract.ts';
import type {LegacyStrategyResult,StrategyCandle,StrategyDefinition,StrategyEvaluationContext} from './professional-strategies.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
export type TeamState='TREND_UP'|'TREND_DOWN'|'RANGE'|'EXPANSION_UP'|'EXPANSION_DOWN'|'TRANSITION'|'SHOCK'|'UNAVAILABLE';
export interface TeamFeatures {state:TeamState;hours:StrategyCandle[];atr:number;trend:number;efficiency:number;higherDirection:number;quoteRatio:number;high:number;low:number;ema:number;reason:string}
const empty=(reason:string):TeamFeatures=>({state:'UNAVAILABLE',hours:[],atr:0,trend:0,efficiency:0,higherDirection:0,quoteRatio:0,high:0,low:0,ema:0,reason});
const mean=(values:number[])=>values.reduce((n,x)=>n+x,0)/values.length;
const reject=(reason:string,state:TeamState='UNAVAILABLE'):LegacyStrategyResult=>({status:'rejected',direction:'none',entry_low:0,entry_high:0,stop_loss:0,tp1:0,tp2:0,risk_reward:0,confidence_score:0,grade:'reject',reason,rejection_reason:reason,score_breakdown:{research_only:true,score_is_probability:false,team_policy:'crypto-team/v1',team_state:state}});
/** Single market assessment for all four roles. All H1/H4 observations are closed. */
export function cryptoTeamFeatures(context:StrategyEvaluationContext):TeamFeatures {
 if(context.market!=='crypto'||context.timeframe!=='15m'||!CRYPTO_TEAM_SYMBOLS.includes(context.symbol))return empty('TEAM_IDENTITY_UNSUPPORTED');
 const at=Date.parse(context.evaluated_at);if(!Number.isFinite(at)||at%3600000!==0)return empty('WAIT_FOR_CLOSED_HOUR');
 const h=altClosedHours(context.candles,context.symbol,context.evaluated_at);if(h.length!==240)return empty('TEAM_NATIVE_HISTORY_REQUIRED');
 const prior=h.slice(0,-1),c=h.at(-1)!,previous=h.at(-2)!,atr=atrRootV1(prior,14),closes=h.map(b=>b.close),ema=emaRootV1(closes,20),fast=emaRootV1(closes,20),slow=emaRootV1(closes,50);
 // Regroup by absolute UTC boundaries; the rolling window can begin within an H4 candle.
 const groups=new Map<number,StrategyCandle[]>();for(const b of h){const t=Date.parse(b.open_time),bucket=Math.floor(t/14400000)*14400000;const g=groups.get(bucket)??[];g.push(b);groups.set(bucket,g);}
 const four=[...groups].flatMap(([t,g])=>g.length===4&&g.every((b,i)=>Date.parse(b.open_time)===t+i*3600000)?[{...g[0],timeframe:'4h',high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low)),close:g[3].close}]:[]);
 if(four.length<50||!(atr>0))return empty('TEAM_HIGHER_HISTORY_REQUIRED');
 const hc=four.map(b=>b.close),hf=emaRootV1(hc,8),hs=emaRootV1(hc,21),old=emaRootV1(hc.slice(0,-1),8),higherDirection=hf>hs&&hf>old?1:hf<hs&&hf<old?-1:0;
 const path=h.slice(-21),travel=path.slice(1).reduce((s,b,i)=>s+Math.abs(b.close-path[i].close),0),efficiency=travel?Math.abs(c.close-path[0].close)/travel:0,trend=(fast-slow)/atr,recent=h.slice(-25,-1),high=Math.max(...recent.map(b=>b.high)),low=Math.min(...recent.map(b=>b.low)),quoteRatio=c.quote_volume!/mean(recent.map(b=>b.quote_volume!));
 if(!Number.isFinite(quoteRatio)||!(mean(recent.map(b=>b.quote_volume!))>0))return empty('TEAM_NATIVE_VOLUME_REQUIRED');
 const compressed=mean(prior.slice(-6).map(b=>b.high-b.low))<.85*atr,up=compressed&&c.close>high+.1*atr&&quoteRatio>=1.5&&higherDirection>=0,down=compressed&&c.close<low-.1*atr&&quoteRatio>=1.5&&higherDirection<=0;
 let state:TeamState='TRANSITION';
 if(Math.max(c.high-c.low,Math.abs(c.high-previous.close),Math.abs(c.low-previous.close))>3*atr||Math.abs(c.open-previous.close)>atr)state='SHOCK';
 else if(up)state='EXPANSION_UP';else if(down)state='EXPANSION_DOWN';
 else if(trend>.6&&efficiency>=.25&&higherDirection===1)state='TREND_UP';else if(trend<-.6&&efficiency>=.25&&higherDirection===-1)state='TREND_DOWN';
 else if(Math.abs(trend)<.4&&efficiency<.2&&Math.abs(hf-hs)/atr<1)state='RANGE';
 return {state,hours:h,atr,trend,efficiency,higherDirection,quoteRatio,high,low,ema,reason:state};
}
export function evaluateCryptoTeam(id:CryptoTeamId,context:StrategyEvaluationContext,features=cryptoTeamFeatures(context)):LegacyStrategyResult {
 if(!CRYPTO_TEAM_ROLES.some(r=>r.id===id)||Object.keys(context.strategy_parameters??{}).length)return reject('TEAM_FROZEN_POLICY_REQUIRED');
 const f=features;if(['UNAVAILABLE','SHOCK','TRANSITION'].includes(f.state))return reject(f.reason,f.state);
 const h=f.hours,c=h.at(-1)!,p=h.at(-2)!,prior=h.slice(0,-1),atr=f.atr;let side=0,stop=0,target=0,setup='';
 if(id==='crypto.team-alt'){
  if(!['TREND_UP','EXPANSION_UP'].includes(f.state))return reject('ALT_REQUIRES_BULLISH_TEAM_STATE',f.state);
  const original=evaluateAltRelativeStrength(context);if(original.status!=='candidate')return original;
  return {...original,score_breakdown:{...original.score_breakdown,team_policy:'crypto-team/v1',team_role:id,team_state:f.state,higher_direction:f.higherDirection,source_close:context.evaluated_at}};
 }
 if(id==='crypto.team-trend'){
  side=f.state==='TREND_UP'?1:f.state==='TREND_DOWN'?-1:0;if(!side)return reject('TREND_ROLE_INELIGIBLE',f.state);
  const oldEma=emaRootV1(prior.map(b=>b.close),20),touched=side===1?Math.min(...h.slice(-4,-1).map(b=>b.low))<=oldEma+.25*atr:Math.max(...h.slice(-4,-1).map(b=>b.high))>=oldEma-.25*atr;
  if(!touched||side*(c.close-c.open)<.15*atr||Math.abs(c.close-f.ema)>1.5*atr||(side===1?c.close<=p.high||c.close<f.ema:c.close>=p.low||c.close>f.ema))return reject('NO_CLOSED_TREND_RECLAIM',f.state);
  stop=side===1?Math.min(...h.slice(-5).map(b=>b.low))-.15*atr:Math.max(...h.slice(-5).map(b=>b.high))+.15*atr;stop=side===1?Math.min(stop,c.close-1.5*atr):Math.max(stop,c.close+1.5*atr);target=c.close+side*2.5*Math.abs(c.close-stop);setup='H1_PULLBACK_H4_TREND';
 }else if(id==='crypto.team-range'){
  if(f.state!=='RANGE')return reject('RANGE_ROLE_INELIGIBLE',f.state);const rsi=rsiRootV1(prior.map(b=>b.close),2);
  const buy=c.low<f.low&&c.close>f.low&&c.close>c.open&&rsi<30,sell=c.high>f.high&&c.close<f.high&&c.close<c.open&&rsi>70;
  if(!buy&&!sell||f.high-f.low<4*atr)return reject('NO_BALANCED_RANGE_REJECTION',f.state);side=buy?1:-1;stop=side===1?Math.min(c.low-.15*atr,c.close-1.25*atr):Math.max(c.high+.15*atr,c.close+1.25*atr);target=f.ema;setup='H1_RANGE_SWEEP_TO_MEAN';
 }else{
  side=f.state==='EXPANSION_UP'?1:f.state==='EXPANSION_DOWN'?-1:0;if(!side)return reject('BREAKOUT_ROLE_INELIGIBLE',f.state);
  if(side*(c.close-c.open)<.25*atr||Math.abs(c.close-c.open)>2*atr)return reject('BREAKOUT_IMPULSE_OR_CHASE',f.state);
  stop=side===1?Math.min(c.close-2*atr,...h.slice(-7).map(b=>b.low)):Math.max(c.close+2*atr,...h.slice(-7).map(b=>b.high));target=c.close+side*3*Math.abs(c.close-stop);setup='H1_COMPRESSION_ACCEPTANCE';
 }
 const risk=(c.close-stop)*side,rr=(target-c.close)*side/risk,costR=c.close*.0025/risk;
 if(!(risk>0&&stop>0&&target>0&&rr>=1.5&&costR<=.25)||risk/c.close>.1)return reject('TEAM_COST_OR_GEOMETRY_REJECTED',f.state);
 return {status:'candidate',direction:side===1?'buy':'sell',entry_low:c.close,entry_high:c.close,stop_loss:stop,tp1:target,tp2:target,risk_reward:rr,confidence_score:80,grade:'A',reason:setup,rejection_reason:'',score_breakdown:{team_policy:'crypto-team/v1',team_role:id,team_state:f.state,higher_direction:f.higherDirection,efficiency:f.efficiency,estimated_cost_r:costR,estimated_cost_bps:25,score_is_probability:false,research_only:true,source_close:context.evaluated_at}};
}
export function coordinatedCryptoDefinitions(resolve?:(name:string)=>import('./professional-strategies.ts').StrategyRuntimeConfig&{config_source?:string}):StrategyDefinition[]{
 let rows:readonly StrategyCandle[]|undefined,at='',features:TeamFeatures;
 return CRYPTO_TEAM_ROLES.map(role=>{const stored=resolve?.(role.name),released=stored?.enabled===true&&stored.config_source?.startsWith('measured_release:')===true;return {id:role.id,version:CRYPTO_TEAM_VERSION,legacyName:role.name,market:'crypto',lifecycle:released?'ENABLED':'DISABLED',publicationMode:released?'LIVE':'SHADOW',certification:released?'PRODUCTION':'RESEARCH',config:released?stored!:{strategy_name:role.name,enabled:false,min_score:75,min_rr:1.5,max_bars_in_trade:96,allowed_symbols:role.id==='crypto.team-alt'?[...ALT_SYMBOLS]:[...CRYPTO_TEAM_SYMBOLS],allowed_timeframes:['15m'],params:{}},evaluate:context=>{if(rows!==context.candles||at!==context.evaluated_at){rows=context.candles;at=context.evaluated_at;features=cryptoTeamFeatures(context);}return evaluateCryptoTeam(role.id,context,features);}};});
}
export function coordinatedConfiguration(selection:string=CRYPTO_TEAM_PROFILE):ApprovedReplayConfiguration&{researchOnly:true}{
 const definitions=coordinatedCryptoDefinitions().filter(d=>selection===CRYPTO_TEAM_PROFILE||d.id===selection);if(!definitions.length)throw Error('UNKNOWN_CRYPTO_TEAM_SELECTION');
 return {researchOnly:true,version:'research/crypto-team/v1',minSignalGrade:'A',outcomeAssumptions:{...CRYPTO_TEAM_ASSUMPTIONS},strategies:definitions.map(d=>({id:d.id,version:d.version,enabled:true,minScore:75,minRiskReward:1.5,maxBarsInTrade:96,symbols:[...d.config.allowed_symbols],timeframes:['15m'],parameters:{}}))};
}
