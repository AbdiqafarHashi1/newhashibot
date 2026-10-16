import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectBybitPages,confirmedBybitTp1,reconcileBybitStop} from '../../supabase/functions/_shared/bybit-managed-protection';
import {confirmedProviderClose,stableCloseIdentity} from '../../supabase/functions/_shared/confirmed-provider-close';
import {validateBrainPreferences,validateOnboardingDraft} from '../../supabase/functions/_shared/onboarding-input';
import {initialOnboarding,onboardingStorageKeys,normalizeOnboarding,requireCreatedAccount} from '../../src/lib/onboardingWorkflow';

test('customer drafts are scoped; absent IDs, nonfinite risk and cross-provider permissions fail',()=>{
 assert.notDeepEqual(onboardingStorageKeys('customer-a'),onboardingStorageKeys('customer-b'));
 for(const id of [undefined,'undefined','',null])assert.throws(()=>requireCreatedAccount(id));
 assert.equal(normalizeOnboarding({...initialOnboarding,provider:'BYBIT',asset:'CRYPTO',risk:9}).risk,.75);
 for(const risk of [NaN,Infinity,-1,8])assert.throws(()=>validateBrainPreferences('MT5','PERSONAL',risk,['FOREX_TREND']));
 assert.throws(()=>validateBrainPreferences('BYBIT','PROP',.2,['CRYPTO_TREND']));
 assert.throws(()=>validateBrainPreferences('BYBIT','PERSONAL',.2,['FOREX_TREND']));
 assert.throws(()=>validateOnboardingDraft({...initialOnboarding,stage:NaN}));
 assert.throws(()=>validateOnboardingDraft({...initialOnboarding,risk:NaN}));
});
test('complete provider snapshots require bounded pagination; TP1 requires the exact filled provider order',async()=>{
 const cursors:(string|undefined)[]=[];assert.equal((await collectBybitPages(async c=>{cursors.push(c);return c?{list:[{id:2}]}:{list:[{id:1}],nextPageCursor:'next'}})).length,2);assert.deepEqual(cursors,[undefined,'next']);
 await assert.rejects(collectBybitPages(async()=>({list:[],nextPageCursor:'same'})),/CURSOR_REPEATED/);
 await assert.rejects(collectBybitPages(async()=>({})),/MALFORMED/);
 const expected={symbol:'BTCUSDT',orderId:'tp1-a',orderLinkId:'hb:a:tp1'},filled={symbol:'BTCUSDT',orderId:'tp1-a',orderStatus:'Filled',cumExecQty:'0.1'};
 assert.equal(confirmedBybitTp1(filled,expected),true);assert.equal(confirmedBybitTp1({...filled,orderId:'tp1-b'},expected),false);assert.equal(confirmedBybitTp1({...filled,orderStatus:'PartiallyFilled'},expected),false);assert.equal(confirmedBybitTp1(undefined,expected),false);
});
test('stop amendment preserves existing protection and does not confuse an ACK with observed protection',async()=>{
 let stop={symbol:'BTCUSDT',orderId:'stop-a',orderStatus:'Untriggered',side:'Sell',reduceOnly:true,triggerPrice:'90',qty:'1'},calls=0;
 const transport={read:async()=>stop,amend:async()=>{calls++}};
 assert.equal((await reconcileBybitStop({symbol:'BTCUSDT',side:'LONG',target:95,quantity:1,mark:100,transport})).state,'PENDING');assert.equal(calls,1);assert.equal(stop.triggerPrice,'90');
 const verified=await reconcileBybitStop({symbol:'BTCUSDT',side:'LONG',target:95,quantity:1,mark:100,transport:{...transport,amend:async x=>{stop={...stop,triggerPrice:x.triggerPrice}}}});assert.equal(verified.state,'VERIFIED');
 calls=0;const noLoosen=await reconcileBybitStop({symbol:'BTCUSDT',side:'LONG',target:92,quantity:1,mark:100,transport});assert.equal(noLoosen.state,'VERIFIED');assert.equal(calls,0);
 const uncertain=await reconcileBybitStop({symbol:'BTCUSDT',side:'LONG',target:96,quantity:1,mark:100,transport:{...transport,amend:async()=>{throw Error('timeout')}}});assert.equal(uncertain.state,'PENDING');assert.equal(stop.triggerPrice,'95');
});
test('close identities are scoped; uncertain lookup/ACK cannot duplicate a close or permit cleanup',async()=>{
 const clientId=await stableCloseIdentity('customer:account','row','tp1');assert.equal(clientId,await stableCloseIdentity('customer:account','row','tp1'));assert.notEqual(clientId,await stableCloseIdentity('other:account','row','tp1'));
 let submits=0;const order={clientOrderId:clientId,symbol:'BTCUSDT',side:'SELL',status:'FILLED',reduceOnly:true,executedQty:'1'};
 const base={clientId,symbol:'BTCUSDT',side:'SELL',quantity:1,submit:async()=>{submits++;return {status:'NEW'}}};
 await confirmedProviderClose({...base,lookup:async()=>order});assert.equal(submits,0);
 await assert.rejects(confirmedProviderClose({...base,lookup:async()=>{throw Error('network unknown')}}),/network unknown/);assert.equal(submits,0);
 let reads=0;await assert.rejects(confirmedProviderClose({...base,lookup:async()=>++reads===1?null:{...order,status:'NEW'}}),/UNCERTAIN/);assert.equal(submits,1);
});
