import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyBridgeAccountEvidence,validateMt5ProviderSnapshot} from '../../supabase/functions/_shared/bridge-account-evidence';
const now=Date.parse('2026-10-15T22:00:00Z');
const input={account:{id:'a',user_id:'owner',bridge_id:'bridge',credential_ref:'vault-ref'},registry:{bridge_id:'bridge',worker_id:'worker',status:'online',lease_expires_at:new Date(now+30000).toISOString(),revoked_at:null},accountId:'a',ownerId:'owner',bridgeId:'bridge',workerId:'worker',credentialRef:'vault-ref',now};
test('MT5 credential/state authority requires matching owner, worker, terminal, reference and current lease',()=>{
 assert.equal(verifyBridgeAccountEvidence(input).id,'a');
 for(const patch of [{ownerId:'other'},{workerId:'other'},{bridgeId:'other'},{credentialRef:'wrong'},{accountId:''},{registry:{...input.registry,status:'offline'}},{registry:{...input.registry,revoked_at:new Date(now).toISOString()}},{registry:{...input.registry,lease_expires_at:null}}])assert.throws(()=>verifyBridgeAccountEvidence({...input,...patch}),/SCOPE|REF|LEASE/);
 const starting={...input,registry:{...input.registry,status:'starting'}};assert.throws(()=>verifyBridgeAccountEvidence(starting),/SCOPE/);assert.equal(verifyBridgeAccountEvidence({...starting,allowStarting:true}).id,'a');
});
test('missing MT5 state or partial reads cannot produce a healthy empty snapshot',()=>{
 const body={snapshot:{environment:'demo',terminal_authenticated:true,balance:1000,equity:900,margin:50,free_margin:850,floating_pnl:-100,currency:'USD'},positions:[],orders:[],reads:{positions:true,orders:true}};
 assert.equal(validateMt5ProviderSnapshot(body).balance,1000);
 for(const patch of [{snapshot:null},{snapshot:{...body.snapshot,environment:'live'}},{snapshot:{...body.snapshot,equity:NaN}},{snapshot:{...body.snapshot,currency:null}},{orders:null},{reads:{positions:true,orders:false}}])assert.throws(()=>validateMt5ProviderSnapshot({...body,...patch}),/SNAPSHOT|READS/);
});
