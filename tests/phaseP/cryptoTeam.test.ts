import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cryptoTeamFeatures,evaluateCryptoTeam,coordinatedCryptoDefinitions,coordinatedConfiguration} from '../../supabase/functions/_shared/coordinated-crypto.ts';
import {CRYPTO_TEAM_ROLES,CRYPTO_TEAM_PROFILE} from '../../supabase/functions/_shared/coordinated-crypto-contract.ts';
import {calculateActiveIndicators,createApprovedReplayRegistry} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {arbitrateActiveScanner} from '../../supabase/functions/_shared/active-scanner-core.ts';
import {cryptoTeamPolicy} from '../../supabase/functions/_shared/coordinated-crypto-policy.ts';
import {ProfessionalStrategyRegistry,type StrategyCandle,type StrategyEvaluationContext} from '../../supabase/functions/_shared/professional-strategies.ts';
import {applyScannerSelectionPolicy} from '../../supabase/functions/_shared/scanner-selection-policy.ts';
import {preparePortableSubmission} from '../../supabase/functions/_shared/phase-p-submission.ts';
import {runMultiDatasetScannerReplay} from '../../supabase/functions/_shared/multi-dataset-scanner-replay.ts';
import {parsePortableRequest} from '../../supabase/functions/_shared/phase-p-contract.ts';
import {Db} from './fixtures.ts';
const start=Date.parse('2025-01-01T00:00:00Z'),at=new Date(start+960*900000).toISOString();
function fixture(kind:'trend'|'range'|'breakout',phase=0):StrategyCandle[]{return Array.from({length:960},(_,i)=>{const h=Math.floor(i/4);let x=kind==='trend'?100+h*.2:kind==='range'?100+4*Math.sin(h*.42+phase):100;
 let open=x-.1,high=x+.2,low=x-.8,quote=1000;
 if(kind==='range'){open=x-.2;high=x+.7;low=x-.7;}
 if(kind==='trend'&&h>=236&&h<239)low=143;
 if(kind==='breakout'){high=x+(h<233?1:.2);low=x-(h<233?1:.2);}
 if(h===239){if(kind==='trend'){x=148.2;open=147.3;high=148.4;low=147;quote=2500;}else if(kind==='breakout'){x=101.4;open=100.1;high=101.6;low=99.9;quote=3000;}else{x=97.1;open=96.1;high=97.3;low=94.8;quote=2000;}}
 return{symbol:'SOLUSDT',market_type:'crypto',source:'BINANCE_USDM_KLINES',instrument_type:'USDT_PERPETUAL',timeframe:'15m',open_time:new Date(start+i*900000).toISOString(),open,high,low,close:x,volume:100,quote_volume:quote};});}
