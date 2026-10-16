import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluateAccountSignal,type OwnedExecutionAccount,type PolicyConfiguration} from '../../supabase/functions/_shared/account-policy-authority';
import {DEFAULT_MT5_PERSONAL_POLICY,DEFAULT_MT5_PROP_EVALUATION_POLICY} from '../../supabase/functions/_shared/account-execution-brain/contracts';
import type {AccountExecutionContext,SignalContract} from '../../supabase/functions/_shared/account-execution-brain/types';
import type {EligibilityDecision,EligibilityProduct} from '../../supabase/functions/_shared/trading-domain/production-eligibility-router';
const now = "2026-09-25T12:00:00.000Z";
const signal: SignalContract = Object.freeze({ signal_id:"canonical-phase-c-1",symbol:"EURUSD",market_type:"forex",direction:"BUY",entry_price:1.1,stop_loss:1.095,tp1:1.11,tp2:1.12,confidence_score:90,grade:"A",strategy_id:"breakout-v1",timeframe:"15m",created_at:now });
const context = (accountId:string, customerId:string, prop=false, patch:Partial<AccountExecutionContext>={}):AccountExecutionContext => Object.freeze({ account_id:accountId,user_id:customerId,provider:prop?"MT5_PROP":"MT5_PERSONAL",account_type:prop?"PROP_EVALUATION":"PERSONAL",environment:"DEMO",balance:10000,equity:10000,free_margin:10000,used_margin:0,leverage:5,open_positions:[],exposure:{total_notional_usd:0,total_open_risk_usd:0,total_open_risk_pct:0,active_position_count:0,positions_by_symbol:{}},daily_drawdown:{starting_balance:10000,peak_equity:10000,current_drawdown_amount:0,current_drawdown_pct:0,max_allowed_pct:prop?4:5,is_violated:false},total_drawdown:{initial_balance:10000,high_water_mark:10000,current_drawdown_amount:0,current_drawdown_pct:0,max_allowed_pct:prop?8:12,is_violated:false},risk_profile:{max_risk_per_trade_pct:2,max_open_risk_pct:6,max_leverage:20,min_notional_usd:10},prop_rules:prop?{daily_loss_cap_pct:4,total_trailing_drawdown_cap_pct:8,news_trading_allowed:false,weekend_holding_allowed:false,min_trading_days:5,current_trading_days:1,breach_status:"HEALTHY"}:null,session_state:{is_session_open:true,active_session_name:"London",current_time_utc:now},news_state:{in_high_impact_news_window:false,news_event_title:null,minutes_to_news:null,minutes_after_news:null},runtime_health:{is_healthy:true,last_heartbeat_at:now,bridge_status:"CONNECTED",error_count_last_hour:0},updated_at:now,...patch });
const account=(id:string,customerId:string,prop=false):OwnedExecutionAccount=>Object.freeze({id,immutableIdentity:`mt5:demo:${id}`,customerId,provider:prop?"MT5_PROP":"MT5_PERSONAL",accountType:prop?"PROP_EVALUATION":"PERSONAL",active:true,executionEnabled:true,runtimeControl:"START",policyProfileId:prop?DEFAULT_MT5_PROP_EVALUATION_POLICY.policy_id:DEFAULT_MT5_PERSONAL_POLICY.policy_id,policyVersion:prop?DEFAULT_MT5_PROP_EVALUATION_POLICY.policy_version:DEFAULT_MT5_PERSONAL_POLICY.policy_version,credentialRef:"vault-secret-never-return"});
const eligibility=(product:EligibilityProduct):EligibilityDecision=>({version:"production-eligibility-router/v1",decision:"ELIGIBLE",reasonCodes:[],product,market:"FOREX",qualifiedSetId:"qualified",qualifiedSetVersion:"v1",configId:"config",configVersion:"v1",pinnedStrategyParameters:{},signalPolicyVersion:"phase-c/v1"});
const config=(preset:PolicyConfiguration["preset"]):PolicyConfiguration=>({preset,allowedSymbols:["EURUSD"],allowedStrategies:["breakout-v1"],allowedSessions:["London"]});
const evaluate=(a:OwnedExecutionAccount,c:AccountExecutionContext,preset:PolicyConfiguration["preset"],product:EligibilityProduct, entitlement:"ACTIVE"|"INACTIVE"|"EXPIRED"="ACTIVE")=>evaluateAccountSignal({signal,account:a,context:c,basePolicy:a.accountType==="PERSONAL"?DEFAULT_MT5_PERSONAL_POLICY:DEFAULT_MT5_PROP_EVALUATION_POLICY,configuration:config(preset),entitlement:{state:entitlement,expiresAt:entitlement==="EXPIRED"?"2026-09-24T00:00:00Z":null},product,eligibility:eligibility(product),evaluatedAt:now});


