import type {ConditionalSetup} from './conditional-signal-service.ts';
import {watchWidth} from './conditional-contract.ts';

export const PAPER_LEARNING_POLICY='paper-learning/rank-v1';
const DAY=86400000, WINDOW=30*DAY, MIN_CLOSED=20;
export interface PaperLearningEvidence {
 policy:string; status:'COLLECTING'|'ADAPTING'|'UNAVAILABLE'; asOf:string; cohortKey:string;
 closed:number; wins:number; losses:number; unresolved:number; noEntry:number;
 meanNetR:number|null; shrunkNetR:number|null; effectiveSamples:number; adjustment:number;
 reason:string; sourceReferences:string[];
}
interface Outcome {state:ConditionalSetup;created_at:string;updated_at:string;}
export interface PaperLearningSnapshot {available:boolean;asOf:number;rows:readonly Outcome[];reason:string;}
/** Exact compatibility prevents results from another asset, source, configuration or regime leaking in. */
export function paperLearningKey(s:ConditionalSetup):string {
 return JSON.stringify([s.policy,s.symbol,s.strategy,s.origin?.version??s.policy,
  s.origin?.plan.provenance.config_hash??'broad-profile/v1',s.timeframe,s.track,s.side,s.variant,
  s.source,s.cost?.label??'legacy-cost',s.intelligence?.volatility?.band??'UNCLASSIFIED']);
}
/** One complete server-side snapshot, not a truncated REST result or an in-memory session counter. */
export async function loadPaperLearning(db:any,now=Date.now()):Promise<PaperLearningSnapshot> {
 const unavailable=(reason:string):PaperLearningSnapshot=>({available:false,asOf:now,rows:[],reason});
 try {
  const {data,error}=await db.rpc('conditional_proof_cohort',{
   p_start:new Date(now-WINDOW).toISOString(),p_end:new Date(now).toISOString()
  });
  if(error||!data||!Array.isArray(data.rows)||data.total!==data.rows.length||data.total>10000)
   return unavailable('Complete learning history unavailable; original strategy ranking retained.');
  const observed=Date.parse(data.observed_at);
  if(!Number.isFinite(observed)||Math.abs(observed-now)>60000)return unavailable('Learning snapshot time invalid.');
  const ids=new Set<string>();
  for(const r of data.rows){
   if(!r?.state?.id||ids.has(r.state.id)||!Number.isFinite(Date.parse(r.created_at))||
    !Number.isFinite(Date.parse(r.updated_at))||Date.parse(r.created_at)<now-WINDOW||Date.parse(r.created_at)>=now||
    Date.parse(r.updated_at)<Date.parse(r.created_at)||Date.parse(r.updated_at)>observed)
    return unavailable('Learning history is incomplete or inconsistent.');
   ids.add(r.state.id);
  }
  return {available:true,asOf:now,rows:data.rows,reason:'Complete rolling 30-day creation cohort.'};
 }catch{return unavailable('Learning history read failed; original strategy ranking retained.');}
}
/** Bounded online ranking; this is observed paper feedback, not an estimated win probability. */
export function assessPaperLearning(s:ConditionalSetup,snapshot:PaperLearningSnapshot,now:number):PaperLearningEvidence {
 const key=paperLearningKey(s),cutoff=Math.min(now,snapshot.asOf);
 if(!Number.isFinite(cutoff))throw Error('LEARNING_TIME_INVALID');
 const evidence:PaperLearningEvidence={policy:PAPER_LEARNING_POLICY,status:'COLLECTING',asOf:new Date(cutoff).toISOString(),cohortKey:key,
  closed:0,wins:0,losses:0,unresolved:0,noEntry:0,meanNetR:null,shrunkNetR:null,effectiveSamples:0,adjustment:0,
  reason:'Collecting comparable completed paper trades; original strategy ranking retained.',sourceReferences:[]};
 if(!snapshot.available||!Number.isFinite(cutoff)||now-snapshot.asOf>300000||snapshot.asOf>now){
  return {...evidence,status:'UNAVAILABLE',reason:!snapshot.available?snapshot.reason:'Learning snapshot is stale or from the future; original strategy ranking retained.'};
 }
 let weighted=0,weight=0,squaredWeight=0,total=0;
 for(const r of snapshot.rows){
  const p=r.state;
  if(p.id===s.id||paperLearningKey(p)!==key||Date.parse(r.created_at)<cutoff-WINDOW||Date.parse(r.created_at)>=cutoff||Date.parse(r.updated_at)>cutoff)continue;
  const closeAt=Date.parse(p.lastBar)+watchWidth(p.timeframe);
  if(p.status==='CLOSED'&&Number.isFinite(p.netR)&&Number.isFinite(p.fill)&&p.fill!>0&&
   p.cost&&Number.isFinite(p.cost.price)&&p.cost.price>=0&&Number.isFinite(closeAt)&&closeAt<=cutoff&&closeAt<=Date.parse(r.updated_at)){
   const w=Math.pow(.5,(cutoff-closeAt)/(14*DAY));
   // Clip only ranking influence. Raw net R and the complete trade ledger remain untouched.
   weighted+=Math.max(-3,Math.min(3,p.netR!))*w;weight+=w;squaredWeight+=w*w;total+=p.netR!;
   evidence.closed++;if(p.netR!>0)evidence.wins++;if(p.netR!<0)evidence.losses++;
   if(evidence.sourceReferences.length<20)evidence.sourceReferences.push(p.id);
  }else if(['EXPIRED','INVALIDATED'].includes(p.status)&&p.fill===undefined)evidence.noEntry++;
  else evidence.unresolved++;
 }
 evidence.meanNetR=evidence.closed?total/evidence.closed:null;
 evidence.effectiveSamples=squaredWeight?weight*weight/squaredWeight:0;
 evidence.shrunkNetR=weight?weighted/(weight+20):null;
 // Pending/gapped outcomes must not make an incomplete cohort look like a winning one.
 const resolution=evidence.closed/(evidence.closed+evidence.unresolved||1);
 if(evidence.closed>=MIN_CLOSED&&evidence.effectiveSamples>=MIN_CLOSED*.9&&resolution>=.8){
  evidence.status='ADAPTING';
  evidence.adjustment=Number(Math.max(-5,Math.min(5,5*evidence.shrunkNetR!)).toFixed(4));
  evidence.reason='Comparable cost-adjusted paper outcomes influence priority by at most five points; original plan unchanged.';
 }else if(evidence.closed>=MIN_CLOSED&&resolution<.8)evidence.reason='Too many unresolved comparable trades; original ranking retained.';
 return evidence;
}
export function applyPaperLearning(s:ConditionalSetup,snapshot:PaperLearningSnapshot,now:number):ConditionalSetup {
 const learning=assessPaperLearning(s,snapshot,now);
 return {...s,learning,selectionScore:Math.max(0,Math.min(100,s.score+learning.adjustment))};
}