const context=(candles:StrategyCandle[]):StrategyEvaluationContext=>({symbol:'SOLUSDT',market:'crypto',timeframe:'15m',candles,indicators:calculateActiveIndicators(candles.slice(-110)),evaluated_at:at});
test('roles share one closed market state and cannot emit opposing candidates in the same context',()=>{
 for(const kind of ['trend','range','breakout']as const){const ctx=context(fixture(kind)),registry=createApprovedReplayRegistry(coordinatedConfiguration(),ctx.symbol,'15m'),results=registry.evaluate(ctx),directions=new Set(results.filter(r=>r.professional.decision!=='NO_TRADE').map(r=>r.professional.decision));assert.ok(directions.size<=1,`${kind}: ${JSON.stringify(results)}`);assert.deepEqual(new ProfessionalStrategyRegistry(coordinatedCryptoDefinitions()).evaluate(ctx),[]);}
 assert.equal(cryptoTeamFeatures(context(fixture('trend'))).state,'TREND_UP');
 const f=cryptoTeamFeatures(context(fixture('breakout')));assert.equal(f.state,'EXPANSION_UP',JSON.stringify(f));
 assert.equal(evaluateCryptoTeam('crypto.team-trend',context(fixture('breakout'))).status,'rejected');
 assert.equal(evaluateCryptoTeam('crypto.team-range',context(fixture('trend'))).status,'rejected');
});
test('future, gaps, malformed or unsupported data and arbitrary parameters fail closed',()=>{
 const rows=fixture('trend'),ctx=context(rows);for(const patch of [{candles:rows.slice(1)},{candles:rows.map((b,i)=>i===5?{...b,open_time:at}:b)},{candles:rows.map(b=>({...b,source:'BINANCE_SPOT_KLINES'}))},{strategy_parameters:{target_r:100}},{evaluated_at:new Date(Date.parse(at)+900000).toISOString()}])assert.equal(evaluateCryptoTeam('crypto.team-trend',{...ctx,...patch}).status,'rejected');
});
test('opposing close scores abstain; existing symbol locks and crypto concentration caps block new entries',()=>{
 const candidate={id:'a',strategyId:'crypto.team-trend',strategyVersion:'1.0.0',symbol:'SOLUSDT',market:'crypto' as const,timeframe:'15m',side:'buy' as const,entry:100,stop:98,targets:[106],riskReward:3,confidence:80,grade:'A',score:.8,expiry:new Date(Date.parse(at)+86400000).toISOString(),fresh:true,lifecycle:'ENABLED' as const,publicationMode:'LIVE' as const,evidence:{team_policy:'crypto-team/v1'},rejectionReasons:[]};
 const result=arbitrateActiveScanner([candidate,{...candidate,id:'b',side:'sell',stop:102,targets:[94],score:.77}],{now:new Date(at)});assert.equal(result.decision,'NO_TRADE');assert.ok(result.rejected.every(r=>r.reasons.includes('OPPOSING_SETUP_SCORES_TOO_CLOSE')));
 assert.equal(applyScannerSelectionPolicy(at,{activeSignalId:'old'},{preventDuplicateSymbolSignals:true,cooldownMs:0,maxActiveSignals:3}).allowed,false);
 assert.equal(applyScannerSelectionPolicy(at,{activeCount:3},{preventDuplicateSymbolSignals:true,cooldownMs:0,maxActiveSignals:3}).reason,'crypto_concentration_limit');
});
test('server freezes combined or individual scope; BTC is a tradable asset for the first three roles',async()=>{
 const db=new Db();db.tables.profiles=[{id:'owner',role:'admin'}];const id='00000000-0000-0000-0000-000000000001';db.tables.validation_datasets=[{id,created_by:'owner',status:'READY',row_count:1000,symbol:'BTCUSDT',timeframe:'15m',dataset_hash:'hash'}];
 const body={kind:'REPLAY',idempotencyKey:'four-team-001',researchCandidateId:CRYPTO_TEAM_PROFILE,datasetIds:[id],start:at,end:new Date(Date.parse(at)+86400000).toISOString()};
 assert.equal(parsePortableRequest(body).input.researchCandidateId,CRYPTO_TEAM_PROFILE);const prepared=await preparePortableSubmission(db,'owner',body);assert.equal(prepared.p_payload.configuration.strategies.length,4);assert.equal(prepared.p_payload.configuration.researchOnly,true);
 await assert.rejects(()=>preparePortableSubmission(db,'owner',{...body,researchCandidateId:'crypto.team-alt'}),/TRADABLE_DATASET/);
 for(const role of CRYPTO_TEAM_ROLES)assert.equal(coordinatedConfiguration(role.id).strategies.length,1);
});
test('real registry and shared policy evaluate the same team; forged regime claims cannot pass',async()=>{
 const ctx=context(fixture('trend')),registry=createApprovedReplayRegistry(coordinatedConfiguration(),ctx.symbol,'15m'),evaluations=registry.evaluate(ctx),entry=evaluations.find(e=>e.professional.decision!=='NO_TRADE');assert.ok(entry,'fixture must create an actual evaluator candidate');assert.equal(cryptoTeamPolicy([{name:entry.definition.legacyName,result:entry.professional.legacy}]),'');
 assert.notEqual(cryptoTeamPolicy([{name:entry.definition.legacyName,result:{...entry.professional.legacy,score_breakdown:{...entry.professional.legacy.score_breakdown,team_state:'RANGE'}}}]),'');
 const configuration=coordinatedConfiguration('crypto.team-trend'),rows=[...ctx.candles,...ctx.candles.slice(-8).map((b,i)=>({...b,open_time:new Date(Date.parse(at)+i*900000).toISOString()}))],reference=rows.map(b=>({...b,symbol:'BTCUSDT'}));
 const evidence=await runMultiDatasetScannerReplay({runId:'team',configuration,configurationHash:'cfg',datasets:[{id:'sol',hash:'sol-hash',configurationHash:'cfg',source:'BINANCE',symbol:'SOLUSDT',market:'crypto',timeframe:'15m',candles:rows},{id:'btc',hash:'btc-hash',configurationHash:'cfg',source:'BINANCE',symbol:'BTCUSDT',market:'crypto',timeframe:'15m',candles:reference}],start:at,end:new Date(Date.parse(at)+7200000).toISOString(),maxCycles:10,cooldownMs:0});
 assert.ok(evidence.length);assert.ok(evidence.every(r=>Date.parse(r.event.closedAt)%3600000===0));
});
test('native live adapter admits 960 closed futures bars and never falls back to spot or execution accounts',async()=>{
 const {fetchCoordinatedCryptoHistory}=await import('../../supabase/functions/_shared/coordinated-crypto-feed.ts');let calls=0;
 const fetcher:typeof fetch=async url=>{calls++;assert.match(String(url),/^https:\/\/fapi\.binance\.com\/fapi\/v1\/klines\?symbol=SOLUSDT&interval=15m&limit=961$/);return new Response(JSON.stringify(Array.from({length:961},(_,i)=>[start+i*900000,100,101,99,100,100,start+(i+1)*900000-1,10000,20,50,5000,0])),{status:200});};
 const rows=await fetchCoordinatedCryptoHistory('SOLUSDT',Date.parse(at),fetcher);assert.equal(rows.length,960);assert.equal(calls,1);assert.ok(rows.every(b=>b.instrument_type==='USDT_PERPETUAL'&&Date.parse(b.open_time)+900000<=Date.parse(at)));
 let denied=0;await assert.rejects(()=>fetchCoordinatedCryptoHistory('SOLUSDT',Date.parse(at),async()=>{denied++;return new Response('',{status:503})}),/PROVIDER_UNAVAILABLE/);assert.equal(denied,1);
});
test('measured runtime recognizes the four role identities but configuration alone cannot activate them',async()=>{
 const {measuredRuntimeConfiguration}=await import('../../supabase/functions/_shared/measured-strategy-runtime.ts'),config=coordinatedConfiguration(),definition=coordinatedCryptoDefinitions()[0],current={...definition.config,enabled:true};
 assert.equal(measuredRuntimeConfiguration(definition.legacyName,current,[],'A').enabled,false);
 const releases=[{id:'release',strategy_id:definition.id,state:'PROMOTED',immutable_configuration:{...config,researchOnly:false,strategies:config.strategies.map(s=>({...s,symbols:s.id==='crypto.team-alt'?['BNBUSDT','SOLUSDT']:['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT']}))}}],runtime=measuredRuntimeConfiguration(definition.legacyName,current,releases,'A');assert.equal(runtime.enabled,true);
 assert.equal(coordinatedCryptoDefinitions(()=>({...current,config_source:'db'}))[0].lifecycle,'DISABLED');assert.equal(coordinatedCryptoDefinitions(()=>runtime)[0].lifecycle,'ENABLED');
 const {renderCanonicalVipSignal}=await import('../../supabase/functions/_shared/telegram-product.ts'),message=renderCanonicalVipSignal({signal_id:'paper',market:'crypto',symbol:'SOLUSDT',direction:'buy',occurred_at:at,targets:[110,110],strategy:definition.legacyName});assert.match(message,/virtual outcomes are not provider fills/);assert.equal((message.match(/\*TP/g)??[]).length,1);assert.match(message,/no partial exits/);
});
test('virtual reference outcomes never turn expiry or invalid/missing levels into zero or a verified fill',async()=>{
 const {signalReferenceR}=await import('../../supabase/functions/_shared/signal-level-outcomes.ts'),levels={entry:100,stop:98,tp1:106,tp2:106,direction:'buy'};
 assert.equal(signalReferenceR(levels,'tp2_hit'),3);assert.equal(signalReferenceR(levels,'sl_hit'),-1);assert.equal(signalReferenceR(levels,'expired'),null);assert.equal(signalReferenceR({...levels,tp2:null},'tp2_hit'),null);assert.equal(signalReferenceR({...levels,stop:null},'sl_hit'),null);
 assert.equal(signalReferenceR({entry:100,stop:102,tp1:94,tp2:94,direction:'sell'},'tp2_hit'),3);
});
test('private forward book checkpoints before projection, recovers after failure, and fills only after observation',async()=>{
 const {executeShadowWorker}=await import('../../supabase/functions/_shared/phase-l-shadow-worker.ts'),{prepareCoordinatedShadow}=await import('../../supabase/functions/_shared/coordinated-crypto-shadow.ts');
 const approved=await prepareCoordinatedShadow({researchCandidateId:'crypto.team-trend',provider:'BINANCE',symbol:'SOLUSDT',timeframe:'15m'});assert.ok(approved);
 await assert.rejects(()=>prepareCoordinatedShadow({researchCandidateId:CRYPTO_TEAM_PROFILE,provider:'BYBIT',symbol:'SOLUSDT',timeframe:'15m'}),/SOURCE_INVALID/);
 type Checkpoint=import('../../supabase/functions/_shared/shadow-observer.ts').ShadowCheckpoint;let checkpoint:Checkpoint={lastClosedAt:null,cycles:[]},fail=true;const rows:Record<string,unknown>[]=[],states:Record<string,unknown>[]=[];
 const store={load:async()=>structuredClone(checkpoint),save:async(_id:string,value:Checkpoint)=>{checkpoint=structuredClone(value)},append:async(_id:string,row:Record<string,unknown>)=>{if(fail){fail=false;throw Error('INJECTED_EVIDENCE_PROJECTION_FAILURE')}if(!rows.some(r=>r.cycle_key===row.cycle_key))rows.push(structuredClone(row));},cancelled:async()=>false,updateRun:async(_id:string,value:Record<string,unknown>)=>{states.push(value)}};
 const initial=fixture('trend'),reference=initial.map(b=>({...b,symbol:'BTCUSDT'})),snapshot={source:'BINANCE_USDM_KLINES',provenance:'TEST_INJECTED_HTTP',symbol:'SOLUSDT',market:'crypto' as const,timeframe:'15m',candles:initial,referenceCandles:reference,closedAt:at,observedAt:new Date(Date.parse(at)+1000).toISOString()};
 const execute=(snapshots:import('../../supabase/functions/_shared/shadow-observer.ts').ShadowSnapshot[])=>executeShadowWorker({runId:'paper',configuration:approved.configuration,configurationHash:approved.hash,adapter:{observe:async()=>snapshots},store,maxCycles:5,maxRequests:2,maxDurationMs:10000});
 await assert.rejects(()=>execute([snapshot]),/INJECTED/);assert.ok(checkpoint.pendingCycle);assert.equal(checkpoint.paperPositions?.length,1);assert.equal(checkpoint.paperPositions![0].entryAfter,new Date(Date.parse(at)+900000).toISOString());
 await execute([]);assert.equal(rows.length,1);assert.equal(checkpoint.pendingCycle,undefined);assert.equal(checkpoint.paperPositions?.length,1);
 const future=Array.from({length:4},(_,i)=>({...initial.at(-1)!,open_time:new Date(Date.parse(at)+i*900000).toISOString(),open:148.2,high:i===1?200:148.5,low:148,close:148.2})),later=[...initial,...future].slice(-960),next={...snapshot,candles:later,referenceCandles:later.map(b=>({...b,symbol:'BTCUSDT'})),closedAt:new Date(Date.parse(at)+3600000).toISOString(),observedAt:new Date(Date.parse(at)+3601000).toISOString()};
 await execute([next]);assert.equal(checkpoint.paperClosedCount,1);assert.equal(checkpoint.paperPositions?.length,0);assert.ok(Number.isFinite(checkpoint.paperNetR));
 const arbitration=rows[1].arbitration as {evidence:{paper_outcomes:{entryTime:string;netR:number;cashFlowEvents:{realizedR:number}[]}[];provider_fills:boolean}};assert.equal(arbitration.evidence.provider_fills,false);const outcome=arbitration.evidence.paper_outcomes[0];assert.equal(outcome.entryTime,new Date(Date.parse(at)+900000).toISOString());assert.ok(Math.abs(outcome.cashFlowEvents.reduce((n,e)=>n+e.realizedR,0)-outcome.netR)<1e-10);
 assert.ok(rows.every(r=>r.publication===false&&r.telegram===false&&r.execution===false));assert.equal(states.at(-1)?.status,'RUNNING');
});
test('forward adapter uses native endTime at the closed hour and does not backfill already-observed signals',async()=>{
 const {CoordinatedCryptoShadowAdapter}=await import('../../supabase/functions/_shared/coordinated-crypto-shadow.ts');let calls=0;const fetcher:typeof fetch=async url=>{calls++;const parsed=new URL(String(url));assert.equal(parsed.origin,'https://fapi.binance.com');assert.equal(parsed.searchParams.get('endTime'),String(Date.parse(at)-1));return new Response(JSON.stringify(fixture('trend').map((c,i)=>[Date.parse(c.open_time),c.open,c.high,c.low,c.close,c.volume,start+(i+1)*900000-1,c.quote_volume,20,50,500,0])),{status:200});};
 const adapter=new CoordinatedCryptoShadowAdapter('SOLUSDT',fetcher,()=>Date.parse(at)+50000),signal=new AbortController().signal,rows=await adapter.observe({after:null,maxRequests:2,signal});assert.equal(calls,2);assert.equal(rows.length,1);assert.equal(rows[0].closedAt,at);assert.equal(rows[0].referenceCandles?.length,960);assert.equal(rows[0].observedAt,new Date(Date.parse(at)+50000).toISOString());assert.deepEqual(await adapter.observe({after:at,maxRequests:2,signal}),[]);assert.equal(calls,2);
});
