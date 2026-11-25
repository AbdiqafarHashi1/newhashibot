import {test} from 'node:test';
import assert from 'node:assert/strict';
import {customerTradingActionAllowed} from '../../supabase/functions/_shared/customer-trading-access.ts';
import {portfolioRiskGate} from '../../supabase/functions/_shared/portfolio-exposure.ts';
test('customer account reports stay available; onboarding consent and trading mutations require Admin',()=>{
 for(const action of ['account_detail','account_policy','refresh_readiness'])assert.equal(customerTradingActionAllowed('customer',action),true);
 for(const action of ['acknowledge_risk','assign_brain','create_account_draft','submit_credentials','set_account_control','revoke_credentials','create_pairing','install_tested_demo_strategies','authorize_live_account','unknown']){
  assert.equal(customerTradingActionAllowed('customer',action),false,action);
  assert.equal(customerTradingActionAllowed('admin',action),true,action);
 }
});
test('crypto, gold and FX share the USD concentration budget without claiming hedging offsets',()=>{
 for(const [symbol,existing] of [['BTCUSDT','XAUUSD'],['EURUSD','ETHUSDT'],['USDJPY','GBPUSD']]){
  const decision=portfolioRiskGate({symbol,positions:[{symbol:existing,open_risk_pct:1}],requestedRiskPct:.75,portfolioLimitPct:3,correlatedLimitPct:1.5});
  assert.equal(decision.allowed,false);assert(decision.reasons.includes('CORRELATED_RISK_CAPACITY_EXCEEDED'));
 }
});