const lossResponse={version:'loss-response/v1' as const,reduceAfterLosses:2,pauseAfterLosses:3,pauseMinutes:60,reducedRiskMultiplier:.5,drawdownReducePct:2,maxEvidenceAgeMs:900000};
const input=()=>({signal,account:account('a1','customer-a'),context:context('a1','customer-a'),basePolicy:DEFAULT_MT5_PERSONAL_POLICY,configuration:{...config('BALANCED'),lossResponse},entitlement:{state:'ACTIVE' as const,expiresAt:null},product:'FOREX_PERSONAL' as const,eligibility:eligibility('FOREX_PERSONAL'),evaluatedAt:now});
const evidence=(losses:number)=>({customerId:'customer-a',accountId:'a1',provider:'MT5_PERSONAL',source:'CANONICAL_PROVIDER' as const,closedTradeCount:losses,consecutiveLosses:losses,lastLossAt:losses?'2026-09-25T11:55:00Z':null,asOf:now});
test('Phase D applies account-specific loss cooldown and defensive quantity reduction without mutating signal',()=>{
 const before=JSON.stringify(signal),normal=evaluateAccountSignal({...input(),performanceEvidence:evidence(0)}),reduced=evaluateAccountSignal({...input(),performanceEvidence:evidence(2)}),paused=evaluateAccountSignal({...input(),performanceEvidence:evidence(3)});
 assert.equal(normal.decision,'ALLOW');assert.equal(reduced.decision,'REDUCE');assert.equal(reduced.authorizedRiskPct,normal.authorizedRiskPct*.5);assert.ok(reduced.executionIntent!.approvedQuantity<=normal.executionIntent!.approvedQuantity*.5+1e-9);
 assert.equal(paused.decision,'BLOCK');assert.equal(paused.executionIntent,null);assert.ok(paused.reasonCodes.includes('LOSS_STREAK_COOLDOWN'));assert.equal(JSON.stringify(signal),before);
 assert.notEqual(normal.decisionId,reduced.decisionId);assert.equal(evaluateAccountSignal({...input(),performanceEvidence:{...evidence(3),lastLossAt:'2026-09-25T10:00:00Z'}}).decision,'REDUCE');
});
test('performance scope, missing/stale evidence, unsafe policy and live context fail closed',()=>{
 assert.equal(evaluateAccountSignal(input()).decision,'BLOCK');
 assert.equal(evaluateAccountSignal({...input(),performanceEvidence:{...evidence(0),accountId:'other-account'}}).decision,'BLOCK');
 assert.equal(evaluateAccountSignal({...input(),performanceEvidence:{...evidence(0),asOf:'2026-09-24T12:00:00Z'}}).decision,'BLOCK');
 assert.throws(()=>evaluateAccountSignal({...input(),configuration:{...input().configuration,lossResponse:{...lossResponse,reducedRiskMultiplier:2}},performanceEvidence:evidence(2)}),/INVALID_LOSS_RESPONSE/);
 assert.equal(evaluateAccountSignal({...input(),context:context('a1','customer-a',false,{environment:'LIVE'}),performanceEvidence:evidence(0)}).decision,'BLOCK');
 assert.throws(()=>evaluateAccountSignal({...input(),context:context('a1','customer-a',false,{equity:NaN}),performanceEvidence:evidence(0)}),/FINANCIAL_CONTEXT/);
});

test('minimum provider lot cannot inflate approved risk; insufficient margin cannot produce an intent',()=>{
 const tiny=evaluateAccountSignal({...input(),configuration:{...input().configuration,lossResponse:undefined},context:context('a1','customer-a',false,{balance:1,equity:1,free_margin:1})});
 assert.equal(tiny.decision,'BLOCK');assert.equal(tiny.executionIntent,null);assert.equal(tiny.authorizedRiskPct,0);
 const noMargin=evaluateAccountSignal({...input(),configuration:{...input().configuration,lossResponse:undefined},context:context('a1','customer-a',false,{free_margin:.01})});
 assert.equal(noMargin.decision,'BLOCK');assert.equal(noMargin.executionIntent,null);
});
