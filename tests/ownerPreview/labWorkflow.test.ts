import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryHistoricalCache, datasetKey } from '../../src/lib/historicalData/cache';
import { hashHistoricalBars } from '../../src/lib/historicalData/HistoricalDataService';
import { restoreDatasetCampaign, LAB_STEPS } from '../../src/lib/research/labWorkflow';
import { calibrationPeriods, validateCalibrationProposal, evaluateCalibrationPeriod, calibrationStrategies } from '../../src/lib/research/labCalibration';
import { readEvidencePages } from '../../supabase/functions/_shared/validation-evidence-pages';

test('cached campaigns reopen without a provider and reject changed candles',async()=>{
 const cache=new MemoryHistoricalCache(),request={provider:'BINANCE',symbol:'BTCUSDT',timeframe:'15m',from:0,to:900000} as any,bars=[{timestamp:0,open:1,high:2,low:1,close:2},{timestamp:900000,open:2,high:3,low:2,close:3}],id=datasetKey(request),hash=hashHistoricalBars(bars),metadata={...request,datasetKey:id,barCount:2,dataHash:hash,requestedRange:{from:0,to:900000},quality:{classification:'RESEARCH'}} as any;
 await cache.putBars(request,bars,metadata);const campaign={id:'campaign',requestedRange:{from:0,to:900000},datasets:[],inventory:[{datasetId:id,datasetHash:hash,bars:2,symbol:'BTCUSDT',timeframe:'15m'}]} as any;
 const restored=await restoreDatasetCampaign(cache,campaign);assert.equal(restored.datasets.length,1);assert.equal(restored.datasets[0].bars.length,2);
 await cache.putBars(request,[{...bars[0],close:1.5}],metadata);await assert.rejects(restoreDatasetCampaign(cache,campaign),/CACHE_MISSING_OR_CHANGED/);
});
test('calibration partitions chronological candles before evaluation; risk and arbitrary model output are rejected',()=>{
 const bars=Array.from({length:500},(_,i)=>({timestamp:i})),periods=calibrationPeriods({bars} as any);assert.equal(periods.development.length,300);assert.equal(periods.validation.length,100);assert.equal(periods.holdout.length,100);assert.ok(periods.development.at(-1)!.timestamp<periods.validation[0].timestamp);assert.ok(periods.validation.at(-1)!.timestamp<periods.holdout[0].timestamp);
 assert.deepEqual(validateCalibrationProposal('forex.trend-pullback',{stopAtr:1.4}),{stopAtr:1.4});assert.throws(()=>validateCalibrationProposal('forex.trend-pullback',{riskPercent:10}),/UNAPPROVED_PARAMETER/);assert.throws(()=>validateCalibrationProposal('forex.trend-pullback',{stopAtr:99}),/UNAPPROVED_PARAMETER/);assert.throws(()=>calibrationPeriods({bars:[]} as any),/300/);
});
test('evidence inspection loads beyond default database page and refuses truncation',async()=>{
 const rows=Array.from({length:2100},(_,i)=>i),calls:number[]=[];const result=await readEvidencePages(async(offset,size)=>{calls.push(offset);return rows.slice(offset,offset+size)});assert.equal(result.length,2100);assert.deepEqual(calls,[0,1000,2000]);await assert.rejects(readEvidencePages(async()=>Array(1000).fill(1),1000),/LIMIT_EXCEEDED/);
});
test('the workflow exposes full pipeline, 100 Prop campaign, forward and calibration workspaces',()=>{
 assert.deepEqual(LAB_STEPS.map(s=>s[0]),['DATA','SINGLE','SCANNER','ACCOUNT','PROP','FORWARD','CALIBRATION','RESULTS']);
});

 test('calibration measures the existing evaluator with split-scoped evidence and rejects invalid costs',()=>{
 const bars=Array.from({length:2000},(_,i)=>({timestamp:Date.UTC(2025,0,1)+i*900000,open:100+i*.01,high:102+i*.01,low:99+i*.01,close:101+i*.01,volume:1000}));
 const strategy=calibrationStrategies().find(s=>s.id.startsWith('crypto.'))!;assert.ok(strategy);
 const dataset={bars,metadata:{datasetKey:'fixture',dataHash:'fixture-only-not-market-evidence',symbol:'BTCUSDT',timeframe:'15m',provider:'BINANCE',barCount:bars.length,quality:{classification:'RESEARCH',score:100,invalidBars:0,duplicates:0,outOfOrder:0,missingRanges:[],staleFinalBar:false,unrealisticJumps:0}}} as any;
 const costs={version:'test/v1',currency:'USD',provenance:'HISTORICAL_ESTIMATE',crypto:{liquidity:'TAKER',makerFeeRate:.0002,takerFeeRate:.0005,slippageRate:.0001,quantityStep:.000001,minimumQuantity:.000001}} as any;
 const result=evaluateCalibrationPeriod(dataset,strategy.id,strategy.defaults,'development',costs);assert.equal(result.barCount,1200);assert.equal(result.to,bars[1199].timestamp);assert.ok(Number.isFinite(result.metrics.expectancyR));assert.ok(result.runHash);
 assert.throws(()=>evaluateCalibrationPeriod(dataset,strategy.id,strategy.defaults,'development',{...costs,crypto:{...costs.crypto,takerFeeRate:-1}}),/INVALID_COST/);
});
