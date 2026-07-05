import { createHash } from 'node:crypto';
import type { Direction, ISODateTime, Market, Timeframe } from '../../packages/types/index.js';
import { createEvent, type EventBus } from '../../packages/events/index.js';
import type { Environment, Provider, StrategyCandidate, StrategyGrade, StrategyLifecycleStatus } from '../../strategies/index.js';

export type SignalState='Created'|'Approved'|'Rejected'|'Expired'|'Cancelled'|'Archived'|'Closed';
export type ArbitrationStatus='WINNER'|'MULTIPLE_VALID'|'NO_TRADE';
export type ArbitrationRejectCode='EXPIRED'|'DUPLICATE_SYMBOL'|'DUPLICATE_DIRECTION_TIMEFRAME'|'DUPLICATE_STRATEGY'|'CONFLICTING_DIRECTION'|'CORRELATED_OPPORTUNITY'|'COOLDOWN_ACTIVE'|'TIMEFRAME_CONFLICT'|'STRATEGY_CONFLICT'|'WEAK_CONFIDENCE'|'WEAK_GRADE'|'WEAK_RR'|'POOR_LIQUIDITY'|'BAD_VOLATILITY'|'WEAK_TREND'|'WEAK_MOMENTUM'|'WEAK_STRUCTURE'|'SESSION_CLOSED'|'UNSUITABLE_REGIME'|'STRATEGY_UNHEALTHY'|'NOT_CERTIFIED';
export interface MarketDecisionContext{ now:ISODateTime; marketRegime?:string; session?:string; symbolCooldowns?:Record<string,ISODateTime>; strategyHealth?:Record<string,'Healthy'|'Warning'|'Failed'>; strategyCertification?:Record<string,'Production'|'Experimental'>; correlations?:Record<string,readonly string[]>; activeSignals?:readonly ImmutableSignal[] }
export interface ArbitratorPolicy{ minConfidence:number; minRR:number; allowedGrades:readonly StrategyGrade[]; cooldownMs:number; maxAlternatives:number; allowMultipleValid:boolean; correlationGroups:Record<string,readonly string[]>; gradeWeights:Record<StrategyGrade,number>; lifecycleWeights:Record<StrategyLifecycleStatus,number> }
export interface CandidateRejection{ candidateId:string; strategyId:string; symbol:string; code:ArbitrationRejectCode; reason:string; score?:number }
export interface RankedCandidate{ candidate:StrategyCandidate; score:number; rank:number; reasons:readonly string[] }
export type ArbitrationResult={status:'NO_TRADE'; winner:null; alternatives:readonly RankedCandidate[]; rejected:readonly CandidateRejection[]; reasonCodes:readonly string[]; metrics:ArbitratorMetrics}|{status:'WINNER'|'MULTIPLE_VALID'; winner:RankedCandidate; alternatives:readonly RankedCandidate[]; rejected:readonly CandidateRejection[]; reasonCodes:readonly string[]; metrics:ArbitratorMetrics};
export interface ArbitratorMetrics{ evaluated:number; accepted:number; rejected:number; duplicates:number; conflicts:number; correlated:number; expired:number; cooldowns:number; averageScore:number; decisionLatencyMs:number }
export interface ImmutableSignal{ readonly signalId:string; readonly version:1; readonly state:SignalState; readonly strategy:{id:string;version:string}; readonly provider:Provider; readonly environment:Environment; readonly market:Market; readonly symbol:string; readonly timeframe:Timeframe; readonly direction:Direction; readonly entry:number; readonly stopLoss:number; readonly tp1:number; readonly tp2:number; readonly tp3?:number; readonly confidence:number; readonly grade:StrategyGrade; readonly rr:number; readonly expectedDuration:string; readonly createdAt:ISODateTime; readonly expiresAt:ISODateTime; readonly reasonCodes:readonly string[]; readonly featureSnapshot:Readonly<Record<string,unknown>>; readonly indicatorSnapshot:Readonly<Record<string,unknown>>; readonly metadata:Readonly<Record<string,unknown>>; readonly sourceCandidateId:string; readonly signalHash:string }
export interface SignalLifecycleRecord{ readonly signal:ImmutableSignal; readonly state:SignalState; readonly occurredAt:ISODateTime; readonly reason?:string; readonly eventHash:string }

