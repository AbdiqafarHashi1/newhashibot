import {test} from 'node:test';import assert from 'node:assert/strict';
import {parsePortableRequest} from '../../supabase/functions/_shared/phase-p-contract.ts';
import {preparePortableSubmission} from '../../supabase/functions/_shared/phase-p-submission.ts';
import {canonicalSnapshotFingerprint} from '../../supabase/functions/_shared/canonical-historical-replay.ts';
const dataset='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
const request={kind:'REPLAY',entryPolicyVersion:'entry-decision/v1',idempotencyKey:'policy-submission-test',datasetIds:[dataset],strategyIds:['crypto.micro-scalper'],start:'2025-01-01T00:00:00Z',end:'2025-01-01T00:02:00Z',maxCycles:2};
test('canonical queued request has a closed vocabulary, bounded minute clock and no client-supplied release authority',()=>{
 assert.equal(parsePortableRequest(request).input.entryPolicyVersion,'entry-decision/v1');
 assert.throws(()=>parsePortableRequest({...request,canonicalSnapshot:{releases:['forged']}}),/TASK_FIELD_NOT_ALLOWED/);
 assert.throws(()=>parsePortableRequest({...request,entryPolicyVersion:'old'}),/ENTRY_POLICY_UNSUPPORTED/);
 assert.throws(()=>parsePortableRequest({...request,maxCycles:1}),/POLICY_VERIFICATION_CLOCK_LIMIT/);
 assert.throws(()=>parsePortableRequest({...request,end:'2025-01-01T00:02:01Z'}),/POLICY_VERIFICATION_CLOCK_LIMIT/);
 assert.throws(()=>parsePortableRequest({...request,releaseCandidateId:dataset}),/POLICY_VERIFICATION_SCOPE_CONFLICT/);
});
test('server freezes its own catalog snapshot, keeps policy-only qualification blocked and hashes survive JSONB ordering',async()=>{
 const calls:{table:string;key:string;value:unknown}[]=[],data:Record<string,unknown>={profiles:{role:'admin'},portable_jobs:null,validation_datasets:[{id:dataset,status:'READY',row_count:240,configuration_version:'strategy-config/current',symbol:'BTCUSDT',timeframe:'5m',dataset_hash:'a'.repeat(64)}],strategy_configs:[{strategy_name:'MicroScalper',enabled:true}],strategy_release_candidates:[]};
 const db:any={from:(table:string)=>{const q:any={select:()=>q,in:()=>q,eq:(key:string,value:unknown)=>{calls.push({table,key,value});return q;},maybeSingle:async()=>({data:data[table],error:null}),then:(resolve:any)=>Promise.resolve({data:data[table],error:null}).then(resolve)};return q;}};
 const result=await preparePortableSubmission(db,owner,request);
 assert.equal(result.p_payload.policyVerificationOnly,true);assert.equal(result.p_payload.assumptions.qualificationEligible,false);assert.equal(result.p_payload.assumptions.brokerFills,false);
 assert.deepEqual(result.p_payload.canonicalSnapshot.releases,[]);assert(calls.some(c=>c.table==='validation_datasets'&&c.key==='created_by'&&c.value===owner));
 const hashInput={configuration:result.p_payload.configuration,canonicalSnapshot:result.p_payload.canonicalSnapshot};
 const reorder=(x:any):any=>Array.isArray(x)?x.map(reorder):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reorder(v)])):x;
 assert.equal(await canonicalSnapshotFingerprint(hashInput),await canonicalSnapshotFingerprint(reorder(hashInput)));assert.equal(result.p_hash,await canonicalSnapshotFingerprint(hashInput));
 await assert.rejects(()=>preparePortableSubmission(db,owner,{...request,fees:5}),/USES_FROZEN_ENGINE_COSTS/);
 data.profiles={role:'user'};await assert.rejects(()=>preparePortableSubmission(db,owner,request),/ADMIN_REQUIRED/);
});
