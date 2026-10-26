/** Genuine-file acceptance of the Lab's registration/store/scanner path. No production database access. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {openLabDatabase} from '../../tests/release1/support/labDatabase.ts';
import {importNativeDataset} from '../../src/lib/historicalData/nativeImport.ts';
import {registerHistoricalDataset} from '../../src/lib/historicalData/registerDataset.ts';
import {handleDatasetUpload,loadValidationDataset,normalizeUploadBars} from '../../supabase/functions/_shared/validation-dataset-upload.ts';
import {hashValidationDataset} from '../../supabase/functions/_shared/validation-dataset-integrity.ts';
import {runMultiDatasetScannerReplay} from '../../supabase/functions/_shared/multi-dataset-scanner-replay.ts';
import {FOREX_STRATEGY_CONTRACTS} from '../../supabase/functions/_shared/forex-runtime-contracts.ts';
import {DEFAULT_REPLAY_ASSUMPTIONS,evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
import {registerResearchModel} from '../../supabase/functions/_shared/research-model-snapshots.ts';
import {preparePortableSubmission} from '../../supabase/functions/_shared/phase-p-submission.ts';
import {costAwareFeatures,predictUtility} from '../../supabase/functions/_shared/cost-aware-opportunities.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const [cryptoRoot,forexRoot,output]=process.argv.slice(2);if(!cryptoRoot||!forexRoot||!output)throw Error('Usage: lab-acceptance.ts <crypto-native-root> <paired-forex-root> <output.json>');
const sha=(v:string)=>createHash('sha256').update(v).digest('hex'),actor='11111111-1111-4111-8111-111111111111',{pg,db}=await openLabDatabase();
const samples=[],blocked:Record<string,string>={},results=[],frozenModelAcceptance=[],cryptoIds=['crypto.micro-scalper','crypto.quick-scalp','crypto.compression-breakout','crypto.swing-continuation'];
try{
 await pg.query('insert into profiles values($1,\'admin\')',[actor]);
 for(const symbol of ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT']){
  const name=`${symbol}-15m-2025-01.json`,raw=await readFile(`${cryptoRoot}/${name}`,'utf8'),manifest=JSON.parse(await readFile(`${cryptoRoot}/${name.replace('.json','.manifest.json')}`,'utf8'));assert.equal(sha(raw),manifest.datasetSha256);
  samples.push({symbol,market:'crypto' as const,timeframe:'15m',raw,sourceFile:name,sourceHash:sha(raw),sourceManifest:manifest});
 }
 const coverage=JSON.parse(await readFile(`${forexRoot}/coverage.json`,'utf8'));
 for(const symbol of ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD']){
  const name=`${symbol}-1h.json`,raw=await readFile(`${forexRoot}/${name}`,'utf8'),manifest=JSON.parse(await readFile(`${forexRoot}/${symbol}-1h.manifest.json`,'utf8'));assert.equal(sha(raw),manifest.datasetSha256);const all:StrategyCandle[]=JSON.parse(raw);
  // Availability-only segment selection, never selected by returns. No fabricated weekend bars.
  let longest:StrategyCandle[]=[],current:StrategyCandle[]=[];for(const c of all){if(current.length&&Date.parse(c.open_time)-Date.parse(current.at(-1)!.open_time)!==3600000)current=[];current.push(c);if(current.length>longest.length)longest=[...current];}
  if(longest.length<110){blocked[symbol]='INSUFFICIENT_CONTIGUOUS_NATIVE_HOURLY_DATA';continue;}
  samples.push({symbol,market:'forex' as const,timeframe:'1h',raw:JSON.stringify(longest),sourceFile:name,sourceHash:sha(raw),sourceManifest:manifest});
 }
 for(const sample of samples){
  const imported=importNativeDataset(sample.raw),stored=await registerHistoricalDataset(imported as unknown as {metadata:Record<string,unknown>;bars:unknown[]},body=>handleDatasetUpload(db,actor,body));if(stored.status!=='READY')throw Error(`ACCEPTANCE_SOURCE_NOT_COMPLETE:${sample.symbol}`);
  const direct=normalizeUploadBars(imported.metadata as unknown as Record<string,unknown>,imported.bars as unknown as Record<string,unknown>[]),restored=await loadValidationDataset(db,stored.datasetId);assert.equal(await hashValidationDataset(direct),await hashValidationDataset(restored));
  const ids=sample.market==='crypto'?cryptoIds:FOREX_STRATEGY_CONTRACTS.filter(c=>c.symbols.includes(sample.symbol)&&c.primaryTimeframes.includes('1h')).map(c=>c.id),width=sample.market==='crypto'?900000:3600000;
  const strategies=ids.map(id=>({id,version:'1.0.0',enabled:true,minScore:id.endsWith('quick-scalp')?82:id==='crypto.micro-scalper'?72:sample.market==='forex'?78:75,minRiskReward:id.endsWith('quick-scalp')?1.15:id==='crypto.micro-scalper'?1.2:sample.market==='forex'?1.4:1.2,maxBarsInTrade:id==='crypto.swing-continuation'?96:id.endsWith('quick-scalp')?12:id==='crypto.micro-scalper'?24:48,minStopDistancePct:sample.market==='crypto'?.18:.08,minTp1DistancePct:sample.market==='crypto'?.25:.10,minTp2DistancePct:sample.market==='crypto'?.40:.16,symbols:[sample.symbol],timeframes:[sample.timeframe],parameters:{}}));
  for(const subset of [...strategies.map(s=>[s]),strategies]){
   const configuration={version:'REPOSITORY_DEFAULTS_CANDIDATE_ACCEPTANCE_NOT_LIVE_APPROVAL',minSignalGrade:'A',strategies:subset},configurationHash=sha(JSON.stringify(configuration)),endIndex=Math.min(restored.length-1,620),startIndex=Math.min(220,Math.max(55,restored.length-50)),start=new Date(Date.parse(restored[startIndex].open_time)+width).toISOString(),end=new Date(Date.parse(restored[endIndex].open_time)).toISOString();
   if(start>=end){blocked[`${sample.symbol}:${subset.map(s=>s.id).join('+')}`]='ACCEPTANCE_WINDOW_TOO_SHORT';continue;}
   const replay=(candles:StrategyCandle[])=>runMultiDatasetScannerReplay({runId:`acceptance:${sample.symbol}`,datasets:[{id:stored.datasetId,hash:stored.datasetHash,configurationHash,source:sample.sourceFile,symbol:sample.symbol,market:sample.market,timeframe:sample.timeframe,candles}],configuration,configurationHash,start,end,cooldownMs:0,maxCycles:500});
   const a=await replay(direct),b=await replay(restored);assert.deepEqual(a,b);const outcomes:ReplayOutcome[]=[];
   for(const row of a){const winner=(row.selection.cycle?.arbitration as {winner?:Parameters<typeof evaluateReplayOutcome>[0]})?.winner;if(!winner)continue;
    const assumption={...DEFAULT_REPLAY_ASSUMPTIONS,feeBps:sample.market==='crypto'?10:.7,spreadBps:sample.market==='crypto'?2:(restored.find(c=>Date.parse(c.open_time)+width===Date.parse(row.event.closedAt))!.ask_close!-restored.find(c=>Date.parse(c.open_time)+width===Date.parse(row.event.closedAt))!.close)/restored.find(c=>Date.parse(c.open_time)+width===Date.parse(row.event.closedAt))!.close*10000,slippageBps:sample.market==='crypto'?4:.3,fundingBps:sample.market==='crypto'?4.5:.3,maxBarsInTrade:subset.find(s=>s.id===winner.strategyId)!.maxBarsInTrade};
    const path=(candles:StrategyCandle[])=>evaluateReplayOutcome(winner,candles.filter(c=>Date.parse(c.open_time)<Date.parse(end)),row.event.closedAt,assumption),before=path(direct),after=path(restored);assert.deepEqual(before,after);if(after)outcomes.push(after);
   }
   results.push({symbol:sample.symbol,market:sample.market,strategyIds:subset.map(s=>s.id),configuration,configurationHash,datasetHash:stored.datasetHash,sourceFile:sample.sourceFile,sourceHash:sample.sourceHash,sourceManifest:sample.sourceManifest,storedRows:restored.length,period:{start,end},cycles:a.length,parity:'PASS',classification:'GENUINE_FILE_PIPELINE_ACCEPTANCE_NOT_STRATEGY_CERTIFICATION',metrics:summarizeReplayOutcomes(outcomes),outcomes});
   console.log(JSON.stringify({symbol:sample.symbol,strategies:subset.map(s=>s.id),cycles:a.length,outcomes:outcomes.length,parity:'PASS'}));
  }
 }
 blocked['forex.micro-scalper']='NATIVE_15M_FOREX_DATA_NOT_AVAILABLE';blocked['forex.london-breakout']='NATIVE_15M_FOREX_DATA_NOT_AVAILABLE';blocked['gold.volatility-breakout']='NATIVE_GOLD_HISTORY_NOT_AVAILABLE';
 for(const market of ['crypto','forex'] as const){
  const report=JSON.parse(await readFile(`docs/research/cost-aware/${market}-development.json`,'utf8')),expected=report.trials.flatMap((t:{evidence:any[]})=>t.evidence)[0],forecast=expected.forecast,model=report.models.find((m:{id:string})=>m.id===forecast.modelId),width=market==='crypto'?900000:3600000;
  const name=market==='crypto'?`${forecast.symbol}-15m-${forecast.at.slice(0,7)}.json`:`${forecast.symbol}-1h.json`,raw=await readFile(`${market==='crypto'?cryptoRoot:forexRoot}/${name}`,'utf8');
  const source=report.sources.find((s:{file:string})=>s.file===name);assert.equal(sha(raw),source.datasetSha256);
  const rows:StrategyCandle[]=JSON.parse(raw),i=rows.findIndex(c=>Date.parse(c.open_time)+width===Date.parse(forecast.at));if(i<109)throw Error('MODEL_ACCEPTANCE_REQUIRES_PREVIOUS_MONTH_WARMUP');
  const segment=rows.slice(i-109,i+33),imported=importNativeDataset(JSON.stringify(segment)),stored=await registerHistoricalDataset(imported as unknown as {metadata:Record<string,unknown>;bars:unknown[]},body=>handleDatasetUpload(db,actor,body));assert.equal(stored.status,'READY');
  const registered=await registerResearchModel(db,actor,model),end=new Date(Date.parse(forecast.at)+32*width).toISOString(),submission=await preparePortableSubmission(db,actor,{kind:'REPLAY',idempotencyKey:`model-acceptance-${market}`,researchModelId:registered.id,datasetIds:[stored.datasetId],start:forecast.at,end,maxCycles:100,fees:0,spread:0,slippage:0,funding:0}),payload=submission.p_payload,loaded=await loadValidationDataset(db,stored.datasetId),history=loaded.slice(0,110),features=costAwareFeatures({symbol:forecast.symbol,market,timeframe:market==='crypto'?'15m':'1h',candles:history,evaluated_at:forecast.at},model.parameters.estimated_cost_bps),prediction=predictUtility(features.values,model.parameters);
  assert.ok(Math.abs(prediction.longNetR-forecast.longNetR)<1e-8&&Math.abs(prediction.shortNetR-forecast.shortNetR)<1e-8);
  const replay=await runMultiDatasetScannerReplay({runId:`frozen-model:${market}`,datasets:[{id:stored.datasetId,hash:stored.datasetHash,configurationHash:submission.p_hash,source:name,symbol:forecast.symbol,market,timeframe:market==='crypto'?'15m':'1h',candles:loaded}],configuration:payload.configuration,configurationHash:submission.p_hash,start:forecast.at,end,cooldownMs:0,maxCycles:100}),cycle=replay.find(r=>r.event.closedAt===forecast.at)!.selection.cycle!,winner=(cycle.arbitration as any).winner;assert.ok(winner);
  const assumptions={...payload.assumptions};if(market==='forex')assumptions.spreadBps+=(history.at(-1)!.ask_close!-history.at(-1)!.close)/history.at(-1)!.close*10000;
  const outcome=evaluateReplayOutcome(winner,loaded,forecast.at,assumptions)!;assert.ok(Math.abs(outcome.netR!-expected.outcome.netR)<1e-9);
  frozenModelAcceptance.push({market,strategyId:winner.strategyId,sourceFile:name,sourceHash:sha(raw),datasetHash:stored.datasetHash,modelId:model.id,configurationHash:submission.p_hash,forecastAt:forecast.at,prediction,outcome,expectedNetR:expected.outcome.netR,researchOnly:true,parity:'PASS',wholeStudyPolicyEquivalent:false,policyDisclosure:'Matches this stored forecast and its accounting. Full scanner cooldown/active-signal selection is separate from the older diagnostic study one-active-position selection.'});
  console.log(JSON.stringify({market,frozenModelForecastAndOutcomeParity:'PASS',netR:outcome.netR,researchOnly:true}));
 }
 const codeFiles=['supabase/functions/_shared/native-candle-evidence.ts','supabase/functions/_shared/validation-dataset-integrity.ts','supabase/functions/_shared/validation-dataset-upload.ts','supabase/functions/_shared/research-model-snapshots.ts','supabase/functions/_shared/phase-p-submission.ts','supabase/functions/_shared/phase-p-contract.ts','supabase/functions/_shared/multi-dataset-scanner-replay.ts','supabase/functions/_shared/active-validation-runtime.ts','supabase/functions/_shared/cost-aware-opportunities.ts','supabase/functions/_shared/replay-outcomes.ts','src/lib/historicalData/nativeImport.ts','src/lib/historicalData/registerDataset.ts','tests/release1/support/labDatabase.ts','scripts/research/lab-acceptance.ts','supabase/migrations/20261025233617_validation_native_evidence_upload.sql'],sourceHashes=Object.fromEntries(await Promise.all(codeFiles.map(async file=>[file,sha(await readFile(file,'utf8'))])));
 await mkdir(output.slice(0,output.lastIndexOf('/'))||'.',{recursive:true});await writeFile(output,JSON.stringify({schema:'lab-native-acceptance/v1',sourceHashes,generatedAt:new Date().toISOString(),backend:'Embedded PostgreSQL with actual new migration; not deployed Supabase Auth/PostgREST',sourceFilesAreMarketData:true,configurationAuthority:'Declared repository-default candidate snapshots; not deployed strategy_configs or promoted releases',costAssumptions:'Crypto 20.5 bps reserves; Forex observed current spread plus 1.3 bps reserves. No actual fills/funding measured.',forexCoverage:coverage,results,frozenModelAcceptance,blocked,publication:false,execution:false,promotion:false,verdict:'PIPELINE_ACCEPTANCE_ONLY_NO_NEW_EDGE_OR_CERTIFICATION_CLAIM'},null,2)+'\n');
}finally{await pg.close();}
