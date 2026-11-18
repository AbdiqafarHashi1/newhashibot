import {test} from 'node:test';import assert from 'node:assert/strict';
import {houseMoneyRisk,type HouseMoneyFacts} from '../../supabase/functions/_shared/house-money-risk.ts';
import {rotationEntry,weekendRotation} from '../../supabase/functions/_shared/conditional-market.ts';
import {evaluateAccountSignal} from '../../supabase/functions/_shared/account-policy-authority.ts';
import {input,account,context,eligibility} from './support/accountPolicyFixture.ts';
import {DEFAULT_MT5_PROP_EVALUATION_POLICY} from '../../supabase/functions/_shared/account-execution-brain/contracts.ts';
const at='2026-11-18T10:00:00Z',base:HouseMoneyFacts={customerId:'c',accountId:'a',observedAt:at,monthlyPnlPct:0,dailyPnlPct:0,peakDrawdownPct:0,totalDrawdownPct:0,consecutiveLosses:0,phase:1};
const risk=(mode:any,patch:Partial<HouseMoneyFacts>={},hourly=false,multiplier=1)=>houseMoneyRisk(mode,{...base,...patch},at,hourly,multiplier);
test('Personal base, escalation, hourly cap, throttle and absolute halt use exact boundaries',()=>{
 assert.equal(risk('PERSONAL').applied_risk_pct,1);assert.equal(risk('PERSONAL',{monthlyPnlPct:3}).applied_risk_pct,2);assert.equal(risk('PERSONAL',{monthlyPnlPct:3},true).applied_risk_pct,2.25);
 assert.equal(risk('PERSONAL',{monthlyPnlPct:3,consecutiveLosses:2}).applied_risk_pct,1);assert.equal(risk('PERSONAL',{monthlyPnlPct:3,consecutiveLosses:3}).applied_risk_pct,.5);assert.equal(risk('PERSONAL',{peakDrawdownPct:5}).applied_risk_pct,.5);assert(risk('PERSONAL',{peakDrawdownPct:18}).block_reason);
 assert.equal(risk('PERSONAL',{monthlyPnlPct:3},true,.75).applied_risk_pct,1.6875);
});
test('Challenge and Funded thresholds, loss precedence and targets',()=>{
 assert.equal(risk('PROP_CHALLENGE_PASS').applied_risk_pct,.85);assert.equal(risk('PROP_CHALLENGE_PASS',{monthlyPnlPct:2}).applied_risk_pct,1);assert.equal(risk('PROP_CHALLENGE_PASS',{dailyPnlPct:-1.75}).applied_risk_pct,.4);assert.equal(risk('PROP_CHALLENGE_PASS',{consecutiveLosses:2}).applied_risk_pct,.4);
 for(const patch of [{dailyPnlPct:-3.25},{totalDrawdownPct:7.5},{monthlyPnlPct:8.2},{monthlyPnlPct:5.2,phase:2 as const}])assert(risk('PROP_CHALLENGE_PASS',patch).block_reason);
 assert.equal(risk('PROP_FUNDED_INCOME').applied_risk_pct,.45);assert.equal(risk('PROP_FUNDED_INCOME',{consecutiveLosses:2}).applied_risk_pct,.25);assert(risk('PROP_FUNDED_INCOME',{monthlyPnlPct:4.5}).block_reason);assert(risk('PROP_FUNDED_INCOME',{dailyPnlPct:-2.25}).block_reason);
});
test('stale, future and invalid observations cannot size; explicit latch overrides recovered equity',()=>{
 for(const patch of [{observedAt:'2026-11-18T09:58:59Z'},{observedAt:'2026-11-18T10:00:01Z'},{monthlyPnlPct:NaN},{consecutiveLosses:-1},{latchedReason:'CHALLENGE_TOTAL_HALT'}])assert(risk('PERSONAL',patch).block_reason);
});
test('UTC rotation boundaries and explicit crypto CFD eligibility',()=>{
 assert.equal(weekendRotation('2026-11-20T19:59:59Z'),false);assert.equal(weekendRotation('2026-11-20T20:00:00Z'),true);assert.equal(weekendRotation('2026-11-22T20:59:59Z'),true);assert.equal(weekendRotation('2026-11-22T21:00:00Z'),false);
 for(const symbol of ['EURUSD','XAUUSD','XAGUSD','LTCUSDT'])assert.equal(rotationEntry(symbol,'2026-11-21').allowed,false);
 for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT'])assert.equal(rotationEntry(symbol,'2026-11-21').riskMultiplier,.75);
 assert.equal(rotationEntry('BTCUSD','2026-11-21').allowed,false);assert.equal(rotationEntry('BTCUSD','2026-11-21',true).allowed,true);
});
test('real account authority applies dynamic risk without mutating canonical signal and rejects wrong scope',()=>{
 const x=input(),facts={...base,customerId:x.account.customerId,accountId:x.account.id,observedAt:x.evaluatedAt};
 const args={...x,configuration:{...x.configuration,houseMoney:'house-money/v1' as const},houseMoneyFacts:facts};
 const d=evaluateAccountSignal(args);assert.equal(d.base_risk_pct,1);assert.equal(d.decision,'ALLOW');assert.equal(d.authorizedRiskPct,1);
 const id='forex.complementary-ema-pullback';const high=evaluateAccountSignal({...args,signal:{...args.signal,strategy_id:id,timeframe:'1h'},configuration:{...args.configuration,allowedStrategies:[id]},houseMoneyFacts:{...facts,monthlyPnlPct:3}});assert.equal(high.authorizedRiskPct,2.25);
 assert.throws(()=>evaluateAccountSignal({...args,houseMoneyFacts:{...facts,accountId:'wrong'}}),/SCOPED_HOUSE_MONEY/);
 assert.equal(evaluateAccountSignal({...args,houseMoneyFacts:{...facts,peakDrawdownPct:18}}).authorizedRiskPct,0);
});

test('real Prop authority permits the requested challenge baseline and one-percent profit branch',()=>{
 const x=input(),a=account('a1','customer-a',true),ctx=context('a1','customer-a',true),facts={...base,customerId:a.customerId,accountId:a.id,observedAt:x.evaluatedAt};
 const args={...x,account:a,context:ctx,basePolicy:DEFAULT_MT5_PROP_EVALUATION_POLICY,product:'FOREX_PROP' as const,eligibility:eligibility('FOREX_PROP'),configuration:{preset:'PROP_SAFE' as const,houseMoney:'house-money/v1' as const,allowedStrategies:[x.signal.strategy_id]},houseMoneyFacts:facts};
 assert.equal(evaluateAccountSignal(args).authorizedRiskPct,.85);
 assert.equal(evaluateAccountSignal({...args,houseMoneyFacts:{...facts,monthlyPnlPct:2}}).authorizedRiskPct,1);
});
