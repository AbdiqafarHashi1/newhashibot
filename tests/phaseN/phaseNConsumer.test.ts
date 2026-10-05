import assert from 'node:assert/strict';
import {PhaseNCommandConsumer,retryDisposition,type OperationsConsumerStore,type ClaimedOperationsCommand,type AccountOperationsSnapshot} from '../../supabase/functions/_shared/phase-n-operations.ts';
const c1='c1',c2='c2',a1='a1',a2='a2';
const ready=(customerId:string,accountId:string):AccountOperationsSnapshot=>({customerId,accountId,provider:'BINANCE',environment:'TESTNET',ownershipVerified:true,connectionVerified:true,heartbeatState:'HEALTHY',entitlement:'ACTIVE',ownerTestAuthorization:false,stopNewEntries:false,protectionEnabled:true,submissionUncertain:false,openProtectionIncident:false,certificationStatus:'CREATED'});
class DurableFake implements OperationsConsumerStore{accounts=new Map([[a1,ready(c1,a1)],[a2,ready(c2,a2)]]);queue:ClaimedOperationsCommand[]=[];done:any[]=[];failed:any[]=[];async loadAccount(id:string){return this.accounts.get(id)??null}async appendCommand(){throw Error('unused')}async loadCommand(){return null}async claim(){return this.queue.shift()??null}async complete(id:string,token:string,result:any){this.done.push({id,token,result})}async fail(id:string,token:string,error:string,retryable:boolean){this.failed.push({id,token,error,retryable})}}
const command=(x:Partial<ClaimedOperationsCommand>={}):ClaimedOperationsCommand=>({id:'cmd',customerId:c1,accountId:a1,action:'STOP_NEW_ENTRIES',safePayload:{},leaseToken:'lease',...x});
const store=new DurableFake(),calls:any[]=[];const consumer=new PhaseNCommandConsumer(store,{async dispatch(c,a){calls.push({c,a});return{authority:'existing-phase-ef',accepted:true}}});
store.queue.push(command());assert.equal((await consumer.work('w')).state,'COMPLETED');assert.equal(store.done.length,1);assert.equal(calls.length,1);
store.queue.push(command({id:'cross',customerId:c2,accountId:a1}));assert.equal((await consumer.work('w')).state,'FAILED');assert.equal(store.failed.at(-1).error,'STALE_ACCOUNT_OWNERSHIP');
store.accounts.get(a1)!.submissionUncertain=true;store.queue.push(command({id:'unsafe',action:'REQUEST_SAFETY_CLOSE'}));assert.equal((await consumer.work('w')).state,'FAILED');assert.equal(store.failed.at(-1).error,'RECONCILIATION_REQUIRED');
store.queue.push(command({id:'reconcile',action:'REQUEST_RECONCILIATION'}));assert.equal((await consumer.work('w')).state,'COMPLETED');
store.accounts.get(a1)!.submissionUncertain=false;store.accounts.get(a1)!.protectionEnabled=false;store.queue.push(command({id:'stop'}));assert.equal((await consumer.work('w')).state,'FAILED');assert.equal(store.failed.at(-1).error,'PROTECTION_MUST_REMAIN_ENABLED');
// A new consumer over the same durable store represents restart recovery; no command is duplicated.
const restarted=new PhaseNCommandConsumer(store,{async dispatch(){throw Error('should not run')}});assert.equal((await restarted.work('w2')).state,'IDLE');
assert.equal(store.accounts.get(a2)!.customerId,c2);assert.equal(calls.some(x=>x.a.accountId===a2),false);console.log('Phase N durable consumer tests passed');
assert.equal(retryDisposition(4,5),'REQUEUE');assert.equal(retryDisposition(5,5),'TERMINAL_FAILED');
