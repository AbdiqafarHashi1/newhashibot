import type {CanonicalReplayEvidence,CanonicalReplayCheckpoint} from './canonical-historical-replay.ts';
import {watchTrack} from './conditional-contract.ts';
export interface ConversionRow {
 strategy:string;symbol:string;market:string;timeframe:string;track:string;evaluations:number;rawOpportunities:number;pendingOpportunities:number;
 immediate:number;conditional:number;noTrade:number;admitted:number;confirmed:number;triggeredWatches:number;expired:number;invalidated:number;
 duplicateReevaluations:number;admissionRejected:number;rejections:Record<string,number>;firstAt:string|null;lastAt:string|null;
}
/** Counts unique closed-candle evaluations/opportunities, not repeated minute polling as new trades.
 * Filter reasons overlap; their sum is deliberately NOT represented as an exclusive waterfall. */
export class ResearchConversionFunnel {
 private rows=new Map<string,ConversionRow>();private seen=new Set<string>();private rejected=new Set<string>();
 private bySetup=new Map<string,ConversionRow>();private initialKinds=new Map<string,string>();private admitted=new Set<string>();private terminal=new Set<string>();
 snapshot(){return {schema:'research-conversion-funnel/v1' as const,rows:[...this.rows.entries()],seen:[...this.seen],rejected:[...this.rejected],bySetup:[...this.bySetup].map(([key,row])=>[key,[row.strategy,row.symbol,row.timeframe].join('|')] as const),initialKinds:[...this.initialKinds.entries()],admitted:[...this.admitted],terminal:[...this.terminal]};}
 constructor(resume?:ReturnType<ResearchConversionFunnel['snapshot']>){if(!resume)return;if(resume.schema!=='research-conversion-funnel/v1')throw Error('FUNNEL_CHECKPOINT_SCHEMA_INVALID');this.rows=new Map(structuredClone(resume.rows));this.seen=new Set(resume.seen);this.rejected=new Set(resume.rejected);this.bySetup=new Map(resume.bySetup.map(([key,row])=>{const value=this.rows.get(row);if(!value)throw Error('FUNNEL_CHECKPOINT_ROW_MISSING');return [key,value];}));this.initialKinds=new Map(resume.initialKinds);this.admitted=new Set(resume.admitted);this.terminal=new Set(resume.terminal);}
 private row(strategy:string,symbol:string,timeframe:string){const key=[strategy,symbol,timeframe].join('|');let row=this.rows.get(key);if(!row){row={strategy,symbol,market:symbol.endsWith('USDT')?'crypto':symbol.startsWith('XA')?'metals':'forex',timeframe,track:watchTrack(timeframe,strategy),evaluations:0,rawOpportunities:0,pendingOpportunities:0,immediate:0,conditional:0,noTrade:0,admitted:0,confirmed:0,triggeredWatches:0,expired:0,invalidated:0,duplicateReevaluations:0,admissionRejected:0,rejections:{},firstAt:null,lastAt:null};this.rows.set(key,row);}return row;}
 observe(e:CanonicalReplayEvidence,c:CanonicalReplayCheckpoint){
  for(const o of e.observations){const v=o.evidence,d=v.entry_decision as {opportunityId?:string;kind?:string;reasons?:string[]}|undefined;
   const row=this.row(o.strategy_id,o.symbol,o.timeframe),key=[o.strategy_id,o.symbol,o.timeframe,v.source_close??d?.opportunityId??o.checked_at].join('|');
   if(d?.opportunityId)this.bySetup.set(d.opportunityId,row);
   if(this.seen.has(key))continue;this.seen.add(key);row.evaluations++;row.firstAt??=o.checked_at;row.lastAt=o.checked_at;
   if(v.raw_candidate===true||v.evaluator_status==='candidate')row.rawOpportunities++;
   if(v.conditional_candidate===true)row.pendingOpportunities++;
   if(o.decision==='IMMEDIATE_CONFIRMED')row.immediate++;else if(o.decision==='CONDITIONAL_WATCH')row.conditional++;else row.noTrade++;
   if(d?.opportunityId&&d.kind)this.initialKinds.set(d.opportunityId,d.kind);
   const reasons=[...(d?.reasons??[]),...((v.setup_admission_rejections as string[]|undefined)??[])];
   if(!reasons.length&&!['IMMEDIATE_CONFIRMED','CONDITIONAL_WATCH'].includes(o.decision))reasons.push(o.reason);
   for(const reason of new Set(reasons))row.rejections[reason]=(row.rejections[reason]??0)+1;
  }
  for(const record of c.store.records){const s=record.state,row=this.row(s.strategy,s.symbol,s.timeframe);this.bySetup.set(s.id,row);
   if(!this.admitted.has(s.id)){this.admitted.add(s.id);row.admitted++;}
   if(s.watchOutcome&&!this.terminal.has(s.id)){this.terminal.add(s.id);if(s.watchOutcome==='CONFIRMED'){row.confirmed++;if(this.initialKinds.get(s.id)==='CONDITIONAL_WATCH')row.triggeredWatches++;}else if(s.watchOutcome==='EXPIRED')row.expired++;else if(s.watchOutcome==='INVALIDATED')row.invalidated++;}
  }
  for(const r of e.rejections){const key=r.setupId+'|'+r.reason;if(this.rejected.has(key))continue;this.rejected.add(key);const row=this.bySetup.get(r.setupId);if(!row)continue;
   if(r.reason==='DUPLICATE_OPPORTUNITY_REEVALUATION'||this.admitted.has(r.setupId)){row.duplicateReevaluations++;continue;}
   row.admissionRejected++;row.rejections[r.reason]=(row.rejections[r.reason]??0)+1;
  }
 }
 report(start:number,end:number){const days=(end-start)/86400000;return {schema:'scanner-conversion-funnel/v1',period:{start:new Date(start).toISOString(),end:new Date(end).toISOString(),days},counting:'Unique strategy/symbol/timeframe/closed-candle evaluations; overlapping rejection reasons; confirmations are signal references, not broker fills',rows:[...this.rows.values()].sort((a,b)=>a.strategy.localeCompare(b.strategy)||a.symbol.localeCompare(b.symbol)||a.timeframe.localeCompare(b.timeframe)).map(r=>({...r,signalsPerDay:days>0?r.confirmed/days:null,signalsPerWeek:days>0?r.confirmed/days*7:null,executionAuthorized:null,brokerExecuted:null,expectancy:null,profitFactor:null,drawdown:null,performanceStatus:'EXECUTION_MODEL_REQUIRED'}))};}
}
