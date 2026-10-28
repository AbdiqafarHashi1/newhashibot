import assert from 'node:assert/strict';
import {observeReplayPosition,REPLAY_LIFECYCLE_VERSION} from '../../supabase/functions/_shared/scanner-replay-lifecycle.ts';
import {replayScannerChronologically,type ReplayResumeState} from '../../supabase/functions/_shared/phase-m-validation.ts';
import {runMultiDatasetScannerReplay} from '../../supabase/functions/_shared/multi-dataset-scanner-replay.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
const base=Date.parse('2025-01-01T00:00:00Z'),width=900000,stamp=(i:number)=>new Date(base+i*width).toISOString();
const candidate:ArbitrationCandidate={id:'a',strategyId:'crypto.swing-continuation',strategyVersion:'1.0.0',market:'crypto',symbol:'BTCUSDT',timeframe:'15m',side:'buy',confidence:80,grade:'A',score:.8,entry:100,stop:98,targets:[104],riskReward:2,expiry:stamp(20),fresh:true,lifecycle:'ENABLED',publicationMode:'LIVE',evidence:{},rejectionReasons:[]};
const assumptions={entryTiming:'NEXT_OPEN' as const,feeBps:10,spreadBps:2,slippageBps:4,fundingBps:4.5,partialExitPct:0,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST' as const,maxBarsInTrade:20,closeAtHorizon:true};
const path=[{symbol:'BTCUSDT',market_type:'crypto',timeframe:'15m',source:'INJECTED',open_time:stamp(1),open:100,high:105,low:99,close:104}];
const tracked={candidate,decisionAt:stamp(1),datasetId:'d',assumptions};
assert.equal(observeReplayPosition(tracked,path,stamp(1)),null,'an open candle cannot release a lock');
assert.equal(observeReplayPosition(tracked,path,new Date(base+2*width-1).toISOString()),null);
const observed=observeReplayPosition(tracked,path,stamp(2))!;assert.equal(observed.result.status,'TARGET');assert.equal(observed.knownAt,stamp(2));
assert.equal(observeReplayPosition(tracked,[{...path[0],open_time:stamp(2)}],stamp(3)),null,'missing entry history cannot be silently skipped');
const events=[1,2,3].map(i=>({symbol:'BTCUSDT',timeframe:'15m',closedAt:stamp(i),contentHash:String(i),payload:i}));let calls=0;
const selections=await replayScannerChronologically({events,cooldownMs:0,beforeEvent:event=>observeReplayPosition(tracked,path,event.closedAt)?['BTCUSDT']:[],evaluate:event=>{calls++;return{decision:'SIGNAL',signalId:`s${event.payload}`,expiresAt:stamp(20),reasons:[]}}});assert.equal(calls,3);assert.equal(selections.length,3);
const cooling=await replayScannerChronologically({events,cooldownMs:width*10,beforeEvent:event=>observeReplayPosition(tracked,path,event.closedAt)?['BTCUSDT']:[],evaluate:()=>({decision:'SIGNAL',signalId:'s',expiresAt:stamp(20),reasons:[]})});assert.equal(cooling[1].selection.reasons[0],'SCANNER_COOLDOWN','a closed position does not bypass cooldown');

// Complete shared pipeline: same production evaluator, frozen inputs, different lifetime policy.
const candles=Array.from({length:300},(_,i)=>({symbol:'BTCUSDT',market_type:'crypto' as const,timeframe:'15m',source:'LIFECYCLE_FIXTURE',open_time:stamp(i),open:100+i*.3,high:101+i*.3,low:99+i*.3,close:100.2+i*.3,volume:100}));
const configuration={version:'lifecycle-fixture',minSignalGrade:'B',strategies:[{id:'crypto.swing-continuation',version:'1.0.0',enabled:true,minScore:0,minRiskReward:0,maxBarsInTrade:40,symbols:['BTCUSDT'],timeframes:['15m'],parameters:{}}]};
let checkpoint:ReplayResumeState|undefined;
const run=(rows:typeof candles,start:string,end:string,resume?:ReplayResumeState,enabled=true)=>runMultiDatasetScannerReplay({runId:'same',datasets:[{id:'d',hash:'source',configurationHash:'cfg',source:'INJECTED',symbol:'BTCUSDT',market:'crypto',timeframe:'15m',candles:rows}],configuration,configurationHash:'cfg',start,end,cooldownMs:0,maxCycles:1000,...(enabled?{lifecycleAssumptions:{...assumptions,maxBarsInTrade:40}}:{}),resume,onEvidence:async(_r,s)=>{checkpoint=s}});
const full=await run(candles,stamp(0),stamp(300));assert.equal(checkpoint!.lifecycleVersion,REPLAY_LIFECYCLE_VERSION);const legacy=await run(candles,stamp(0),stamp(300),undefined,false);
assert.ok(full.filter(x=>x.selection.decision==='SIGNAL').length>legacy.filter(x=>x.selection.decision==='SIGNAL').length,'a known early target must make subsequent setups eligible');
const first=await run(candles.slice(0,150),stamp(0),stamp(150)),saved=structuredClone(checkpoint!);const second=await run(candles.slice(40),new Date(base+150*width+1).toISOString(),stamp(300),{...saved,cursor:0});assert.deepEqual([...first,...second],full,'causal lock release survives batch/restart');
const changed=candles.map((c,i)=>i>=200?{...c,open:500+i,close:500.2+i,high:501+i,low:499+i}:c),future=await run(changed,stamp(0),stamp(300));assert.deepEqual(future.filter(x=>x.event.closedAt<stamp(201)),full.filter(x=>x.event.closedAt<stamp(201)),'future bars cannot alter earlier qualification, release or selection');
await assert.rejects(()=>run(candles,stamp(0),stamp(300),{cursor:1,active:[],lastSignal:[]}),/REQUIRES_NEW_RUN/);
console.log('Participation lifecycle: closed-bar-only release, gap hold, cooldown, real evaluator re-entry, checkpoint restart and future-prefix invariance passed; no publishing or orders.');
