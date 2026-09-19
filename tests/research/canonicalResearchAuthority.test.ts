import assert from "node:assert/strict";
import { assessDatasetCertification, assertCertifiableDatasets, buildStrategyParityMatrix } from "../../src/lib/research/canonicalResearchAuthority.ts";
import type { HistoricalDataset, HistoricalProvider } from "../../src/lib/historicalData/types.ts";

function dataset(provider:HistoricalProvider="BINANCE", overrides:Record<string,unknown>={}):HistoricalDataset {
  const now=Date.now()-3_600_000;
  const bars=Array.from({length:60},(_,i)=>({timestamp:now-(60-i)*900_000,open:100,high:102,low:99,close:101,volume:10}));
  return {bars,metadata:{provider,symbol:"BTCUSDT",sourceSymbol:"BTCUSDT",timeframe:"15m",from:bars[0].timestamp,to:now,includeOpenCandle:false,datasetKey:"BINANCE:BTCUSDT:15m",requestedRange:{from:bars[0].timestamp,to:now},actualCoverage:{ranges:[],from:bars[0].timestamp,to:bars.at(-1)!.timestamp,barCount:60},barCount:60,timezone:"UTC",lastSync:new Date(now).toISOString(),quality:{duplicates:0,invalidBars:0,outOfOrder:0,missingRanges:[],staleFinalBar:false,score:100,classification:"CERTIFICATION",expectedClosures:60,unknownSessionIntervals:0},datasetVersion:1,dataHash:"fnv1a32:test",provenance:{provider,sourceSymbol:"BTCUSDT",native:true},...overrides}} as HistoricalDataset;
}
const eligible=dataset();
assert.equal(assessDatasetCertification(eligible).status,"ELIGIBLE");
assert.doesNotThrow(()=>assertCertifiableDatasets([eligible]));
assert.equal(assessDatasetCertification(dataset("PUBLIC_RESEARCH")).status,"INVALID_DATA");
assert.throws(()=>assertCertifiableDatasets([]),/INSUFFICIENT_REAL_DATA/);
assert.throws(()=>assertCertifiableDatasets([dataset("BINANCE",{provenance:{provider:"BINANCE",sourceSymbol:"BTCUSDT",native:false}})]),/UNVERIFIED_PROVENANCE/);
const parity=buildStrategyParityMatrix();
assert.equal(parity.find(x=>x.strategyId==="forex.london-breakout")?.status,"CANONICAL");
assert.equal(parity.find(x=>x.strategyId==="crypto.micro-scalper")?.status,"LEGACY_SCANNER_ONLY");
assert.equal(parity.find(x=>x.strategyId==="crypto.reversal-exhaustion")?.status,"RESEARCH_ONLY");
console.log("canonical research authority tests passed");

import { acquireDatasetCampaign, assertModeUsesCampaign, buildBatchRequests } from "../../src/lib/research/datasetCampaign.ts";
import { prepareScannerPromotion } from "../../src/lib/research/scannerPromotion.ts";
const batch={name:"CRYPTO_90D_V1",market:"CRYPTO" as const,provider:"BINANCE" as const,symbols:["BTCUSDT","ETHUSDT"],timeframes:["15m","1h"] as const,from:1,to:100000000};
const requests=buildBatchRequests(batch);
assert.equal(requests.length,4);
assert.deepEqual([...new Set(requests.map(x=>x.symbol))],["BTCUSDT","ETHUSDT"]);
assert.deepEqual([...new Set(requests.map(x=>x.timeframe))],["15m","1h"]);
assert.throws(()=>buildBatchRequests({...batch,symbols:[]}),/EXPLICIT_SYMBOLS_REQUIRED/);
assert.throws(()=>buildBatchRequests({...batch,timeframes:[]}),/EXPLICIT_TIMEFRAMES_REQUIRED/);
assert.throws(()=>buildBatchRequests({...batch,market:"FOREX",provider:"BINANCE"}),/PROVIDER_MARKET_MISMATCH/);
assert.throws(()=>buildBatchRequests({...batch,market:"FOREX",provider:"MT5_BRIDGE"}),/MT5_CONNECTION_REQUIRED/);
const fakeService={get:async(request:{provider:HistoricalProvider;symbol:string;timeframe:string;from:number;to:number})=>dataset(request.provider,{symbol:request.symbol,sourceSymbol:request.symbol,timeframe:request.timeframe,from:request.from,to:request.to,datasetKey:`${request.provider}|${request.symbol}|${request.timeframe}`,requestedRange:{from:request.from,to:request.to},provenance:{provider:request.provider,sourceSymbol:request.symbol,native:true}})};
const campaign=await acquireDatasetCampaign(fakeService as never,batch);
assert.equal(campaign.inventory.length,4);
assert.equal(campaign.quality,"CERTIFIABLE");
assert.equal(campaign.requestedRange.from,batch.from);
assert.equal(campaign.requestedRange.to,batch.to);
assert.ok(campaign.hash.startsWith("campaign_"));
assert.doesNotThrow(()=>assertModeUsesCampaign(campaign.inventory.map(x=>x.datasetId),campaign));
assert.throws(()=>assertModeUsesCampaign([campaign.inventory[0].datasetId],campaign),/LINEAGE_MISMATCH/);
const frozen={strategyId:"crypto.trend-pullback",strategyVersion:"1",configId:"c",configVersion:"1",configHash:"h",parameters:{stopAtr:1.5},supportedSymbols:["BTCUSDT"],supportedTimeframes:["15m"],qualifiedSetVersion:"set-1",qualificationEvidenceId:"q-1",frozen:true as const};
assert.deepEqual(prepareScannerPromotion(frozen,true).blockers,["SCANNER_PROMOTION_BACKEND_NOT_IMPLEMENTED"]);
