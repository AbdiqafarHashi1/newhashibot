import {test} from 'node:test';import assert from 'node:assert/strict';
import {exposureFactors,portfolioRiskGate} from '../../supabase/functions/_shared/portfolio-exposure.ts';
import {evaluateAccountSignal} from '../../supabase/functions/_shared/account-policy-authority.ts';
import {input} from './support/accountPolicyFixture.ts';
test('shared crypto and FX factors consume capital risk; opposite sides are never assumed to hedge',()=>{
 const gate=(symbol:string,positions:any[],correlatedLimitPct=1.5)=>portfolioRiskGate({symbol,positions,requestedRiskPct:.75,portfolioLimitPct:3,correlatedLimitPct});
 assert.equal(gate('BTCUSDT',[{symbol:'ETHUSDT',open_risk_pct:1}]).allowed,false);
 assert.equal(gate('EURUSD',[{symbol:'GBPUSD.a',open_risk_pct:1}]).allowed,false);
 assert.equal(gate('XAUUSD',[{symbol:'USDJPY',open_risk_pct:1}]).allowed,false);
 assert.equal(gate('EURUSD',[{symbol:'AUDCAD',open_risk_pct:1}]).allowed,true);
 assert.equal(gate('EURUSD',[{symbol:'EURUSD',open_risk_pct:NaN}]).allowed,false);
 assert.equal(gate('EURUSD',[{symbol:'AUDCAD',open_risk_pct:2.5}]).reasons.includes('PORTFOLIO_RISK_CAPACITY_EXCEEDED'),true);
 assert.deepEqual(exposureFactors('EURUSD.a'),['CURRENCY_EUR','CURRENCY_USD']);
});
test('actual account authority honors narrowed correlated risk and rejects policy expansion',()=>{
 const x=input(),configuration={...x.configuration,lossResponse:undefined,maxCorrelatedRiskPct:.5};
 const blocked=evaluateAccountSignal({...x,configuration});assert.equal(blocked.decision,'BLOCK');assert(blocked.reasonCodes.includes('CORRELATED_RISK_CAPACITY_EXCEEDED'));
 assert.throws(()=>evaluateAccountSignal({...x,configuration:{...configuration,maxCorrelatedRiskPct:100}}),/POLICY_BOUND_VIOLATION/);
 const allowed=evaluateAccountSignal({...x,configuration:{...configuration,maxCorrelatedRiskPct:3}});assert.equal(allowed.decision,'ALLOW');
});
