import assert from 'node:assert/strict';
import {SupabaseWorkerStore} from '../../cloud/worker/store.ts';
import {createHandlers} from '../../cloud/worker/handlers.ts';
import {runSlice} from '../../cloud/worker/runtime.ts';
import type {PortableJob} from '../../supabase/functions/_shared/phase-p-contract.ts';
export class Query {
 filters:Array<(x:any)=>boolean>=[];start=0;end=Infinity;ordering='';
 constructor(private rows:any[]){} select(){return this;}eq(k:string,v:any){this.filters.push(x=>x[k]===v);return this;}is(k:string,v:any){return this.eq(k,v);}in(k:string,values:any[]){this.filters.push(x=>values.includes(x[k]));return this;}order(k:string){this.ordering=k;return this;}range(start:number,end:number){this.start=start;this.end=end;return this;}limit(n:number){this.end=n-1;return this;}
 result(){const rows=this.rows.filter(x=>this.filters.every(f=>f(x)));if(this.ordering)rows.sort((a,b)=>String(a[this.ordering]).localeCompare(String(b[this.ordering])));return rows.slice(this.start,this.end+1);}
 then(resolve:any,reject:any){return Promise.resolve({data:this.result(),error:null}).then(resolve,reject);}async maybeSingle(){return {data:this.result()[0]??null,error:null};}single(){return this.maybeSingle();}
}
/** Injected PostgREST/RPC transport exercises the production store and handlers.
 * This is a simulation; database.mjs independently tests the actual SQL. */
export class Db {
 job:PortableJob|null=null;state='QUEUED';calls:string[]=[];rows:any[]=[];tables:Record<string,any[]>={};finish:any=null;
 from(name:string){this.calls.push(`read:${name}`);return new Query(this.tables[name]??[]);}
 async rpc(name:string,args:any){
  this.calls.push(name);
  if(name==='claim_phase_p_job'){if(!this.job||!['QUEUED','RETRY'].includes(this.state))return {data:[],error:null};this.state='RUNNING';this.job.attempt++;return {data:[this.job],error:null};}
  if(!this.job||args.p_id!==this.job.id||args.p_token!==this.job.lease_token||this.state!=='RUNNING')return {data:null,error:{message:'LEASE_LOST'}};
  if(name==='heartbeat_phase_p_job')return {data:null,error:null};
  if(name==='checkpoint_phase_p_job'){
   for(const row of args.p_rows){const key=this.job.kind==='HISTORY'?row.open_time:this.job.kind==='REPLAY'?row.cycle_key:row.sequence,existing=this.rows.find(x=>x.key===key);if(existing)assert.deepEqual(existing.row,row);else this.rows.push({key,row});}
   if(this.job.kind==='REPLAY'){
     this.tables.validation_outcomes=this.rows.filter(x=>x.row.outcome).map(x=>({...x.row.outcome,run_id:this.job!.run_id,cycle_key:x.row.cycle_key}));
   }else if(['ACCOUNT','PROP'].includes(this.job.kind))this.tables.validation_simulation_evidence=[...(this.tables.validation_simulation_evidence??[]).filter(x=>x.run_id!==this.job!.run_id),...this.rows.map(x=>({...x.row,run_id:this.job!.run_id}))];
   this.job.checkpoint=args.p_checkpoint;return {data:null,error:null};
  }
  if(name==='finish_phase_p_job'){
   this.state=args.p_state==='YIELD'?'QUEUED':args.p_state;this.finish=args;
   if(args.p_state==='YIELD')this.job.attempt--;
   return {data:null,error:null};
  }
  throw Error(name);
 }
}
export const start=Date.parse('2025-01-01T00:00:00Z');
export const candles=Array.from({length:100},(_,i)=>{const p=100+i*.3;return {symbol:'BTCUSDT',market_type:'crypto',timeframe:'15m',open_time:new Date(start+i*900000).toISOString(),open:p,high:p+1,low:p-1,close:p+.2,volume:100,source:'BINANCE'};});
export const configuration={version:'approved/v1',minSignalGrade:'B',strategies:[{id:'crypto.swing-continuation',version:'1.0.0',enabled:true,minScore:0,minRiskReward:0,maxBarsInTrade:40,symbols:['BTCUSDT'],timeframes:['15m'],parameters:{}}]};
export function job(kind:PortableJob['kind'],payload:any):PortableJob{return {id:'job',kind,payload,run_id:'run',customer_id:'owner',execution_account_id:null,checkpoint:{},lease_token:'token',attempt:0,max_attempts:3,configuration_hash:'config-hash'};}
export const run=(db:Db)=>runSlice({store:new SupabaseWorkerStore(db),handlers:createHandlers(db,async()=>{throw Error('NO_EXTERNAL_NETWORK');}),host:'local-test',revision:'test'});