const defaultPolicy:ArbitratorPolicy={minConfidence:.6,minRR:1.4,allowedGrades:['A+','A','B','C'],cooldownMs:30*60_000,maxAlternatives:3,allowMultipleValid:true,correlationGroups:{BTCUSDT:['ETHUSDT','BNBUSDT'],ETHUSDT:['BTCUSDT','BNBUSDT'],EURUSD:['GBPUSD'],GBPUSD:['EURUSD']},gradeWeights:{'A+':100,A:88,B:74,C:60,Reject:0},lifecycleWeights:{PRODUCTION_CERTIFIED:12,RESEARCH_READY:4,REJECTED:-100}};
const n=(x:unknown,fb=0)=>typeof x==='number'&&Number.isFinite(x)?x:fb;
const getPrice=(x:unknown)=>n(typeof x==='object'&&x!==null&&'price'in x?(x as {price:unknown}).price:x);
const expiry=(c:StrategyCandidate)=>c.expiry??new Date(Date.parse(c.createdAt)+30*60_000).toISOString();
const rr=(c:StrategyCandidate)=>n(c.expectedRR,c.riskReward);
const grade=(c:StrategyCandidate):StrategyGrade=>c.grade??(c.score>=90?'A+':c.score>=82?'A':c.score>=72?'B':c.score>=62?'C':'Reject');
const key=(c:StrategyCandidate)=>`${c.market}:${c.symbol}:${c.timeframe}:${c.direction}:${c.strategyId}`;
const signalKey=(s:ImmutableSignal)=>`${s.market}:${s.symbol}:${s.timeframe}:${s.direction}:${s.strategy.id}`;
const round=(x:number,d=6)=>Number(x.toFixed(d));

