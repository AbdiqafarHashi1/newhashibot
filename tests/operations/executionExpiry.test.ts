import {test} from 'node:test';import assert from 'node:assert/strict';
import {executionAccessBoundary,ownedExpiryQuantity} from '../../supabase/functions/_shared/execution-access-expiry';
test('expiry quantity never closes more than observed or owned exposure',()=>{assert.equal(ownedExpiryQuantity(2,.5),.5);assert.equal(ownedExpiryQuantity(.2,.5),.2);assert.throws(()=>ownedExpiryQuantity(1,undefined),/OWNED/);assert.throws(()=>ownedExpiryQuantity(NaN,1),/OWNED/);});
test('unknown subscription or RPC failure never becomes an expired account; live monitor is unchanged',async()=>{
 assert.deepEqual(await executionAccessBoundary({}, {environment:'live'},'BINANCE'),{state:'NOT_CONFIGURED'});
 const owner={customer_id:'owner',account_id:'alias',execution_instance_id:'instance',credential_ref:'vault',execution_scope_key:'scope',environment:'testnet'},chain:any={select(){return this},eq(){return this},limit(){return Promise.resolve({data:[{id:'11111111-1111-4111-8111-111111111111',environment:'testnet'}]})}};
 const db:any={from:()=>chain,rpc:async()=>({error:{message:'offline'}})};await assert.rejects(executionAccessBoundary(db,owner,'BINANCE'),/UNAVAILABLE/);
 db.rpc=async()=>({data:{state:'NOT_CONFIGURED'}});assert.equal((await executionAccessBoundary(db,owner,'BINANCE')).state,'NOT_CONFIGURED');
 db.rpc=async()=>({data:{state:'EXPIRED',entitlement_id:'ent',expires_at:'2099-01-01T00:00:00Z'}});await assert.rejects(executionAccessBoundary(db,owner,'BINANCE'),/EVIDENCE/);
 db.rpc=async()=>({data:{state:'EXPIRED',entitlement_id:'ent',expires_at:'2020-01-01T00:00:00Z'}});assert.equal((await executionAccessBoundary(db,owner,'BINANCE')).state,'EXPIRED');
});
