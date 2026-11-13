import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveVersionedAccountPolicy,evaluateAccountSignal} from '../../supabase/functions/_shared/account-policy-authority.ts';
import {DEFAULT_MT5_PROP_EVALUATION_POLICY} from '../../supabase/functions/_shared/account-execution-brain/contracts.ts';
import {HistoricalAccountLedger} from '../../supabase/functions/_shared/historical-account-ledger.ts';
import {account,context,input,signal,eligibility} from '../operations/support/accountPolicyFixture.ts';
const study={preset:'PROP_SAFE' as const,historicalPropStudy:'SIZING_AND_STATIC_20261113' as const,historicalStaticBasis:true,riskPerTradePct:2,maxLeverage:30,maxOpenRiskPct:3,maxDailyDrawdownPct:4.5,maxTotalDrawdownPct:9};
const owner={...account('research-prop','isolated-research-customer',true),immutableIdentity:'historical:research-prop'};
test('faster sizing remains isolated from real accounts and existing research defaults',()=>{
 const base=DEFAULT_MT5_PROP_EVALUATION_POLICY;
 assert.throws(()=>resolveVersionedAccountPolicy(account('real','customer-a',true),base,study),/ISOLATED_RESEARCH/);
 assert.throws(()=>resolveVersionedAccountPolicy(owner,base,{preset:'PROP_SAFE',riskPerTradePct:2},true),/POLICY_BOUND/);
 assert.throws(()=>resolveVersionedAccountPolicy({...owner,customerId:'customer-a'},base,study,true),/ISOLATED_RESEARCH/);
 const p=resolveVersionedAccountPolicy(owner,base,study,true);assert.equal(p.max_risk_per_trade_pct,2);assert.equal(p.max_leverage_allowed,30);assert.equal(p.historical_static_loss_basis,true);
 assert.throws(()=>resolveVersionedAccountPolicy(owner,base,{...study,riskPerTradePct:2.01},true),/POLICY_BOUND/);
 assert.equal(resolveVersionedAccountPolicy(owner,base,{preset:'PROP_SAFE'},true).max_portfolio_risk_pct,1.5);
 assert.equal(resolveVersionedAccountPolicy(owner,base,{preset:'PROP_SAFE'},true).historical_static_loss_basis,undefined);
});
test('static historical context retains the true peak while measuring daily loss against original capital',()=>{
 const contract={symbol:'EURUSD',contractSize:100000,quantityStep:.01,minimumQuantity:.01,minimumNotional:0,tickSize:.00001,leverage:30,feeBpsPerSide:0,spreadBps:0,slippageBps:0,minimumStopDistance:.00001,allowShort:true,provenance:{kind:'DOCUMENTED_ASSUMPTION' as const,source:'Controlled accounting test',limitations:[]}};
 const p={purpose:'HISTORICAL_RESEARCH' as const,initialCapital:10000,timezone:'UTC',dailyLossPct:5,overallLossPct:10,drawdown:'STATIC' as const,dailyBasis:'INITIAL_BALANCE' as const,stopOutMarginRatio:50};
 const first=new HistoricalAccountLedger(p,[contract]),s={...first.snapshot(),balance:12000,equity:11500,dayStart:12000,dayPeak:12500,peakEquity:13000};
 const actual=new HistoricalAccountLedger({...p,propContextModel:'HISTORICAL_STATIC_INITIAL_BALANCE'},[contract],s).context(context(owner.id,owner.customerId,true),Date.parse(input().evaluatedAt));
 assert.equal(actual.total_drawdown.high_water_mark,13000);assert.equal(actual.total_drawdown.current_drawdown_pct,0);assert.equal(actual.daily_drawdown.current_drawdown_pct,5);
 const trailing=new HistoricalAccountLedger({...p,propContextModel:'CONSERVATIVE_OBSERVED_HIGH_WATER'},[contract],s).context(context(owner.id,owner.customerId,true),Date.parse(input().evaluatedAt));assert.equal(trailing.total_drawdown.current_drawdown_pct,15);assert.equal(trailing.daily_drawdown.current_drawdown_pct,10);
});
test('static research does not apply an extra peak-equity loss limit or enter real/live execution',()=>{
 const i=input(),c={...context(owner.id,owner.customerId,true),balance:11000,equity:11000,total_drawdown:{initial_balance:10000,high_water_mark:13000,current_drawdown_amount:0,current_drawdown_pct:0,max_allowed_pct:9,is_violated:false}};
 const request={...i,historicalResearch:true as const,account:owner,context:c,basePolicy:DEFAULT_MT5_PROP_EVALUATION_POLICY,configuration:study,product:'FOREX_PROP' as const,eligibility:eligibility('FOREX_PROP')};
 const a=evaluateAccountSignal(request);assert(!a.ruleDiagnostics?.some(x=>x.ruleId==='rule_prop_floating_drawdown_limit'));
 const b=evaluateAccountSignal({...request,configuration:{...study,historicalStaticBasis:false}});assert(b.ruleDiagnostics?.some(x=>x.ruleId==='rule_prop_floating_drawdown_limit'));
 assert.throws(()=>evaluateAccountSignal({...request,context:{...c,environment:'LIVE'}}),/ISOLATED_RESEARCH/);
});
test('drawdown reduction can never raise a small requested Prop risk to the former 0.10% floor',async()=>{
 const {mt5PropBrain}=await import('../../supabase/functions/_shared/account-execution-brain/mt5-prop-brain.ts');
 const c={...context('real-prop','real-owner',true),balance:10000,equity:9700,daily_drawdown:{starting_balance:10000,peak_equity:10000,current_drawdown_amount:300,current_drawdown_pct:3,max_allowed_pct:4,is_violated:false},total_drawdown:{initial_balance:10000,high_water_mark:10000,current_drawdown_amount:300,current_drawdown_pct:3,max_allowed_pct:8,is_violated:false}};
 for(const requested of [.05,.01,.001]){const p={...DEFAULT_MT5_PROP_EVALUATION_POLICY,max_risk_per_trade_pct:requested,max_daily_drawdown_pct:4};const decision=mt5PropBrain.evaluateSignal(signal,c,p);assert(decision.authorized_risk_pct<=requested,JSON.stringify(decision));assert(decision.authorized_risk_pct>=0);assert.equal(decision.authorized_risk_pct,requested/2);}
});
