import test from 'node:test';
import assert from 'node:assert/strict';
import {goldTurboDraft,validateGoldTurboConfig,saveGoldTurboConfig,safeGoldTurboStatus,goldTurboCsv} from '../../supabase/functions/_shared/gold-turbo-admin.ts';
import {TURBO_IDS} from '../../supabase/functions/_shared/gold-turbo-lease.ts';
const account=()=>({id:'execution',customer_id:'owner',provider_account_identity:'mt5',provider:'MT5_PERSONAL',environment:'demo',account_mode:'PERSONAL',execution_enabled:true,runtime_control:'START',policy_overrides:{policy_configuration:{allowedStrategies:['keep-original']},other:'preserve'}});
const config=()=>({...goldTurboDraft(null),enabled:true,commission_quote_per_lot_per_side:1,slippage_quote_per_side:.005});
function database(){
 const db={account:account(),audits:[],failAudit:false,conflict:false};
 db.from=name=>{const filters=[];let patch;
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},update(v){patch=v;return q},
   async insert(row){if(db.failAudit)return {error:Error('audit unavailable')};db.audits.push(row);if(db.conflict)db.account.policy_overrides.concurrent='other edit';return {error:null}},
   async maybeSingle(){assert.equal(name,'connected_execution_accounts');if(!patch)return {data:structuredClone(db.account),error:null};
    const ok=filters.every(([k,v])=>k==='policy_overrides'?JSON.stringify(db.account[k])===v:db.account[k]===v);
    if(!ok)return {data:null,error:null};Object.assign(db.account,patch);return {data:{id:db.account.id},error:null};}};
  return q;};return db;
}
test('single/custom/adaptive modes use exact distinct IDs and explicit enabled costs',()=>{
 for(const selection_mode of ['CUSTOM','ADAPTIVE'])assert.equal(validateGoldTurboConfig(account(),{...config(),selection_mode}).strategy_ids.length,5);
 assert.equal(validateGoldTurboConfig(account(),{...config(),selection_mode:'SINGLE',strategy_ids:[TURBO_IDS[0]]}).strategy_ids.length,1);
 for(const c of [{...config(),selection_mode:'SINGLE'},{...config(),commission_quote_per_lot_per_side:null},{...config(),strategy_ids:['invented']},{...config(),hedge_enabled:true},{...config(),daily_loss_pct:3}])assert.throws(()=>validateGoldTurboConfig(account(),c));
 assert.equal(validateGoldTurboConfig(account(),goldTurboDraft(null)).enabled,false);
});
test('live/Prop/crypto customers cannot receive Turbo configuration',()=>{
 for(const a of [{...account(),environment:'live'},{...account(),account_mode:'PROP_FUNDED'},{...account(),provider:'BINANCE'}])assert.throws(()=>validateGoldTurboConfig(a,config()));
});
test('audited admin save preserves all other settings and pauses without disabling management',async()=>{
 const db=database();const result=await saveGoldTurboConfig(db,{id:'admin',role:'admin'},'owner','execution',null,config());
 assert.equal(result.entries,'PAUSED');assert.equal(result.execution_started,false);assert.equal(db.account.runtime_control,'PAUSE');assert.equal(db.account.execution_enabled,true);
 assert.deepEqual(db.account.policy_overrides.policy_configuration.allowedStrategies,['keep-original']);assert.equal(db.account.policy_overrides.other,'preserve');assert.equal(db.audits[0].event_type,'GOLD_TURBO_CONFIG_REQUESTED');
});
test('customers, stale drafts and failed audits cannot mutate configuration',async()=>{
 let db=database();await assert.rejects(saveGoldTurboConfig(db,{id:'owner',role:'customer'},'owner','execution',null,config()),/ADMIN_REQUIRED/);assert.equal(db.account.runtime_control,'START');
 db=database();await assert.rejects(saveGoldTurboConfig(db,{id:'admin',role:'admin'},'owner','execution',{enabled:true},config()),/CHANGED_RELOAD/);assert.equal(db.audits.length,0);
 db=database();db.failAudit=true;await assert.rejects(saveGoldTurboConfig(db,{id:'admin',role:'admin'},'owner','execution',null,config()),/AUDIT_REQUIRED/);assert.equal(db.account.runtime_control,'START');
});
test('concurrent policy edits are not silently overwritten',async()=>{
 const db=database();db.conflict=true;await assert.rejects(saveGoldTurboConfig(db,{id:'admin',role:'admin'},'owner','execution',null,config()),/CHANGED_RELOAD/);
 assert.equal(db.account.policy_overrides.concurrent,'other edit');assert.equal(db.account.policy_overrides.gold_turbo,undefined);
});
test('status is scoped, freshness-labelled, bounded and excludes arbitrary fields',()=>{
 const now=1800000000000,scope={account:'mt5',owner:'owner',bridge:'bridge'};
 const v={schema:'gold-turbo-status/v1',account_id:'mt5',owner_id:'owner',bridge_id:'bridge',as_of_ms:now,secret:'never',last_reason:'ACTIVE',net_money:2,active_baskets:Array.from({length:50},()=>({basket_id:'b',secret:'never'})),recent_decisions:[]};
 const result=safeGoldTurboStatus(v,scope,now);assert.equal(result.state,'OBSERVED');assert.equal(result.summary.active_baskets.length,20);assert.equal(JSON.stringify(result).includes('never'),false);
 assert.equal(safeGoldTurboStatus(v,{...scope,owner:'other'},now).state,'UNAVAILABLE');assert.equal(safeGoldTurboStatus(v,scope,now+31000).state,'STALE');assert.equal(safeGoldTurboStatus({...v,as_of_ms:0},scope,now).state,'UNAVAILABLE');
});
test('CSV escapes formulas, quotes and line breaks and ignores unknown fields',()=>{
 const csv=goldTurboCsv([{reason:'=HYPERLINK("evil")\nnext',strategy_id:'@formula',secret:'never'}]);
 assert.ok(csv.includes("'="));assert.ok(csv.includes("'@"));assert.ok(csv.includes('""evil""'));assert.equal(csv.includes('never'),false);
});
