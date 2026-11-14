import {test} from 'node:test';import assert from 'node:assert/strict';
import {replayPropCohort} from '../../supabase/functions/_shared/historical-prop-campaign.ts';
import type {ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {ftmoSwingAccountRules,FTMO_SWING_PROGRAM} from '../../supabase/functions/_shared/prop-program.ts';
import {validatePropAccountProfile} from '../../supabase/functions/_shared/prop-account-profile.ts';
import {HistoricalAccountLedger} from '../../supabase/functions/_shared/historical-account-ledger.ts';
import {historicalAccountScenario} from '../../supabase/functions/_shared/historical-account-scenario.ts';
const start=Date.parse('2025-03-03T12:00:00Z');
const spec={symbol:'EURUSD',contractSize:100000,quantityStep:.01,minimumQuantity:.01,minimumNotional:0,tickSize:.00001,leverage:30,commissionPerQuantityPerSide:3.5,feeBpsPerSide:0,spreadBps:0,slippageBps:.5,minimumStopDistance:.00001,allowShort:true,provenance:{kind:'DOCUMENTED_ASSUMPTION' as const,source:'Controlled test, not performance evidence',limitations:[]}};
function fixture(gap=false,days=24){
 const bars=new Map<number,any[]>(),signals:{at:number;setup:ConditionalSetup}[]=[];
 for(let day=0;day<days;day++){const at=start+day*86400000,setup:ConditionalSetup={id:`controlled:${day}`,symbol:'EURUSD',market:'forex',timeframe:'5m',track:'SCALP',side:'buy',strategy:'controlled-prop-test',variant:'TREND',policy:'conditional-signals/v1',source:'CONTROLLED_TEST',sourceClose:new Date(at).toISOString(),trigger:1.1,stop:1.099,tp1:1.105,tp2:1.105,expiresAt:new Date(at+60000).toISOString(),holdBars:20,score:95,reason:'Controlled test',status:'ACTIVE',version:1,lastBar:new Date(at-300000).toISOString(),fillAt:new Date(at).toISOString(),management:{partialFraction:0,breakEvenAfterTp1:false,maximumChaseR:.25},entryDecision:{schema:'entry-decision/v1',kind:'IMMEDIATE_CONFIRMED',opportunityId:`controlled:${day}`,strategyVersion:'1',evaluatedAt:new Date(at).toISOString(),dataClose:new Date(at).toISOString(),reasons:[],netRewardRisk:5,confirmation:'COMPLETE',executionEligible:false,authorizationScope:'RESEARCH'}};
  signals.push({at,setup});const row=(t:number,o:number,h:number,l:number,c:number)=>({symbol:'EURUSD',market_type:'forex',timeframe:'5m',source:'CONTROLLED_TEST',open_time:new Date(t).toISOString(),open:o,high:h,low:l,close:c,ask_open:o+.00002,ask_high:h+.00002,ask_low:l+.00002,ask_close:c+.00002,volume:1});
  bars.set(at-300000,[row(at-300000,1.1,1.101,1.0995,1.1)]);
  bars.set(at,[row(at,1.1,gap?1.101:1.106,1.0995,1.101)]);
  bars.set(at+300000,[row(at+300000,gap?1.05:1.105,1.106,gap?1.04:1.104,1.105)]);
 }
 return {capital:10000,riskPct:.5,fundedRiskPct:.25,start,end:start+days*86400000,costScale:1,phaseDelayHours:24,signals,bars,specs:[spec]};
}
test('controlled account simulation passes both phases, resets capital separately and reduces funded risk without inventing trading days',()=>{
 const r=replayPropCohort(fixture());assert.equal(r.state.status,'FUNDED',JSON.stringify(r));assert.deepEqual(r.phaseResults.map(p=>p.phase),['PHASE_1','VERIFICATION']);assert(r.phaseResults[0].end>=start+3*86400000);assert(r.state.fundedAt!>=r.phaseResults[1].end+86400000);assert.equal(r.fundedRiskPct,.25);assert.equal(r.survival[30],null);assert(r.currentAccount.closedTrades>0);
});
test('a genuine modeled gap breaches equity and stops the cohort before any later recovering entries',()=>{
 const r=replayPropCohort(fixture(true));assert.equal(r.state.status,'FAILED');assert.equal(r.currentAccount.authorizedEntries,1);assert.equal(r.state.fundedAt,null);assert(Object.values(r.survival).every(v=>v===null));
});
test('already-funded cohorts measure survival separately from challenge completion',()=>{
 const r=replayPropCohort({...fixture(),initialPhase:'FUNDED'});assert.equal(r.state.fundedAt,start);assert.equal(r.phaseResults.length,0);assert.equal(r.currentPhase,'FUNDED');assert.equal(r.survival[30],null);
});
test('only the explicit matching Swing program grants its news and holding permissions',()=>{
 const p=ftmoSwingAccountRules(10000);assert.equal(validatePropAccountProfile(p).program_id,FTMO_SWING_PROGRAM);
 for(const patch of [{program_id:'invented'},{daily_loss_cap_pct:6},{reset_timezone:'UTC'},{news_trading_allowed:false},{source_reference:'unrelated'}])assert.throws(()=>validatePropAccountProfile({...p,...patch}),/STATIC_PROP_PROGRAM_TERMS_REQUIRED/);
});
test('prop resimulation uses the same conservative daily and total high-water context as buyer accounts',()=>{
 const f=fixture(),ledger=new HistoricalAccountLedger({purpose:'HISTORICAL_RESEARCH',initialCapital:10000,timezone:'Europe/Prague',dailyLossPct:5,overallLossPct:10,drawdown:'STATIC',dailyBasis:'INITIAL_BALANCE',stopOutMarginRatio:50,propContextModel:'CONSERVATIVE_OBSERVED_HIGH_WATER'},[spec]);
 const s=f.signals[0].setup,q={symbol:'EURUSD',at:start,bid:1.1,ask:1.10002,conversion:1},t=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PROP',phase:'CHALLENGE',capital:10000,riskPct:.4,accountId:'prop:test'})(s,q,spec).context;
 const snapshot=ledger.snapshot();snapshot.balance=10500;snapshot.equity=10300;snapshot.peakEquity=11000;snapshot.dayStart=10500;snapshot.dayPeak=10600;
 const restored=new HistoricalAccountLedger({purpose:'HISTORICAL_RESEARCH',initialCapital:10000,timezone:'Europe/Prague',dailyLossPct:5,overallLossPct:10,drawdown:'STATIC',dailyBasis:'INITIAL_BALANCE',stopOutMarginRatio:50,propContextModel:'CONSERVATIVE_OBSERVED_HIGH_WATER'},[spec],snapshot),c=restored.context(t,start);
 assert.equal(c.daily_drawdown.starting_balance,10500);assert.equal(c.daily_drawdown.current_drawdown_amount,300);assert.equal(c.daily_drawdown.current_drawdown_pct,3);assert.equal(c.total_drawdown.current_drawdown_amount,700);
});

test('prop sizing reduces risk to available margin and never raises lots or leverage to force a trade',async()=>{
 const {evaluateAccountSignal}=await import('../../supabase/functions/_shared/account-policy-authority.ts');
 const f=fixture(),s=f.signals[0].setup,q={symbol:'EURUSD',at:start,bid:1.1,ask:1.10002,conversion:1};
 const input=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PROP',phase:'CHALLENGE',capital:10000,riskPct:.5,accountId:'prop:margin'})(s,q,spec);
 const result=evaluateAccountSignal(input);assert.equal(result.decision,'REDUCE');assert(result.authorizedRiskPct>0&&result.authorizedRiskPct<.5);
 const plan=result.executionIntent!.positionPlan as any;assert(plan.required_margin<=input.context.free_margin);assert(plan.expected_risk_amount<=50);assert(plan.leverage<=5);assert(result.ruleDiagnostics!.some(d=>d.ruleId==='rule_prop_margin_risk_reduction'));
 const zero=evaluateAccountSignal({...input,context:{...input.context,free_margin:0}});assert.equal(zero.decision,'BLOCK');assert.equal(zero.executionIntent,null);
});

test('verified Swing permissions remove only generic news/holding restrictions, not capital or loss limits',async()=>{
 const {evaluateAccountSignal}=await import('../../supabase/functions/_shared/account-policy-authority.ts');
 const f=fixture(),s=f.signals[0].setup,q={symbol:'EURUSD',at:start,bid:1.1,ask:1.10002,conversion:1};
 const input=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PROP',phase:'CHALLENGE',capital:10000,riskPct:.25,accountId:'prop:news'})(s,q,spec);
 const news={...input.context,news_state:{in_high_impact_news_window:true,news_event_title:'NEWS_CALENDAR_UNVERIFIED',minutes_to_news:null,minutes_after_news:null}};
 assert.equal(evaluateAccountSignal({...input,context:news}).decision,'BLOCK');
 const context={...news,prop_rules:{...news.prop_rules!,program_id:FTMO_SWING_PROGRAM,daily_loss_cap_pct:5,total_trailing_drawdown_cap_pct:10,min_trading_days:4,news_trading_allowed:true,weekend_holding_allowed:true}};
 assert(['ALLOW','REDUCE'].includes(evaluateAccountSignal({...input,context}).decision));
 assert.equal(evaluateAccountSignal({...input,context:{...context,daily_drawdown:{...context.daily_drawdown,current_drawdown_pct:5,is_violated:true}}}).decision,'LOCK');
});

test('an optional third Prop position preserves the same risk budget and leaves existing two-position defaults intact',async()=>{
 const {resolveVersionedAccountPolicy}=await import('../../supabase/functions/_shared/account-policy-authority.ts');
 const f=fixture(),s=f.signals[0].setup,q={symbol:'EURUSD',at:start,bid:1.1,ask:1.10002,conversion:1},i=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PROP',phase:'CHALLENGE',capital:10000,riskPct:.5,accountId:'prop:positions'})(s,q,spec);
 const normal=resolveVersionedAccountPolicy(i.account,i.basePolicy,i.configuration),three=resolveVersionedAccountPolicy(i.account,i.basePolicy,{...i.configuration,maxConcurrentPositions:3});
 assert.equal(normal.max_open_positions_total,2);assert.equal(three.max_open_positions_total,3);assert.equal(three.max_portfolio_risk_pct,normal.max_portfolio_risk_pct);assert.equal(three.max_portfolio_risk_pct,1.5);assert.equal(three.max_daily_drawdown_pct,normal.max_daily_drawdown_pct);
 assert.throws(()=>resolveVersionedAccountPolicy(i.account,i.basePolicy,{...i.configuration,maxConcurrentPositions:4}),/BOUND_VIOLATION/);
});

test('Prop daily reset does not turn a sub-limit cumulative loss into a permanent daily lock',()=>{const f=fixture(),s=f.signals[0].setup,q={symbol:'EURUSD',at:start,bid:1.1,ask:1.10002,conversion:1},t=historicalAccountScenario({purpose:'HISTORICAL_RESEARCH',provider:'MT5_PROP',phase:'CHALLENGE',capital:10000,riskPct:.4,accountId:'prop:reset'})(s,q,spec).context,policy={purpose:'HISTORICAL_RESEARCH' as const,initialCapital:10000,timezone:'Europe/Prague',dailyLossPct:5,overallLossPct:10,drawdown:'STATIC' as const,dailyBasis:'INITIAL_BALANCE' as const,stopOutMarginRatio:50,propContextModel:'CONSERVATIVE_OBSERVED_HIGH_WATER' as const},ledger=new HistoricalAccountLedger(policy,[spec]),snap=ledger.snapshot();Object.assign(snap,{balance:9600,equity:9600,peakEquity:10000,dayStart:9600,dayPeak:9600});const c=new HistoricalAccountLedger(policy,[spec],snap).context(t,start);assert.equal(c.daily_drawdown.current_drawdown_pct,0);assert.equal(c.total_drawdown.current_drawdown_pct,4)});

test('account strategy selection filters the shared arbitration stream without relabeling other strategies',()=>{const f=fixture(),r=replayPropCohort({...f,bundleId:'unrelated-controlled-selection',strategyIds:['different-controlled-strategy']});assert.equal(r.currentAccount.authorizedEntries,0);assert.equal(r.phaseResults.length,0);assert.equal(r.state.status,'ACTIVE')});
test('payout observation never invents eligibility or changes account decisions',()=>{const input=fixture(false,48),a=replayPropCohort(input),b=replayPropCohort({...input,inspectPayout:true});assert.deepEqual(b.currentAccount,a.currentAccount);assert.deepEqual(b.phaseResults,a.phaseResults);assert.deepEqual(b.state,a.state);const p=b.payoutAnalysis!;assert(p.firstFundedEntryAt!==null);assert(p.firstRequestCandidate);assert(p.checkpoints.some(c=>c.days===30));if(p.firstRequestCandidate){assert(p.firstRequestCandidate.daysAfterFirstTrade>=14);assert(p.firstRequestCandidate.grossProfit>=20)}assert(p.checkpoints.every(x=>x.at>=p.firstFundedEntryAt!+x.days*86400000));});
test('funded 5% cutoff closes at executable net value and stops all later entries; optional single position is supported',()=>{const r:any=replayPropCohort({...fixture(false,48),initialPhase:'FUNDED',fundedRiskPct:.5,fundedProfitTargetPct:5,maximumPositions:1});assert(r.fundedObjective.reachedAt!==null);assert.equal(r.currentAccount.openPositions,0);assert(r.currentAccount.netReturnPct>=5);assert(r.currentAccount.authorizedEntries<48);assert.equal(r.fundedObjective.positionsFlat,true)});
test('2% cutoff stops sooner than the 5% objective on the same controlled series',()=>{const i={...fixture(false,48),initialPhase:'FUNDED' as const,fundedRiskPct:.5};const a:any=replayPropCohort({...i,fundedProfitTargetPct:2}),b:any=replayPropCohort({...i,fundedProfitTargetPct:5});assert(a.fundedObjective.reachedAt<b.fundedObjective.reachedAt);assert(a.currentAccount.authorizedEntries<b.currentAccount.authorizedEntries)});
test('profit banking uses only genuine subsequent setups at lower risk and still requires all evaluation days',()=>{
 const data=fixture(false,30),study={staticBasis:true,openRiskPct:3 as const,dailyCapPct:4.5 as const,totalCapPct:9 as const,phaseBanking:true};
 const r:any=replayPropCohort({...data,riskPct:2,fundedRiskPct:1,leverageCeiling:30,historicalStudy:study,includeLedgerTrace:true});
 assert(r.bankingAudit.bankEvents>=1);assert(r.bankingAudit.reducedEntries>=1);assert.equal(r.phaseResults.length,2);assert(r.state.fundedAt>=start+7*86400000);
 for(const phase of r.phaseResults){const trades=phase.trace.trades;assert(trades.length>=4);assert(new Set(trades.map((t:any)=>new Date(t.openedAt).toISOString().slice(0,10))).size>=4);assert(trades.some((t:any)=>t.quantity<trades[0].quantity/5));assert(trades.every((t:any)=>data.signals.some(s=>s.setup.id===t.signalId)));}
});
