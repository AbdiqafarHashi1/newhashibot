import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCANNER_PRODUCT_STRATEGIES,PERSONAL_GROWTH_STRATEGIES,productEntryQuality,loadProductEntryQuality} from '../../supabase/functions/_shared/strategy-deployment-policy.ts';
import {VIP_CONFIG_IDS} from '../../supabase/functions/_shared/vip-signal-policy.ts';
import {rotationEntry} from '../../supabase/functions/_shared/conditional-market.ts';
test('eight-engine product roster has explicit independent IDs and Gold quality cannot use future or unknown volume',()=>{
 assert.equal(SCANNER_PRODUCT_STRATEGIES.length,8);assert.equal(new Set(PERSONAL_GROWTH_STRATEGIES).size,8);assert.deepEqual(VIP_CONFIG_IDS,PERSONAL_GROWTH_STRATEGIES);
 const strategy='gold.rsi-trailing-15-48-1.5-5-h96',setup={strategy,fillAt:'2026-11-18T12:00:00Z',intelligence:{observedAt:'2026-11-18T11:59:00Z',volumeRatio:1}};
 assert.equal(productEntryQuality(strategy,{...setup,fillAt:undefined},'2026-11-18T12:00:00Z'),true);assert.equal(productEntryQuality(strategy,{...setup,fillAt:undefined},'2026-11-18T11:58:00Z'),false);
 assert.equal(productEntryQuality(strategy,setup),true);assert.equal(productEntryQuality(strategy,undefined),false);
 for(const volumeRatio of [0,.99,NaN,Infinity,'1'])assert.equal(productEntryQuality(strategy,{...setup,intelligence:{...setup.intelligence,volumeRatio}}),false);
 assert.equal(productEntryQuality(strategy,{...setup,intelligence:{...setup.intelligence,observedAt:'2026-11-18T12:01:00Z'}}),false);
 const weekend='2026-11-21T12:00:00Z';assert.equal(rotationEntry('LTCUSDT',weekend).allowed,false);assert.equal(rotationEntry('LTCUSDT',weekend,false,true).allowed,true);assert.equal(rotationEntry('LTCUSDT',weekend,false,true).riskMultiplier,.75);assert.equal(rotationEntry('XAUUSD',weekend,false,true).allowed,false);
});
test('Gold overlay reloads persisted scoped setup evidence and cannot be supplied by a request',async()=>{
 const strategy='gold.rsi-trailing-15-48-1.5-5-h96';let reads=0;const db={from:()=>{reads++;const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{state:{strategy,symbol:'XAUUSD',timeframe:'15m',fillAt:'2026-11-18T12:00:00Z',intelligence:{observedAt:'2026-11-18T11:59:00Z',volumeRatio:1.1}}},error:null})};return q;}};
 assert.equal(await loadProductEntryQuality(db,{strategy_id:strategy,intelligence:{volumeRatio:10}}),false);assert.equal(reads,0);
 assert.equal(await loadProductEntryQuality(db,{strategy_id:strategy,symbol:'XAUUSD',timeframe:'15m',arbitrator_decision:{conditional_setup_id:'persisted'}}),true);
 assert.equal(await loadProductEntryQuality(db,{strategy_id:strategy,symbol:'EURUSD',timeframe:'15m',arbitrator_decision:{conditional_setup_id:'persisted'}}),false);
});


test('retired conditional strategies can finish an already delivered watch, but cannot publish a new watch',async()=>{
 (globalThis as any).Deno={env:{get:()=>undefined}};const {renderCanonicalTruth,SupabasePublicationStore}=await import('../../supabase/functions/_shared/canonical-publication-runtime.ts');
 const setup={strategy:'gold.frontier-compression-15-24-1.5-5-h96',status:'CLOSED'},truth:any={entityType:'lifecycle_event',entityId:'event',eventType:'CONDITIONAL_SETUP',eventVersion:1,occurredAt:'2026-11-18T12:00:00Z',payload:{setup_id:'old-watch',market_type:'forex',policy:'conditional-signals/v1',message:'Gold watch closed at its recorded stop.',state:setup}};
 assert.throws(()=>renderCanonicalTruth(truth,'vip_forex_gold'),/VIP_STRATEGY_NOT_ADMITTED/);
 let delivered=false;const db={from(table:string){const q:any={select:()=>q,eq:()=>q,or:()=>q,contains:()=>q,lt:()=>q,order:()=>q,in:()=>q,limit:()=>q,then:(yes:any)=>Promise.resolve({data:[{id:'prior'}],error:null}).then(yes),maybeSingle:async()=>({error:null,data:table==='canonical_lifecycle_events'?{id:'event',event_type:'CONDITIONAL_SETUP',event_version:1,occurred_at:truth.occurredAt,payload:truth.payload}:table==='conditional_signal_setups'?{state:setup}:delivered?{id:'sent'}:null})};return q;}};
 const claim:any={id:'work',entityType:'lifecycle_event',entityId:'event',eventType:'CONDITIONAL_SETUP',eventVersion:1,destination:'vip_forex_gold'};
 const store=new SupabasePublicationStore(db),blocked=(await store.loadTruth(claim))!;assert.throws(()=>renderCanonicalTruth(blocked,'vip_forex_gold'),/VIP_STRATEGY_NOT_ADMITTED/);
 delivered=true;const allowed=(await store.loadTruth(claim))!;assert.doesNotThrow(()=>renderCanonicalTruth(allowed,'vip_forex_gold'));
});