export class Arbitrator{
  constructor(private readonly policy:ArbitratorPolicy=defaultPolicy){}
  decide(candidates:readonly StrategyCandidate[], ctx:MarketDecisionContext):ArbitrationResult{
    const started=Date.now(), rejected:CandidateRejection[]=[], ranked:RankedCandidate[]=[], seen=new Set<string>(), symbolDirs=new Map<string,Direction>(), strategySymbolTf=new Set<string>();
    let duplicates=0, conflicts=0, correlated=0, expiredCount=0, cooldowns=0;
    for(const c of [...candidates].sort((a,b)=>a.candidateId.localeCompare(b.candidateId))){
      const reject=(code:ArbitrationRejectCode, reason:string, score?:number)=>{rejected.push({candidateId:c.candidateId,strategyId:c.strategyId,symbol:c.symbol,code,reason,score}); if(code.startsWith('DUPLICATE'))duplicates++; if(code.includes('CONFLICT'))conflicts++; if(code==='CORRELATED_OPPORTUNITY')correlated++; if(code==='EXPIRED')expiredCount++; if(code==='COOLDOWN_ACTIVE')cooldowns++;};
      if(Date.parse(expiry(c))<=Date.parse(ctx.now)){reject('EXPIRED','candidate expiry is in the past');continue;}
      if(ctx.symbolCooldowns?.[c.symbol]&&Date.parse(ctx.symbolCooldowns[c.symbol])>Date.parse(ctx.now)){reject('COOLDOWN_ACTIVE','symbol cooldown has not elapsed');continue;}
      const active=(ctx.activeSignals??[]).find(s=>signalKey(s)===key(c)&&Date.parse(s.expiresAt)>Date.parse(ctx.now));
      if(active){reject('DUPLICATE_SYMBOL','active signal already covers this symbol/direction/timeframe/strategy');continue;}
      if(seen.has(key(c))){reject('DUPLICATE_DIRECTION_TIMEFRAME','duplicate symbol direction timeframe strategy fingerprint');continue;}
      if(strategySymbolTf.has(`${c.strategyId}:${c.symbol}:${c.timeframe}`)){reject('DUPLICATE_STRATEGY','strategy already emitted this symbol/timeframe');continue;}
      if(symbolDirs.has(c.symbol)&&symbolDirs.get(c.symbol)!==c.direction){reject('CONFLICTING_DIRECTION','same symbol has conflicting direction');continue;}
      if([...symbolDirs.keys()].some(s=>this.correlated(s,c.symbol)&&symbolDirs.get(s)!==c.direction)){reject('CORRELATED_OPPORTUNITY','correlated symbol has opposing direction');continue;}
      const health=ctx.strategyHealth?.[c.strategyId]??'Healthy', cert=ctx.strategyCertification?.[c.strategyId]??(c.lifecycleStatus==='PRODUCTION_CERTIFIED'?'Production':'Experimental');
      if(health==='Failed'){reject('STRATEGY_UNHEALTHY','strategy health is failed');continue;}
      if(cert!=='Production'){reject('NOT_CERTIFIED','strategy is not production certified');continue;}
      const f=(c.featureSnapshot??{}) as Record<string,unknown>, g=grade(c), r=rr(c);
      if(!this.policy.allowedGrades.includes(g)||g==='Reject'){reject('WEAK_GRADE',`grade ${g} is not allowed`);continue;}
      if(c.confidence<this.policy.minConfidence){reject('WEAK_CONFIDENCE',`confidence ${c.confidence} below ${this.policy.minConfidence}`);continue;}
      if(r<this.policy.minRR){reject('WEAK_RR',`RR ${r} below ${this.policy.minRR}`);continue;}
      if(f.liquidityState==='thin'){reject('POOR_LIQUIDITY','MarketFeatures liquidityState is thin');continue;}
      if(f.marketRegime==='high_volatility'||f.marketRegime==='low_volatility'){reject('BAD_VOLATILITY',`marketRegime ${String(f.marketRegime)} blocked`);continue;}
      if(n(f.trendStrength,50)<12){reject('WEAK_TREND','trendStrength below arbitrator floor');continue;}
      if(n(f.momentumScore,50)<35){reject('WEAK_MOMENTUM','momentumScore below arbitrator floor');continue;}
      if(n(f.structureScore,50)<30){reject('WEAK_STRUCTURE','structureScore below arbitrator floor');continue;}
      if(ctx.session==='off_hours'||f.session==='weekend'){reject('SESSION_CLOSED','session is closed');continue;}
      if(ctx.marketRegime==='range'&&f.marketRegime==='range'){reject('UNSUITABLE_REGIME','range regime not accepted for arbitration');continue;}
      const score=this.score(c,ctx,health,cert); ranked.push({candidate:c,score,rank:0,reasons:[`score=${score}`,`grade=${g}`,`rr=${r}`,`health=${health}`,`certification=${cert}`]});
      seen.add(key(c)); symbolDirs.set(c.symbol,c.direction); strategySymbolTf.add(`${c.strategyId}:${c.symbol}:${c.timeframe}`);
    }
    ranked.sort((a,b)=>b.score-a.score||b.candidate.confidence-a.candidate.confidence||a.candidate.candidateId.localeCompare(b.candidate.candidateId)); ranked.forEach((r,i)=>(r.rank=i+1));
    const alternatives=ranked.slice(1,1+this.policy.maxAlternatives), avg=ranked.length?round(ranked.reduce((s,x)=>s+x.score,0)/ranked.length):0, metrics={evaluated:candidates.length,accepted:ranked.length,rejected:rejected.length,duplicates,conflicts,correlated,expired:expiredCount,cooldowns,averageScore:avg,decisionLatencyMs:0};
    if(!ranked.length)return{status:'NO_TRADE',winner:null,alternatives:[],rejected,reasonCodes:['NO_VALID_CANDIDATES'],metrics};
    return{status:this.policy.allowMultipleValid&&ranked.length>1?'MULTIPLE_VALID':'WINNER',winner:ranked[0],alternatives,rejected,reasonCodes:['ARBITRATION_COMPLETE'],metrics};
  }
  private correlated(a:string,b:string){return a===b||this.policy.correlationGroups[a]?.includes(b)||this.policy.correlationGroups[b]?.includes(a)}
  private score(c:StrategyCandidate,ctx:MarketDecisionContext,health:string,cert:string){const f=(c.featureSnapshot??{}) as Record<string,unknown>;return round(c.score*.2+c.confidence*100*.18+Math.min(rr(c),4)*25*.16+this.policy.gradeWeights[grade(c)]*.14+n(f.trendStrength,50)*.08+n(f.momentumScore,50)*.08+n(f.volumeScore,50)*.05+n(f.structureScore,50)*.05+(health==='Healthy'?5:0)+(cert==='Production'?4:0)+this.policy.lifecycleWeights[c.lifecycleStatus]*.02-(ctx.marketRegime==='range'?5:0));}
}

