import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PERSONAL_RISK_PROFILES,personalRiskProfile,assertSmartGrowthHistory,assertPersonalProfileAssignment,concurrentCryptoRiskMultiplier} from '../../supabase/functions/_shared/personal-growth-policy.ts';
import {houseMoneyRisk} from '../../supabase/functions/_shared/house-money-risk.ts';
import {personalCapitalSuitability} from '../../supabase/functions/_shared/capital-suitability.ts';
import {VIP_CONFIG_IDS,VIP_RISK_FOOTER} from '../../supabase/functions/_shared/vip-signal-policy.ts';
import {replay} from '../../scripts/research/focused-portfolio/replay.ts';
import {evaluateAccountSignal} from '../../supabase/functions/_shared/account-policy-authority.ts';
import {input} from './support/accountPolicyFixture.ts';
import {DEFAULT_BINANCE_PERSONAL_POLICY} from '../../supabase/functions/_shared/account-execution-brain/contracts.ts';
import {cryptoSpec} from './support/planningFixture.ts';
const now='2026-09-25T12:00:00Z',facts={customerId:'c',accountId:'a',observedAt:now,monthlyPnlPct:0,dailyPnlPct:0,peakDrawdownPct:0,totalDrawdownPct:0,consecutiveLosses:0,phase:1 as const};
test('Smart Growth limits, fresh history boundaries and account-scoped eligibility',()=>{
 assert.deepEqual(PERSONAL_RISK_PROFILES.SMART_GROWTH,{risk:1.5,open:7,correlated:4.5,daily:6,peak:14});assert.equal(personalRiskProfile(undefined),'STANDARD');assert.equal(personalRiskProfile('GROWTH_2'),'GROWTH_2PCT');
 assert.equal(houseMoneyRisk('PERSONAL',facts,now,false,1,'SMART_GROWTH').applied_risk_pct,1.5);assert.equal(houseMoneyRisk('PERSONAL',facts,now,false,.75,'SMART_GROWTH').applied_risk_pct,1.125);
 for(const f of [{...facts,dailyPnlPct:-6},{...facts,peakDrawdownPct:14}])assert.equal(houseMoneyRisk('PERSONAL',f,now,false,1,'SMART_GROWTH').applied_risk_pct,0);
 const proof={customerId:'c',accountId:'a',provider:'BINANCE',observedAt:now,verifiedDays:30,closedTradeCount:1,historyComplete:true};assert.doesNotThrow(()=>assertSmartGrowthHistory(proof,'c','a','BINANCE',now));
 for(const patch of [{verifiedDays:29},{historyComplete:false},{closedTradeCount:0},{accountId:'other'},{observedAt:'2026-09-25T11:58:00Z'},{observedAt:'2026-09-25T12:00:01Z'}])assert.throws(()=>assertSmartGrowthHistory({...proof,...patch},'c','a','BINANCE',now),/30_VERIFIED_DAYS/);
});
test('Admin-only experimental assignment, capital warning boundaries and eight-source client copy',()=>{
 assertPersonalProfileAssignment('AGGRESSIVE_5PCT','admin');for(const role of ['customer','owner',undefined])assert.throws(()=>assertPersonalProfileAssignment('AGGRESSIVE_5PCT',role),/ADMIN_REQUIRED/);
 assert.equal(personalCapitalSuitability('PERSONAL',1499.99,'USD').warning,true);assert.equal(personalCapitalSuitability('PERSONAL',0,'USD').warning,true);assert.equal(personalCapitalSuitability('PERSONAL',null,'USD').code,'USD_EQUITY_UNAVAILABLE');assert.equal(personalCapitalSuitability('PERSONAL',1500,'USDT').warning,false);assert.equal(personalCapitalSuitability('PROP_EVALUATION',500,'USD').warning,false);assert.equal(personalCapitalSuitability('PERSONAL',500,'KES').code,'USD_EQUITY_UNAVAILABLE');
 assert.equal(VIP_CONFIG_IDS.length,8);assert.equal(VIP_CONFIG_IDS.filter(id=>id.startsWith('crypto.')).length,4);assert.match(VIP_RISK_FOOTER,/0.5%–1.5%/);assert.match(VIP_RISK_FOOTER,/0.25%–0.50%/);
 const guide=readFileSync('docs/launch/VIP_SUBSCRIBER_RISK_GUIDE.md','utf8');assert.doesNotMatch(guide,/(?<![\d.])5(?:\.0)?%|AGGRESSIVE_5/);assert.match(guide,/\$2,000/);assert.match(guide,/\$1,500/);
});
test('concurrency guard uses currently open Crypto positions, never future trades or Forex exposure',()=>{
 assert.equal(concurrentCryptoRiskMultiplier('BTCUSDT',[]),1);assert.equal(concurrentCryptoRiskMultiplier('BTCUSDT',[{symbol:'EURUSD'}]),1);assert.equal(concurrentCryptoRiskMultiplier('BTCUSDT',[{symbol:'ETHUSDT'}]),.5);assert.equal(concurrentCryptoRiskMultiplier('XAUUSD',[{symbol:'ETHUSDT'}]),1);
 const strategy='crypto.test',entry=Date.parse('2026-09-16T01:00Z'),data={coverage:[{strategy,start:'2026-09-16',end:'2026-10-16'}],trades:[{id:'a',strategy,symbol:'BTCUSDT',timeframe:'1h',entry,exit:entry+7200000,netR:-1},{id:'b',strategy,symbol:'ETHUSDT',timeframe:'1h',entry:entry+1000,exit:entry+3600000,netR:-1}]};
 const p={riskPct:1.5,dailyHaltPct:6,peakHaltPct:14,portfolioLimitPct:7,correlatedLimitPct:4.5};const run=(guard:boolean)=>replay(data,[],[strategy],'PERSONAL',{start:'2026-09-16',days:30},0,false,undefined,{...p,concurrentCryptoGuard:guard});assert.ok(Math.abs(run(false).returnPct+3)<1e-8);assert.ok(Math.abs(run(true).returnPct+2.25)<1e-8);assert.equal(run(true).guardedEntries,1);
});
test('canonical account authority requires Smart history and halves a second Crypto order',()=>{
 const base=input(),id=base.account.id,customer=base.account.customerId,at=base.evaluatedAt;
 const x:any={...base,account:{...base.account,provider:'BINANCE',policyProfileId:DEFAULT_BINANCE_PERSONAL_POLICY.policy_id,policyVersion:DEFAULT_BINANCE_PERSONAL_POLICY.policy_version},basePolicy:DEFAULT_BINANCE_PERSONAL_POLICY,product:'CRYPTO_PERSONAL',eligibility:{...base.eligibility,product:'CRYPTO_PERSONAL',market:'CRYPTO'},signal:{...base.signal,symbol:'BTCUSDT',market_type:'crypto',entry_price:50000,stop_loss:49500,tp1:51500,tp2:52500},configuration:{preset:'GROWTH',houseMoney:'house-money/v1',personalRiskProfile:'SMART_GROWTH'},context:{...base.context,provider:'BINANCE',leverage:15,provider_contract:cryptoSpec('BINANCE')},houseMoneyFacts:{...facts,accountId:id,customerId:customer,observedAt:at},forwardHistoryEvidence:{customerId:customer,accountId:id,provider:'BINANCE',observedAt:at,verifiedDays:30,closedTradeCount:1,historyComplete:true}};
 assert.throws(()=>evaluateAccountSignal({...x,forwardHistoryEvidence:undefined}),/30_VERIFIED_DAYS/);
 const first=evaluateAccountSignal(x);assert.equal(first.authorizedRiskPct,1.5,JSON.stringify(first.reasonCodes));
 const second=evaluateAccountSignal({...x,context:{...x.context,open_positions:[{symbol:'ETHUSDT',open_risk_pct:1,notional_value:1000}],exposure:{...x.context.exposure,active_position_count:1,total_open_risk_pct:1,positions_by_symbol:{ETHUSDT:1}}}});assert.equal(second.authorizedRiskPct,.75,JSON.stringify(second.reasonCodes));
});


test('manual VIP daily slot is shared across markets and never selects a later winner after an early loss',async()=>{
 const {manualVipReplay}=await import('../../scripts/research/focused-portfolio/manual-vip-replay.ts');
 const crypto='crypto.launch-trend-pullback-48-1.5-5',gold='gold.native-momentum-15-48-2-5',at=Date.parse('2026-09-16T00:00:00Z');
 const trade=(id:string,strategy:string,symbol:string,offset:number,netR:number)=>({id,strategy,symbol,entry:at+offset,exit:at+offset+1000,netR});
 const data={coverage:[crypto,gold].map(strategy=>({strategy,start:'2026-09-16',end:'2026-10-16'})),trades:[trade('first',crypto,'BTCUSDT',1000,-1),trade('later',gold,'XAUUSD',3000,10),trade('next-day',gold,'XAUUSD',86401000,1)]};
 const result=manualVipReplay(data,{name:'test',start:'2026-09-16',days:30,crypto:true},1);assert.equal(result.entries,2);assert.equal(result.closed,2);assert.ok(Math.abs(result.returnPct+.01)<1e-8);
});
