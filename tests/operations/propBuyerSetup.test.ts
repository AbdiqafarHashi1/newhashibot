import {test} from 'node:test';import assert from 'node:assert/strict';
import {configurePropDraftStage} from '../../supabase/functions/_shared/prop-draft-stage';
import {propOnboardingEntry,initialOnboarding,accountSetupScope} from '../../src/lib/onboardingWorkflow';
import {validateOnboardingDraft} from '../../supabase/functions/_shared/onboarding-input';
import {onboardingAccountPolicy} from '../../supabase/functions/_shared/onboarding-policy';
function fixture(patch:any={}){
 const state={row:{id:'a',customer_id:'c',provider:'MT5_PROP',account_mode:'PROP_EVALUATION',provider_account_identity:'draft:a',policy_profile_id:null,policy_overrides:{other:'preserved'},execution_enabled:false,updated_at:'2026-11-13T00:00:00Z',...patch},writes:0,race:false};
 const db={from(table:string){assert.equal(table,'connected_execution_accounts');let update:any;const filters:Record<string,unknown>={};const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},is:(k:string,v:unknown)=>{filters[k]=v;return q;},update:(v:any)=>{update=v;return q;},maybeSingle:async()=>{if(Object.entries(filters).some(([k,v])=>state.row[k]!==v)||update&&state.race)return{data:null};if(update){Object.assign(state.row,update);state.writes++;}return{data:{...state.row}};}};return q;}};
 return {state,db};
}
test('funded draft gets the funded Brain while challenge/verification retain distinct setup identities',async()=>{
 const {db,state}=fixture();assert.deepEqual(await configurePropDraftStage(db,'c','a','FUNDED'),{phase:'FUNDED',account_mode:'PROP_FUNDED'});assert.equal(state.row.execution_enabled,false);assert.equal(state.row.policy_overrides.other,'preserved');assert.equal(state.row.policy_overrides.prop_setup.phase,'FUNDED');assert.equal(onboardingAccountPolicy(state.row.provider,state.row.account_mode).policy_id,'pol_mt5_prop_funded_v1');
 await configurePropDraftStage(db,'c','a','FUNDED');assert.equal(state.writes,1);await assert.rejects(configurePropDraftStage(db,'c','a','CHALLENGE'),/IDEMPOTENCY_CONFLICT/);
 const other=fixture();await configurePropDraftStage(other.db,'c','a','VERIFICATION');assert.equal(other.state.row.account_mode,'PROP_EVALUATION');assert.equal(other.state.row.policy_overrides.prop_setup.phase,'VERIFICATION');
 const base=accountSetupScope('c','MT5','PROP','demo');assert.notEqual(`${base}:CHALLENGE`,`${base}:FUNDED`);
});
test('foreign, already connected, assigned, enabled and concurrently changed accounts cannot change phase',async()=>{
 for(const patch of [{customer_id:'other'},{provider:'MT5_PERSONAL'},{provider_account_identity:'terminal'},{policy_profile_id:'assigned'},{execution_enabled:true}]){const{db,state}=fixture(patch);await assert.rejects(configurePropDraftStage(db,'c','a','FUNDED'));assert.equal(state.writes,0);}
 const {db,state}=fixture();state.race=true;await assert.rejects(configurePropDraftStage(db,'c','a','FUNDED'),/CHANGED_RELOAD/);assert.equal(state.writes,0);
});
test('Prop entry preserves the selected phase in durable preferences and cannot inherit a Crypto Personal setup',()=>{
 const d=propOnboardingEntry({...initialOnboarding,provider:'BINANCE',asset:'CRYPTO',mode:'PERSONAL',risk:.75,access:'AUTO',propPhase:'FUNDED'},true);
 assert.equal(d.provider,'MT5');assert.equal(d.mode,'PROP');assert.equal(d.asset,'FOREX');assert.equal(d.propPhase,'FUNDED');assert.equal(d.risk,.5);assert.equal(d.ack,false);
 assert.equal(validateOnboardingDraft(d).propPhase,'FUNDED');assert.throws(()=>validateOnboardingDraft({...d,propPhase:'invented'}),/PHASE_REQUIRED/);assert.throws(()=>validateOnboardingDraft({...d,mode:'PERSONAL'}),/PROP_ACCOUNT_REQUIRED/);
});

test('returning Prop buyers resume their saved phase and connection step',()=>{
 const saved={...initialOnboarding,provider:'MT5' as const,asset:'FOREX' as const,mode:'PROP' as const,access:'AUTO' as const,propPhase:'VERIFICATION' as const,stage:12,ack:true};
 const resumed=propOnboardingEntry(saved,true);assert.equal(resumed.stage,12);assert.equal(resumed.propPhase,'VERIFICATION');assert.equal(resumed.ack,true);
});
test('new onboarding starts at 0.5% while saved lower-risk preferences and Prop cap remain intact',()=>{assert.equal(initialOnboarding.risk,.5);const low=propOnboardingEntry({...initialOnboarding,mode:'PERSONAL',risk:.25},true);assert.equal(low.risk,.25);const high=propOnboardingEntry({...initialOnboarding,mode:'PERSONAL',risk:5},true);assert.equal(high.risk,.5)});
