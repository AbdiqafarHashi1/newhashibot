import {test} from 'node:test';import assert from 'node:assert/strict';
import {HistoricalPropObserver} from '../../supabase/functions/_shared/historical-prop-observer.ts';import {PROP_PROFILES} from '../../src/lib/prop/professionalPropEngine.ts';
const start=Date.parse('2025-01-01T12:00:00Z'),evidence={calendarComplete:true,holdingRestrictionsVerified:true};
const profile=()=>structuredClone(PROP_PROFILES.CUSTOM);
const o=(at:number,balance:number,equity=balance,openPositions=0,newEntries=0)=>({at,balance,equity,openPositions,newEntries});
test('daily floating-equity failure is terminal even when balance later recovers',()=>{
 const p=profile();p.rules.dailyLossPct=5;p.rules.maxLossPct=10;const observer=new HistoricalPropObserver(p,10000,start,evidence);
 observer.observe(o(start,10000,10000,1,1));assert.equal(observer.observe(o(start+60000,10000,9499,1)).status,'FAILED');assert.equal(observer.observe(o(start+120000,11000)).status,'FAILED');
});
test('challenge → verification → funded requires flat realized targets, true trading days and separate account resets',()=>{
 const p=profile();p.phases[0].minimumTradingDays=2;const observer=new HistoricalPropObserver(p,10000,start,evidence);
 observer.observe(o(start,10000,10000,1,1));assert.equal(observer.observe(o(start+60000,11000)).status,'ACTIVE');
 const passed=observer.observe(o(start+86400000,11000,11000,0,1));assert.equal(passed.status,'AWAITING_PHASE_RESET');
 assert.throws(()=>observer.resetForNextPhase(start+86400001,passed.resetToken!,{balance:11000,equity:11000,openPositions:0}),/RESET_PROOF/);
 observer.resetForNextPhase(start+86400001,passed.resetToken!,{balance:10000,equity:10000,openPositions:0});
 const verification=observer.observe(o(start+86460000,10500,10500,0,1));assert.equal(verification.status,'AWAITING_PHASE_RESET');
 const funded=observer.resetForNextPhase(start+86460001,verification.resetToken!,{balance:10000,equity:10000,openPositions:0});assert.equal(funded.status,'FUNDED');assert(Object.values(observer.survival()).every(x=>x===null));
 assert.equal(observer.payoutEligibility(o(funded.fundedAt!+86400000,10100),100,100).eligible,false);
 const payout=observer.payoutEligibility(o(funded.fundedAt!+15*86400000,10100),100,100);assert.equal(payout.eligible,true);assert.equal(payout.amount,80);
});
test('funded survival censors insufficient horizons and never hides an early account failure; profile changes invalidate resume',()=>{
 const p=profile();p.phases=[p.phases[2]];p.rules.dailyLossPct=5;p.rules.maxLossPct=10;const observer=new HistoricalPropObserver(p,10000,start,evidence);
 observer.observe(o(start,10000));observer.observe(o(start+10*86400000,8900));assert.equal(observer.survival()[30],false);assert.equal(observer.survival()[365],false);
 const altered=profile();altered.phases=p.phases;altered.rules.maxLossPct=20;assert.throws(()=>new HistoricalPropObserver(altered,10000,start,evidence,observer.snapshot()),/REPLAY_MISMATCH/);
});
test('FTMO daily allowance remains five percent of initial capital after profitable days',()=>{const p=structuredClone(PROP_PROFILES.FTMO_TWO_STEP);const observer=new HistoricalPropObserver(p,10000,start,evidence);observer.observe(o(start,12000,12000,1,1));observer.observe(o(start+86400000,12000,12000,1));assert.equal(observer.observe(o(start+86460000,12000,11490,1)).status,'FAILED');const p2=structuredClone(p);const other=new HistoricalPropObserver(p2,10000,start,evidence);other.observe(o(start,9800,9800,1,1));other.observe(o(start+86400000,9800,9800,1));assert.notEqual(other.observe(o(start+86460000,9800,9301,1)).status,'FAILED');});

test('allocation-free cohort observations retain exactly the same equity and phase state as full snapshots',()=>{const p=profile(),a=new HistoricalPropObserver(p,10000,start,evidence),b=new HistoricalPropObserver(p,10000,start,evidence);for(const point of [o(start,10000,9950,1,1),o(start+60000,10000,10010,1),o(start+86400000,10020,10020,0)]){a.observe(point);assert.equal(b.observe(point,false),undefined);assert.deepEqual(b.snapshot(),a.snapshot());assert.equal(b.progress().status,a.snapshot().status);assert.equal(b.progress().tradingDays,a.snapshot().tradingDays.length)}});
