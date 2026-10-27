import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {handlePortableRequest} from '../../supabase/functions/_shared/phase-p-api.ts';
import {hashValidationDataset} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {storedValidationCandle} from '../../supabase/functions/_shared/native-candle-evidence.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import {Db,job,run} from './fixtures.ts';
class EndpointDb extends Db {
 auth={getUser:async()=>({data:{user:{id:'owner'}}})};
 override async rpc(name:string,args:Parameters<Db['rpc']>[1]){if(name==='enqueue_phase_p_job'){this.job=job('REPLAY',args.p_payload);this.job.configuration_hash=args.p_hash;return {data:{id:this.job.id,run_id:this.job.run_id,status:'QUEUED'},error:null};}return super.rpc(name,args);}
}
type Example={role:string;symbol:string;decisionAt:string;candles:StrategyCandle[];reference:StrategyCandle[];candidate:{entry:number;stop:number;targets:number[]};expected:{netR:number}};
const examples=JSON.parse(gunzipSync(readFileSync('tests/phaseP/fixtures/crypto-team-native.json.gz')).toString()).examples as Example[];
for(const example of examples)test(`genuine ${example.role}: endpoint -> frozen scope -> concrete worker/store -> production evaluator -> durable outcome`,async()=>{
 const db=new EndpointDb();db.tables.profiles=[{id:'owner',role:'admin'}];db.tables.validation_datasets=[];db.tables.validation_dataset_candles=[];const datasets=example.symbol==='BTCUSDT'?[example.candles]:[example.candles,example.reference],ids=[];
 for(const [i,candles]of datasets.entries()){const id=`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`;ids.push(id);db.tables.validation_datasets.push({id,created_by:'owner',status:'READY',row_count:candles.length,dataset_hash:await hashValidationDataset(candles),symbol:candles[0].symbol,timeframe:'15m',source:'BINANCE'});db.tables.validation_dataset_candles.push(...candles.map(c=>({...storedValidationCandle(c),dataset_id:id})));}
 const body={action:'submit',kind:'REPLAY',researchCandidateId:example.role,idempotencyKey:`team-${example.role.replaceAll('.','-')}`,datasetIds:ids,start:example.decisionAt,end:new Date(Date.parse(example.decisionAt)+25*3600000).toISOString(),maxCycles:100},response=await handlePortableRequest(new Request('https://local/phase-p-workers',{method:'POST',headers:{authorization:'Bearer fixture-admin'},body:JSON.stringify(body)}),db);
 assert.equal(response.status,202,await response.text());assert.equal((await run(db)).state,'COMPLETED',JSON.stringify(db.finish));const row=db.rows.map(x=>x.row).find(x=>x.outcome&&x.outcome.strategy_id===example.role&&x.candle_close_time===example.decisionAt);assert.ok(row);assert.equal(row.arbitration.winner.stop,example.candidate.stop);assert.equal(row.arbitration.winner.entry,example.candidate.entry);assert.ok(Math.abs(row.outcome.net_r-example.expected.netR)<1e-10);assert.equal(db.finish.p_summary.researchOnly,true);assert.equal(db.finish.p_summary.publication,false);assert.equal(db.finish.p_summary.execution,false);
 assert.ok(db.calls.filter(c=>!c.startsWith('read:')).every(c=>['claim_phase_p_job','heartbeat_phase_p_job','checkpoint_phase_p_job','finish_phase_p_job'].includes(c)));
});
