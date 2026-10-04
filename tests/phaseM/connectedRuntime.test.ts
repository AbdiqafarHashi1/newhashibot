import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runCanonicalPublicationWorker} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';
import {applyScannerSelectionPolicy} from '../../supabase/functions/_shared/scanner-selection-policy.ts';

class FakeDb{claimed=false;parts=new Map<string,any>();signal={id:'s1',created_at:'2026-10-03T00:00:00Z',symbol:'BTCUSDT',market_type:'crypto',direction:'buy',grade:'A',confidence_score:90};calls:any[]=[];
 async rpc(name:string,args:any){this.calls.push([name,args]);if(name==='claim_signal_publication_work'){if(this.claimed)return{data:[],error:null};this.claimed=true;return{data:[{id:'w',entity_type:'signal',entity_id:'s1',event_type:'SIGNAL_QUALIFIED',event_version:1,destination:'vip',customer_id:null,attempt_count:1,lease_token:'lease'}],error:null}}if(name==='reserve_canonical_delivery_part'){const prior=this.parts.get(args.p_identity),row=prior??{id:'d',state:'RESERVED'};this.parts.set(args.p_identity,row);return{data:row,error:null}}if(name==='finish_canonical_delivery_part'){this.parts.set('signal:s1:v1:vip:p0',{id:'d',state:args.p_state,telegram_message_id:args.p_message_id});return{data:null,error:null}}if(name==='finish_signal_publication_work')return{data:null,error:null};throw new Error(name)}
 from(table:string){const self=this;return{select(){return this},eq(){return this},async maybeSingle(){return table==='signals'?{data:self.signal,error:null}:{data:null,error:null}}}}
}
const db=new FakeDb(),sent:string[]=[];const result=await runCanonicalPublicationWorker(db,{workerId:'worker-a',transport:{send:async i=>{sent.push(i.identity);return{kind:'accepted',messageId:'42'}}}});assert.equal(result[0].state,'SENT');assert.deepEqual(sent,['signal:s1:v1:vip:p0']);assert.equal(db.calls.filter(x=>x[0]==='claim_signal_publication_work').length,1);
const restart=await runCanonicalPublicationWorker(db,{workerId:'worker-b',transport:{send:async()=>{throw new Error('must not send')}}});assert.deepEqual(restart,[]);
assert.equal(applyScannerSelectionPolicy('2026-01-01T00:01:00Z',{lastSelectedAt:'2026-01-01T00:00:30Z'},{preventDuplicateSymbolSignals:true,cooldownMs:60_000}).reason,'scanner_cooldown');
assert.match(fs.readFileSync('supabase/functions/canonical-reporting-worker/index.ts','utf8'),/authorizeInternalOrAdmin/);assert.match(fs.readFileSync('supabase/functions/phase-m-validation/index.ts','utf8'),/validationAccessDecision/);assert.match(fs.readFileSync('supabase/functions/phase-m-shadow/index.ts','utf8'),/claim_validation_run/);assert.doesNotMatch(fs.readFileSync('supabase/functions/_shared/phase-m-validation.ts','utf8'),/from\("signals"\)|commitScannerDecision|provider.*order/i);
console.log('Phase M connected endpoint/store/runtime tests passed');
