import {test} from 'node:test';import assert from 'node:assert/strict';import {settleExecutionAccounts} from '../../supabase/functions/_shared/execution-ownership';
test('fleet observations have bounded concurrency, preserve input order and isolate account failures',async()=>{
 let active=0,peak=0;const accounts=Array.from({length:12},(_,i)=>({account_id:String(i)})) as any;
 const results=await settleExecutionAccounts(accounts,async account=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;if(account.account_id==='3')throw Error('one-account-failed');return account.account_id});
 assert.ok(peak>1&&peak<=4);assert.equal(results[3].status,'rejected');assert.equal(results[11].status,'fulfilled');assert.deepEqual(results.filter(r=>r.status==='fulfilled').map(r=>r.value),['0','1','2','4','5','6','7','8','9','10','11']);
});