import {hashValidationDataset} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {deriveAccountSimulationAuthority} from '../../supabase/functions/_shared/phase-m-authority-loader.ts';
import {DEFAULT_BINANCE_PERSONAL_POLICY} from '../../supabase/functions/_shared/account-execution-brain/contracts.ts';

export async function accountFixture(){
 const db=new Db(),hash=await hashValidationDataset(candles);
 db.tables.validation_datasets=[{id:'dataset',created_by:'owner',status:'READY',row_count:100,dataset_hash:hash,symbol:'BTCUSDT',timeframe:'15m',source:'BINANCE'}];
 db.tables.validation_dataset_candles=candles.map(c=>({...c,dataset_id:'dataset'}));
 db.job=job('REPLAY',{datasets:[{id:'dataset',hash}],configuration,start:new Date(start).toISOString(),end:new Date(start+100*900000).toISOString(),maxCycles:100});
 assert.equal((await run(db)).state,'COMPLETED');const evidence=db.rows.map(x=>x.row),selected=evidence.find(x=>x.outcome&&['TARGET','STOP'].includes(x.outcome.status));assert.ok(selected);
 db.tables.validation_runs=[{id:'scanner',created_by:'owner',status:'COMPLETED',cancellation_requested_at:null,dataset_hash:hash,configuration_hash:'config-hash',provenance:{datasetHashes:[hash]}}];
 db.tables.validation_cycles=[];db.tables.validation_outcomes=[];
 for(let i=0;i<80;i++){const key=`cycle-${i}`,id=`signal-${i}`,winner={...selected.arbitration.winner,id};db.tables.validation_cycles.push({...selected,run_id:'scanner',cycle_key:key,arbitration:{...selected.arbitration,winner}});db.tables.validation_outcomes.push({...selected.outcome,candidate_id:id,cash_flow_events:selected.outcome.cash_flow_events.map((e:any)=>({...e,candidateId:id})),run_id:'scanner',cycle_key:key});}
 const at=selected.outcome.entry_time,winner=selected.arbitration.winner;
 const context={environment:'DEMO',free_margin:1e9,used_margin:0,leverage:10,open_positions:[],exposure:{total_notional_usd:0,total_open_risk_usd:0,total_open_risk_pct:0,active_position_count:0,positions_by_symbol:{}},daily_drawdown:{starting_balance:10000,peak_equity:10000,current_drawdown_amount:0,current_drawdown_pct:0,max_allowed_pct:5,is_violated:false},total_drawdown:{initial_balance:10000,high_water_mark:10000,current_drawdown_amount:0,current_drawdown_pct:0,max_allowed_pct:12,is_violated:false},risk_profile:{max_risk_per_trade_pct:2,max_open_risk_pct:6,max_leverage:20,min_notional_usd:10},prop_rules:null,session_state:{is_session_open:true,active_session_name:'Always',current_time_utc:at},news_state:{in_high_impact_news_window:false,news_event_title:null,minutes_to_news:null,minutes_after_news:null},runtime_health:{is_healthy:true,last_heartbeat_at:at,bridge_status:'CONNECTED',error_count_last_hour:0}};
 const account={id:'account',customer_id:'owner',provider:'binance',account_mode:'PERSONAL',enabled:true,execution_enabled:true,immutable_identity:'binance:demo:account',runtime_control:'START',policy_profile_id:DEFAULT_BINANCE_PERSONAL_POLICY.policy_id,policy_version:DEFAULT_BINANCE_PERSONAL_POLICY.policy_version,policy_preset:'BALANCED',policy_overrides:{base_policy:DEFAULT_BINANCE_PERSONAL_POLICY,simulation_context:context,policy_configuration:{allowedSymbols:null,allowedStrategies:[winner.strategyId]},contracts:[{symbol:'BTCUSDT',contractSize:1,quantityStep:.001,quoteCurrency:'USD'}],conversion_rates:{}}};
 db.tables.connected_execution_accounts=[account];db.tables.account_brain_assignments=[{id:'brain',customer_id:'owner',execution_account_id:'account',policy_version:account.policy_version,superseded_at:null}];
 const payload={sourceRunId:'scanner',accountId:'account',brainAssignmentId:'brain',initialCapital:10000,currency:'USD'},authority=await deriveAccountSimulationAuthority(db,{...payload,actorId:'owner'});

 return {db,payload,authority,hash};
}
