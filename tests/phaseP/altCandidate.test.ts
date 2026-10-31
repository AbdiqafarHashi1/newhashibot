import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ALT_CANDIDATE_ID,ALT_SYMBOLS,ALT_ASSUMPTIONS,altClosedHours,altReplayConfiguration,altResearchDefinitions,evaluateAltRelativeStrength,validateAltDatasetSelection} from '../../supabase/functions/_shared/crypto-relative-strength.ts';
import {ProfessionalStrategyRegistry,type StrategyCandle,type LegacyStrategyResult} from '../../supabase/functions/_shared/professional-strategies.ts';
import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {proposeAltUniverse} from '../../scripts/research/alt-universe-rules.ts';
import {hashValidationDataset} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {storedValidationCandle} from '../../supabase/functions/_shared/native-candle-evidence.ts';
import {parsePortableRequest} from '../../supabase/functions/_shared/phase-p-contract.ts';
import {handlePortableRequest} from '../../supabase/functions/_shared/phase-p-api.ts';
import {run,Db,job} from './fixtures.ts';
const origin=Date.parse('2026-06-01T00:00:00Z'),decision=origin+240*3600000;
function bars(symbol:string):StrategyCandle[]{return Array.from({length:968},(_,i)=>{const hour=Math.floor(i/4),x=hour>=240?(symbol==='BTCUSDT'?101:110):hour===239?(symbol==='BTCUSDT'?101:110):hour>=216?100+(hour-215)*.4:100+hour*.001;return {symbol,source:'BINANCE_USDM_KLINES',market_type:'crypto',timeframe:'15m',instrument_type:'USDT_PERPETUAL',open_time:new Date(origin+i*900000).toISOString(),open:x-.5,high:x+.1,low:x-1.5,close:x,volume:25,quote_volume:hour===239?500:250};});}
const alt=bars('SOLUSDT'),btc=bars('BTCUSDT'),at=new Date(decision).toISOString();
const context=()=>({symbol:'SOLUSDT',market:'crypto' as const,timeframe:'15m',candles:alt.slice(0,960),reference_candles:btc.slice(0,960),indicators:calculateActiveIndicators(alt.slice(850,960)),evaluated_at:at});
test('shared alt evaluator reproduces frozen native-hour geometry without granting live eligibility',()=>{
 const c=context(),legacy=evaluateAltRelativeStrength(c),frozen=proposeAltUniverse(altClosedHours(c.candles,'SOLUSDT',at),altClosedHours(c.reference_candles,'BTCUSDT',at),ALT_SYMBOLS)!;
 assert.ok(frozen);assert.equal(legacy.status,'candidate');assert.equal(legacy.entry_low,frozen.entry);assert.equal(legacy.stop_loss,frozen.stop);assert.equal(legacy.tp1,frozen.targets[0]);assert.equal(legacy.tp2,frozen.targets[0]);assert.equal(legacy.risk_reward,frozen.riskReward);assert.equal(legacy.score_breakdown.score_is_probability,false);
 assert.deepEqual(new ProfessionalStrategyRegistry(altResearchDefinitions()).evaluate(c),[]);
 for(const patch of [{reference_candles:[]},{reference_candles:alt},{reference_candles:btc.slice(1,960)},{candles:alt.slice(0,959)},{candles:alt.slice(0,960).map(b=>({...b,instrument_type:'SPOT'}))},{reference_candles:btc.slice(0,960).map(b=>({...b,quote_volume:undefined}))},{strategy_parameters:{target_r:10}}])assert.equal(evaluateAltRelativeStrength({...c,...patch}).status,'rejected');
 assert.equal(evaluateAltRelativeStrength({...c,candles:alt.slice(1,961),reference_candles:btc.slice(1,961),evaluated_at:new Date(decision+900000).toISOString()}).rejection_reason,'WAIT_FOR_CLOSED_HOUR');
 const bad=btc.slice(0,960).map((b,i)=>i===20?{...b,open_time:new Date(decision+900000).toISOString()}:b);assert.equal(evaluateAltRelativeStrength({...c,reference_candles:bad}).status,'rejected');
});
test('research request cannot mix a built-in candidate with live selection, model or client configuration',()=>{
 const request={kind:'REPLAY',researchCandidateId:ALT_CANDIDATE_ID,idempotencyKey:'alt-test-001',datasetIds:['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'],start:at,end:new Date(decision+7200000).toISOString()};
 assert.equal(parsePortableRequest(request).input.researchCandidateId,ALT_CANDIDATE_ID);
 for(const patch of [{strategyIds:['crypto.quick-scalp']},{researchModelId:'00000000-0000-0000-0000-000000000001'},{researchCandidateId:'made-up'},{configuration:altReplayConfiguration()}])assert.throws(()=>parsePortableRequest({...request,...patch}));
});
class ConnectedDb extends Db {
 auth={getUser:async(token:string)=>({data:{user:token==='admin-token'?{id:'owner'}:null}})};
 enqueueArgs:Parameters<Db['rpc']>[1]=null;
 override async rpc(name:string,args:Parameters<Db['rpc']>[1]){if(name==='enqueue_phase_p_job'){this.enqueueArgs=args;this.job=job('REPLAY',args.p_payload);this.job.configuration_hash=args.p_hash;return {data:{id:this.job.id,run_id:this.job.run_id,status:'QUEUED'},error:null};}return super.rpc(name,args);}
}
async function fixture(){const db=new ConnectedDb();db.tables.profiles=[{id:'owner',role:'admin'}];const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'];db.tables.validation_datasets=[];db.tables.validation_dataset_candles=[];
 for(const [i,rows]of [btc,alt].entries()){const hash=await hashValidationDataset(rows);db.tables.validation_datasets.push({id:ids[i],created_by:'owner',status:'READY',row_count:rows.length,dataset_hash:hash,symbol:rows[0].symbol,timeframe:'15m',source:'BINANCE'});db.tables.validation_dataset_candles.push(...rows.map(c=>({...storedValidationCandle(c),dataset_id:ids[i]})));}
 const body={action:'submit',kind:'REPLAY',researchCandidateId:ALT_CANDIDATE_ID,idempotencyKey:'alt-test-001',datasetIds:ids,start:at,end:new Date(decision+7200000).toISOString(),maxCycles:32};
 return {db,body};
}
const request=(body:unknown,token='admin-token')=>new Request('https://local/phase-p-workers',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)});
test('authenticated endpoint -> frozen server snapshot -> real store/worker -> registry/arbitration -> durable outcomes',async()=>{
 const {db,body}=await fixture();assert.equal((await handlePortableRequest(request(body,'bad'),db)).status,401);
 assert.equal((await handlePortableRequest(request(body),db)).status,202);assert.deepEqual(db.enqueueArgs.p_payload.assumptions,ALT_ASSUMPTIONS);assert.equal(db.enqueueArgs.p_payload.researchOnly,true);
 const result=await run(db);assert.equal(result.state,'COMPLETED',JSON.stringify(db.finish));const selected=db.rows.map(r=>r.row).filter(r=>r.outcome);assert.equal(selected.length,1,JSON.stringify(db.rows[0]));assert.equal(selected[0].arbitration.winner.strategyId,ALT_CANDIDATE_ID);assert.equal(selected[0].arbitration.winner.targets.length,1);assert.equal(selected[0].arbitration.evidence.reference_dataset_hash,db.tables.validation_datasets[0].dataset_hash);assert.ok(db.rows.every(r=>!r.row.cycle_key?.includes('BTCUSDT')));
 assert.equal(selected[0].outcome.status,'OPEN');assert.equal(selected[0].outcome.net_r,null);assert.deepEqual(selected[0].outcome.assumptions,ALT_ASSUMPTIONS);assert.equal(db.finish.p_summary.classification,'RESEARCH_CANDIDATE_SIMULATION');assert.equal(db.finish.p_summary.researchOnly,true);assert.equal(db.finish.p_summary.publication,false);assert.equal(db.finish.p_summary.execution,false);
 assert.ok(db.calls.filter(c=>!c.startsWith('read:')).every(c=>['claim_phase_p_job','heartbeat_phase_p_job','checkpoint_phase_p_job','finish_phase_p_job'].includes(c)));
});
test('missing BTC, cross-owner dependency and tampered native/hash evidence block the connected path',async()=>{
 for(const mode of ['missing','owner','hash','config']as const){const {db,body}=await fixture();if(mode==='missing')body.datasetIds=body.datasetIds.slice(1);if(mode==='owner')db.tables.validation_datasets[0].created_by='other';
 const res=await handlePortableRequest(request(body),db);if(mode==='missing'||mode==='owner'){assert.equal(res.status,409);assert.equal(db.job,null);continue;}assert.equal(res.status,202);
 if(mode==='hash')db.tables.validation_dataset_candles[0].native_evidence.quote_volume++;
 else db.job!.payload.configuration.strategies[0].parameters={target_r:10};
 assert.notEqual((await run(db)).state,'COMPLETED');assert.equal(db.rows.length,0);}
});
test('specialist arbitration policy rejects forged or incomplete relative-strength evidence',async()=>{
 const {arbitrationNoTradeReason}=await import('../../supabase/functions/_shared/scanner-market-context.ts');
 const c=context(),legacy=evaluateAltRelativeStrength(c),definition=altResearchDefinitions()[0],market=(await import('../../supabase/functions/_shared/scanner-market-context.ts')).classifyMarketContext(c.indicators,c.candles.slice(-110));
 const entry={name:definition.legacyName,result:legacy,cfg:definition.config,guard:{sl_pct:1,tp1_pct:3,tp2_pct:3}};
 assert.equal(arbitrationNoTradeReason(market,[entry]),'');
 for(const patch of [{relative_strength_policy:'wrong'},{btc_return:0},{relative_return:.01},{quote_volume_ratio:null},{closed_hour_breakout:false},{score_is_probability:true}])assert.equal(arbitrationNoTradeReason(market,[{...entry,result:{...legacy,score_breakdown:{...legacy.score_breakdown,...patch} as unknown as LegacyStrategyResult['score_breakdown']}}]),'ALT_RELATIVE_STRENGTH_POLICY_MISMATCH');
});
test('interruption after a durable cycle resumes the same job without duplicate outcomes',async()=>{
 const {db,body}=await fixture();assert.equal((await handlePortableRequest(request(body),db)).status,202);
 const rpc=db.rpc.bind(db);let interrupt=true;db.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='checkpoint_phase_p_job'&&interrupt){interrupt=false;const {WorkerFault}=await import('../../supabase/functions/_shared/phase-p-contract.ts');throw new WorkerFault('SLICE_INTERRUPTED');}return result;};
 assert.equal((await run(db)).state,'YIELD');assert.equal(db.job!.checkpoint.cursor,1);assert.equal((await run(db)).state,'COMPLETED');
 assert.equal(db.rows.filter(x=>x.row.outcome).length,1);assert.equal(new Set(db.rows.map(x=>x.key)).size,db.rows.length);assert.equal(db.finish.p_summary.researchOnly,true);assert.equal(db.job!.payload.configuration.researchOnly,true);
});

