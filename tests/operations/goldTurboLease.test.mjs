import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldTurboLease,TURBO_IDS} from '../../supabase/functions/_shared/gold-turbo-lease.ts';
const now=1800000000000,scope={owner:'owner',account:'mt5',bridge:'bridge',worker:'worker'};
const account={id:'execution',customer_id:'owner',provider_account_identity:'mt5',provider:'MT5_PERSONAL',environment:'demo',account_mode:'PERSONAL',execution_enabled:true,runtime_control:'START',policy_overrides:{gold_turbo:{enabled:true,strategy_ids:[...TURBO_IDS],commission_quote_per_lot_per_side:1,slippage_quote_per_side:.005}}};
const mt5={id:'mt5',user_id:'owner',bridge_id:'bridge',credential_capability:'master',execution_enabled:true,operational:true,server:'Demo'};
const binding={customer_id:'owner',execution_account_id:'execution',state:'ACTIVE',entitlement_id:'ent'};
const entitlement={id:'ent',customer_id:'owner',execution_account_id:'execution',state:'ACTIVE',source:'VERIFIED_PAYMENT',valid_from:new Date(now-1000).toISOString(),valid_until:new Date(now+600000).toISOString()};
test('scoped permission selects all five, expires within 30s and never enables live or hedges',()=>{
 const lease=buildGoldTurboLease(account,mt5,binding,entitlement,scope,now);
 assert.equal(lease.strategy_ids.length,5);assert.equal(lease.expires_at_ms,now+30000);assert.equal(lease.environment,'demo');assert.equal(lease.hedge_enabled,false);assert.equal(lease.daily_loss_pct,1.5);
});
test('finite subscription also caps lease expiry',()=>{
 assert.equal(buildGoldTurboLease(account,mt5,binding,{...entitlement,valid_until:new Date(now+1000).toISOString()},scope,now).expires_at_ms,now+1000);
});
test('profit mode reaches the local lease without changing demo risk or subscription',()=>{
 const a={...account,policy_overrides:{gold_turbo:{...account.policy_overrides.gold_turbo,profit_exit_mode:'STRATEGY_EXITS'}}};
 const lease=buildGoldTurboLease(a,mt5,binding,entitlement,scope,now);
 assert.equal(lease.profit_exit_mode,'STRATEGY_EXITS');assert.equal(lease.daily_loss_pct,1.5);assert.equal(lease.hedge_enabled,false);
 assert.throws(()=>buildGoldTurboLease({...a,policy_overrides:{gold_turbo:{...a.policy_overrides.gold_turbo,profit_exit_mode:'REMOVE_STOPS'}}},mt5,binding,entitlement,scope,now));
});
test('opening-range choice is server-scoped; failed replacement is not authorized',()=>{
 const configured=value=>({...account,policy_overrides:{gold_turbo:{...account.policy_overrides.gold_turbo,momentum_entry_variant:value}}});
 assert.equal(buildGoldTurboLease(configured('SESSION_BREAKOUT'),mt5,binding,entitlement,scope,now).momentum_entry_variant,'SESSION_BREAKOUT');
 assert.throws(()=>buildGoldTurboLease(configured('SIMPLE_PULLBACK'),mt5,binding,entitlement,scope,now));
});
test('foreign, live, Prop and disabled account states cannot receive local authority',()=>{
 for(const change of [{customer_id:'other'},{environment:'live'},{account_mode:'PROP_FUNDED'},{execution_enabled:false},{runtime_control:'PAUSE'}])
  assert.throws(()=>buildGoldTurboLease({...account,...change},mt5,binding,entitlement,scope,now));
 assert.throws(()=>buildGoldTurboLease(account,{...mt5,bridge_id:'other'},binding,entitlement,scope,now));
});
test('expired, revoked, unbound or unverified subscriptions fail closed',()=>{
 for(const change of [{state:'EXPIRED'},{revoked_at:new Date(now).toISOString()},{source:'NOT_CONFIGURED'},{valid_until:null},{valid_from:null},{valid_until:new Date(now-1).toISOString()}])
  assert.throws(()=>buildGoldTurboLease(account,mt5,binding,{...entitlement,...change},scope,now));
 assert.throws(()=>buildGoldTurboLease(account,mt5,{...binding,execution_account_id:'foreign'},entitlement,scope,now));
});
test('costs, risk limits and strategy list cannot be inferred or expanded',()=>{
 for(const change of [{daily_loss_pct:3},{risk_pct:5},{max_open_risk_pct:20},{commission_quote_per_lot_per_side:null},{strategy_ids:['made-up']},{strategy_ids:[]}]){
  const config={...account.policy_overrides.gold_turbo,...change};
  assert.throws(()=>buildGoldTurboLease({...account,policy_overrides:{gold_turbo:config}},mt5,binding,entitlement,scope,now));
 }
});
