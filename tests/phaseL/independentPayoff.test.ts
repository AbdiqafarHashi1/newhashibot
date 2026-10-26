import assert from 'node:assert/strict';
import {evaluateReplayOutcome,type ReplayFillAssumptions} from '../../supabase/functions/_shared/replay-outcomes.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
const base=Date.parse('2025-01-01T00:00:00Z'),at=(i:number)=>new Date(base+i*900000).toISOString();
const path=[{open:100,high:100.8,low:99.6,close:100.7},{open:100.8,high:101.2,low:100.7,close:101.1},{open:101.1,high:102.2,low:101,close:102}];
let checked=0;
for(const side of ['buy','sell'] as const)for(const fraction of [0,.25,.5,.75,1]){
 const sign=side==='buy'?1:-1,candidate={id:`oracle:${side}:${fraction}`,strategyId:'test.oracle',strategyVersion:'1',symbol:'TEST',timeframe:'15m',market:'forex',side,entry:100,stop:100-sign,targets:[100+sign,100+2*sign],confidence:90,grade:'A',score:.9,riskReward:2,expiry:at(10),fresh:true,lifecycle:'ENABLED',publicationMode:'LIVE',evidence:{},rejectionReasons:[]} as ArbitrationCandidate;
 const bars=path.map((b,i)=>({symbol:'TEST',market_type:'forex',timeframe:'15m',source:'INDEPENDENT_ARITHMETIC_FIXTURE',open_time:at(i),open:100+sign*(b.open-100),close:100+sign*(b.close-100),high:sign===1?b.high:200-b.low,low:sign===1?b.low:200-b.high}));
 const a:ReplayFillAssumptions={entryTiming:'NEXT_OPEN',feeBps:10,spreadBps:2,slippageBps:4,fundingBps:2,partialExitPct:fraction,moveStopToBreakevenAfterTp1:true,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',closeAtHorizon:true,maxBarsInTrade:3};
 const finish=evaluateReplayOutcome(candidate,bars as never,at(0),a)!;
 // Independent cash quantities: sold fraction earns $1/unit, remainder $2/unit; $0.18 total cost.
 assert.ok(Math.abs(finish.netR!-(fraction*1+(1-fraction)*2-.18))<1e-10);assert.equal(finish.status,'TARGET');checked++;
 const truncated=evaluateReplayOutcome(candidate,bars.slice(0,1) as never,at(0),a)!;assert.equal(truncated.status,'OPEN');assert.equal(truncated.netR,null);assert.equal(truncated.exitTime,null);checked++;
 const short=evaluateReplayOutcome(candidate,bars.slice(0,2) as never,at(0),a)!;
 if(fraction===1){assert.equal(short.status,'TARGET');assert.ok(Math.abs(short.netR!-.82)<1e-10);assert.equal(short.exitTime,at(1));}
 else{assert.equal(short.status,'OPEN');assert.equal(short.netR,null);}checked++;
 const timed=evaluateReplayOutcome(candidate,bars.slice(0,2) as never,at(0),{...a,maxBarsInTrade:2})!;
 assert.ok(Math.abs(timed.netR!-(fraction+(1-fraction)*1.1-.18))<1e-10);assert.equal(timed.status,fraction===1?'TARGET':'TIMEOUT');checked++;
 assert.ok(Math.abs(finish.cashFlowEvents.reduce((n,e)=>n+e.realizedR,0)-finish.netR!)<1e-10);checked++;
}
console.log(`Independent payoff oracle: ${checked} buy/sell quantity, cost, full-TP1 and incomplete-horizon checks passed.`);
