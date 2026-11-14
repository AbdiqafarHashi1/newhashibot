import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GOLD_RSI_TRAILING,GOLD_TRAILING_POLICY,nextAtrTrailingStop,validateAtrTrailingPolicy} from '../../supabase/functions/_shared/atr-trailing-policy';
import {evaluateGoldRsiTrailing,goldRsiTrailingDefinition} from '../../supabase/functions/_shared/gold-rsi-trailing';
import {createStrategyPlan} from '../../supabase/functions/_shared/strategy-plan';
import {advanceConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service';
const fixtures=JSON.parse(readFileSync('tests/operations/fixtures/goldRsiTrailing.json','utf8'));
test('native finite-window fixtures match independent EMA/RSI/ATR reference in both directions',async()=>{
 assert(fixtures.some((f:any)=>f.side===1)&&fixtures.some((f:any)=>f.side===-1));
 for(const f of fixtures){const ctx:any={symbol:'XAUUSD',market:'forex',timeframe:'15m',candles:f.rows,indicators:{},evaluated_at:f.at},r=evaluateGoldRsiTrailing(ctx);assert.equal(r.status,'candidate');assert.equal(r.direction,f.side===1?'buy':'sell');assert(Math.abs(Number(r.score_breakdown.atr14)-f.atr)<1e-8);assert(Math.abs(Number(r.score_breakdown.prior_rsi2)-f.rsi)<1e-8);assert.equal(r.tp1,r.tp2);const plan=createStrategyPlan(goldRsiTrailingDefinition(),ctx,r);assert.deepEqual(plan.management_intent.trailing_policy,GOLD_TRAILING_POLICY);
 const mutable=structuredClone(ctx);mutable.evaluated_at=new Date(Date.parse(f.at)-1).toISOString();assert.equal(evaluateGoldRsiTrailing(mutable).status,'rejected');
 }
});
test('ATR policy never loosens, never activates early, and preserves frozen identity',()=>{
 const base={side:1 as const,entry:100,initialDistance:10,bestFavorable:19.99,currentStop:90,atr:4,tick:.1};assert.equal(nextAtrTrailingStop(base),90);assert.equal(nextAtrTrailingStop({...base,bestFavorable:20}),116);assert.equal(nextAtrTrailingStop({...base,bestFavorable:20,currentStop:118}),118);assert.equal(nextAtrTrailingStop({...base,bestFavorable:20,atr:50}),105);
 assert.equal(nextAtrTrailingStop({...base,side:-1,currentStop:110,bestFavorable:20}),84);assert.equal(nextAtrTrailingStop({...base,side:-1,currentStop:82,bestFavorable:20}),82);
 assert.throws(()=>validateAtrTrailingPolicy({...GOLD_TRAILING_POLICY,triggerR:1}),/FROZEN/);assert.throws(()=>validateAtrTrailingPolicy({...GOLD_TRAILING_POLICY,extra:true}),/FROZEN/);
});
test('signal trailing uses original R and next-bar protection; missing ATR cannot fabricate results',()=>{
 const start=Date.parse('2026-05-05T09:00:00Z'),rows=Array.from({length:15},(_,i)=>({symbol:'XAUUSD',timeframe:'15m',source:'mt5_hashibridge:test',open_time:new Date(start+(i-14)*900000).toISOString(),open:100,high:102,low:98,close:100,volume:1}));
 const state:any={id:'trailing',strategy:GOLD_RSI_TRAILING,symbol:'XAUUSD',timeframe:'15m',source:'mt5_hashibridge:test',side:'buy',status:'ACTIVE',version:1,lastBar:new Date(start).toISOString(),fill:100,fillAt:new Date(start).toISOString(),stop:90,tp1:150,tp2:150,holdBars:96,bars:0,origin:{plan:{management_intent:{trailing_policy:GOLD_TRAILING_POLICY}}},cost:{price:0}};
 const bar:any={...rows[0],open_time:new Date(start+900000).toISOString(),open:100,high:125,low:99,close:120};assert.equal(advanceConditionalSetup(state,bar),state);
 const first=advanceConditionalSetup(state,bar,[...rows,bar]);assert.equal(first.status,'ACTIVE');assert(first.trailingState!.stop>100);assert.equal(first.stop,90);
 const nextBar={...bar,open_time:new Date(start+1800000).toISOString(),open:120,high:121,low:110,close:111};const second=advanceConditionalSetup(first,nextBar,[...rows,bar,nextBar]);assert.equal(second.status,'CLOSED');assert.equal(second.exit,Math.min(nextBar.open,first.trailingState!.stop));assert(Math.abs(second.netR!-(second.exit!-100)/10)<1e-8);
});