export class ImmutableSignalEngine{
  constructor(private readonly bus?:EventBus){}
  async create(winner:RankedCandidate, now=new Date().toISOString()):Promise<ImmutableSignal>{const c=winner.candidate, tps=c.takeProfits??[], sig={version:1 as const,state:'Created' as const,strategy:{id:c.strategyId,version:c.strategyVersion},provider:c.provider??'mock',environment:c.environment??'backtest',market:c.market,symbol:c.symbol,timeframe:c.timeframe,direction:c.direction,entry:getPrice(c.entry),stopLoss:getPrice(c.stopLoss),tp1:n(c.tp1,tps[0]?.price),tp2:n(c.tp2,tps[1]?.price),tp3:c.tp3??tps[2]?.price,confidence:c.confidence,grade:grade(c),rr:rr(c),expectedDuration:c.expectedDuration,createdAt:now,expiresAt:expiry(c),reasonCodes:[...(c.reasonCodes??c.reasons??[])],featureSnapshot:Object.freeze({...((c.featureSnapshot??{}) as Record<string,unknown>)}),indicatorSnapshot:Object.freeze({...((c.indicatorSnapshot??{}) as Record<string,unknown>)}),metadata:Object.freeze({...(c.metadata??{}),arbitrationScore:winner.score,arbitrationRank:winner.rank}),sourceCandidateId:c.candidateId}; const signalHash=hash(sig), signalId=`sig_${signalHash.slice(0,24)}`; const frozen=deepFreeze({...sig,signalId,signalHash}); await this.publish('SignalCreated',frozen); return frozen;}
  async transition(signal:ImmutableSignal,to:SignalState,reason:string,at=new Date().toISOString()):Promise<SignalLifecycleRecord>{if(!allowed[signal.state].includes(to))throw new Error(`Illegal signal transition ${signal.state} -> ${to}`); const record=deepFreeze({signal,state:to,occurredAt:at,reason,eventHash:hash({signalId:signal.signalId,from:signal.state,to,at,reason})}); await this.publish(eventFor(to),record); return record;}
  private async publish(eventType:'SignalCreated'|'SignalApproved'|'SignalRejected'|'SignalExpired'|'SignalCancelled'|'SignalArchived',payload:Record<string,unknown>){if(this.bus)await this.bus.publish(createEvent(eventType,payload,{source:'immutable-signal-engine'}));}
}
const allowed:Record<SignalState,SignalState[]>={Created:['Approved','Rejected','Expired','Cancelled'],Approved:['Closed','Expired','Cancelled','Archived'],Rejected:['Archived'],Expired:['Archived'],Cancelled:['Archived'],Closed:['Archived'],Archived:[]};
const eventFor=(s:SignalState):'SignalApproved'|'SignalRejected'|'SignalExpired'|'SignalCancelled'|'SignalArchived'=>s==='Approved'?'SignalApproved':s==='Rejected'?'SignalRejected':s==='Expired'?'SignalExpired':s==='Cancelled'?'SignalCancelled':'SignalArchived';
export class ActiveSignalCache{private signals=new Map<string,ImmutableSignal>(); add(signal:ImmutableSignal){this.signals.set(signal.signalId,signal)} get(id:string){return this.signals.get(id)} active(now:ISODateTime){return [...this.signals.values()].filter(s=>Date.parse(s.expiresAt)>Date.parse(now)&&s.state!=='Archived'&&s.state!=='Closed'&&s.state!=='Cancelled'&&s.state!=='Expired')} remove(id:string){this.signals.delete(id)} clear(){this.signals.clear()} stats(now:ISODateTime){const a=this.active(now);return{active:a.length,total:this.signals.size,bySymbol:a.reduce<Record<string,number>>((m,s)=>(m[s.symbol]=(m[s.symbol]??0)+1,m),{})}}}
function hash(x:unknown){return createHash('sha256').update(JSON.stringify(x)).digest('hex')}
function deepFreeze<T>(o:T):T{Object.freeze(o);for(const v of Object.values(o as Record<string,unknown>)){if(v&&typeof v==='object'&&!Object.isFrozen(v))deepFreeze(v)}return o}
