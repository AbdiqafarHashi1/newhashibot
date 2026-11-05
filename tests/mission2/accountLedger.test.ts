import {evaluateAccountSignal} from '../../supabase/functions/_shared/account-policy-authority.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {HistoricalAccountLedger,type HistoricalAccountPolicy,type HistoricalExecutionSpec} from '../../supabase/functions/_shared/historical-account-ledger.ts';
import {input as fixture} from '../operations/support/accountPolicyFixture.ts';
import {mt5Spec} from '../operations/support/planningFixture.ts';
import type {ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
const now=Date.parse('2026-09-25T12:00:00Z'),policy:HistoricalAccountPolicy={purpose:'HISTORICAL_RESEARCH',initialCapital:10000,timezone:'UTC',dailyLossPct:5,overallLossPct:12,drawdown:'STATIC',dailyBasis:'DAY_START_BALANCE',stopOutMarginRatio:50};
const spec:HistoricalExecutionSpec={symbol:'EURUSD',contractSize:100000,quantityStep:.01,minimumQuantity:.01,minimumNotional:0,tickSize:.00001,leverage:5,feeBpsPerSide:0,spreadBps:0,slippageBps:0,minimumStopDistance:.00001,allowShort:true,provenance:{kind:'DOCUMENTED_ASSUMPTION',source:'Controlled test',limitations:['No real broker connectivity evidence']}};
function input(){const i=fixture();return {...i,configuration:{...i.configuration,lossResponse:undefined},context:{...i.context,provider_contract:mt5Spec('MT5_PERSONAL')}};}
const setup=(id='a'):ConditionalSetup=>({id,symbol:'EURUSD',market:'forex',timeframe:'5m',track:'SCALP',side:'buy',strategy:'breakout-v1',variant:'TREND',policy:'conditional-signals/v1',source:'CONTROLLED_TEST',sourceClose:new Date(now).toISOString(),trigger:1.1,stop:1.095,tp1:1.11,tp2:1.12,expiresAt:new Date(now+900000).toISOString(),holdBars:20,score:90,reason:'Controlled test',status:'ACTIVE',version:1,lastBar:new Date(now-300000).toISOString(),fillAt:new Date(now).toISOString(),entryDecision:{schema:'entry-decision/v1',kind:'IMMEDIATE_CONFIRMED',opportunityId:id,strategyVersion:'1',evaluatedAt:new Date(now).toISOString(),dataClose:new Date(now).toISOString(),reasons:[],netRewardRisk:4,confirmation:'COMPLETE',executionEligible:false,authorizationScope:'RESEARCH'},management:{partialFraction:.5,breakEvenAfterTp1:false,maximumChaseR:.25}});
const quote={symbol:'EURUSD',at:now,bid:1.1,ask:1.1,conversion:1};
const bar=(open=1.1,high=1.105,low=1.097,close=1.102)=>({symbol:'EURUSD',market_type:'forex',timeframe:'5m',source:'CONTROLLED_TEST',open_time:new Date(now).toISOString(),open,high,low,close,volume:100});
test('actual account Brain sizes entry; floating equity, stop-first costs and replay recovery are independently accounted',()=>{
 const ledger=new HistoricalAccountLedger(policy,[spec]),d=ledger.enter(setup(),quote,input());assert.equal(d?.decision,'ALLOW',JSON.stringify(d));const q=d!.executionIntent!.approvedQuantity;assert(q>0);
 ledger.observeClosedBars([bar(1.1,1.125,1.09,1.101)],now+300000);
 const s=ledger.snapshot();assert.equal(s.trades.length,1);assert.equal(s.trades[0].reason,'STOP_FIRST');assert(Math.abs(s.trades[0].net-(-.005*q*100000))<1e-7);assert.equal(s.balance,10000+s.trades[0].net);assert(s.equityPath.some(p=>p.kind==='CONSERVATIVE_INTRABAR_EQUITY_BOUND'&&p.equity<10000));
 const recovered=new HistoricalAccountLedger(policy,[spec],s);recovered.observeClosedBars([bar(1.1,1.125,1.09,1.101)],now+300000);assert.deepEqual(recovered.snapshot(),s);assert.equal(recovered.enter(setup(),{...quote,at:now+300000},input()),null);assert.equal(recovered.snapshot().decisions.at(-1)!.reasons[0],'EXECUTION_REPLAY_PREVENTED');
});
test('preliminary/expired signals, deteriorated quotes and expired entitlement cannot create fills',()=>{
 const ledger=new HistoricalAccountLedger(policy,[spec]);assert.equal(ledger.enter({...setup(),status:'WAITING'},quote,input()),null);assert.equal(ledger.enter(setup(),{...quote,ask:1.119},input()),null);
 const expired={...input(),entitlement:{state:'EXPIRED' as const,expiresAt:new Date(now-1).toISOString()}};assert.equal(ledger.enter(setup(),quote,expired)?.decision,'BLOCK');assert.equal(ledger.snapshot().positions.length,0);
 assert.equal(ledger.enter(setup(),quote,input())?.decision,'ALLOW','a rejected price attempt does not become a fictitious accepted-order duplicate');
});
test('gap-through stop uses the observed worse quote, financing is idempotent, and drawdown locks use floating equity',()=>{
 const ledger=new HistoricalAccountLedger({...policy,dailyLossPct:.2},[spec]);assert.equal(ledger.enter(setup(),quote,input())?.decision,'ALLOW');
 ledger.financing(now+1000,'funding-1',{EURUSD:.0001});const once=ledger.snapshot().balance;ledger.financing(now+1000,'funding-1',{EURUSD:.0001});assert.equal(ledger.snapshot().balance,once);
 ledger.observeQuotes([{...quote,at:now+2000,bid:1.08,ask:1.081}],now+2000);const s=ledger.snapshot();assert.equal(s.trades.length,1);assert(s.trades[0].netR<-1);assert.equal(s.trades[0].reason,'OBSERVED_QUOTE_STOP');assert(s.dailyLocked);assert.equal(ledger.enter(setup('b'),{...quote,at:now+3000},input()),null);assert.equal(ledger.snapshot().decisions.at(-1)!.reasons[0],'DAILY_EQUITY_LOCK');
});
test('Gold uses broker contract size, dollar tick value and lot steps rather than Forex pip assumptions',()=>{
 const gold:HistoricalExecutionSpec={...spec,symbol:'XAUUSD',contractSize:100,tickSize:.01,leverage:20,minimumStopDistance:.1,feeBpsPerSide:1,spreadBps:1,slippageBps:1};
 const s={...setup('gold-controlled'),symbol:'XAUUSD',trigger:2000,stop:1992,tp1:2016,tp2:2024},q={symbol:'XAUUSD',at:now,bid:1999.9,ask:2000.1,conversion:1};
 const original=input(),i={...original,configuration:{...original.configuration,allowedSymbols:['XAUUSD'],allowedStrategies:[s.strategy]},signal:{...original.signal,symbol:'XAUUSD',entry_price:2000,stop_loss:1992,tp1:2016,tp2:2024},context:{...original.context,leverage:20,provider_contract:{...mt5Spec('MT5_PERSONAL'),symbol:'XAUUSD',broker_symbol:'XAUUSD',contract_size:100,tick_size:.01,tick_value_account_currency:1,pip_size:.1,price_precision:2,minimum_lot:.01,lot_step:.01,maximum_leverage:20}}};
 const ledger=new HistoricalAccountLedger(policy,[gold]);const decision=ledger.enter(s,q,i);assert(['ALLOW','REDUCE'].includes(decision?.decision??''),JSON.stringify(decision));const position=ledger.snapshot().positions[0];assert.equal(Math.round(position.quantity*100),position.quantity*100);assert(position.quantity<1);assert(position.entry>q.ask);
 ledger.observeQuotes([{...q,at:now+1000,bid:1988,ask:1988.2}],now+1000);const t=ledger.snapshot().trades[0];assert(t.netR<-1);assert(t.costs>0);assert.equal(t.reason,'OBSERVED_QUOTE_STOP');assert(Math.abs(t.gross-(t.exit-t.entry)*t.quantity*100)<1e-7);
});

test('account diagnostics retain the actual violated rule instead of inferring it from a reused legacy code',()=>{
 const i=input(),decision=evaluateAccountSignal({...i,context:{...i.context,free_margin:0}});
 assert.equal(decision.decision,'BLOCK');
 assert(decision.ruleDiagnostics?.some(r=>/margin/i.test(r.ruleId)||/margin/i.test(r.message)),JSON.stringify(decision));
 assert(decision.ruleDiagnostics?.every(r=>r.ruleId&&r.category&&r.severity&&r.message));
});