test('frozen validation survives PostgreSQL JSONB object-key ordering without permitting changed values',()=>{
 const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
 const config=reorder(altReplayConfiguration()) as ReturnType<typeof altReplayConfiguration>,datasets=[{symbol:'BTCUSDT',market:'crypto',timeframe:'15m'},{symbol:'SOLUSDT',market:'crypto',timeframe:'15m'}];
 assert.doesNotThrow(()=>validateAltDatasetSelection(config,datasets));config.strategies[0].maxBarsInTrade=97;assert.throws(()=>validateAltDatasetSelection(config,datasets),/FROZEN_CONFIGURATION/);
});
test('embedded PostgreSQL enforces the existing research-only release trigger for the new snapshot',async()=>{
 const {PGlite}=await import('@electric-sql/pglite'),{readFile}=await import('node:fs/promises'),db=new PGlite();
 try{
  const migration=await readFile('supabase/migrations/20261025233617_validation_native_evidence_upload.sql','utf8'),definition=migration.match(/create function public\.reject_research_only_strategy_release\(\)[\s\S]*?end \$\$;/i)?.[0];assert.ok(definition);
  await db.exec('create table public.strategy_release_candidates (id integer, immutable_configuration jsonb);');await db.exec(definition);
  await db.exec('create trigger measured_release_research_model_guard before insert or update on public.strategy_release_candidates for each row execute function public.reject_research_only_strategy_release();');
  await assert.rejects(()=>db.query('insert into public.strategy_release_candidates values (1,$1::jsonb)',[JSON.stringify(altReplayConfiguration())]),/RESEARCH_ONLY_MODEL_CANNOT_BE_RELEASED/);
  const {rows}=await db.query<{configuration:ReturnType<typeof altReplayConfiguration>}>('select $1::jsonb as configuration',[JSON.stringify(altReplayConfiguration())]);
  assert.doesNotThrow(()=>validateAltDatasetSelection(rows[0].configuration,[{symbol:'BTCUSDT',market:'crypto',timeframe:'15m'},{symbol:'SOLUSDT',market:'crypto',timeframe:'15m'}]));
 }finally{await db.close();}
});
