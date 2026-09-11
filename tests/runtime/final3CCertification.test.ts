import assert from "node:assert/strict";
import { HistoricalDataService } from "../../src/lib/historicalData/HistoricalDataService.ts";
import { MemoryHistoricalCache } from "../../src/lib/historicalData/cache.ts";
import type { HistoricalAdapter } from "../../src/lib/historicalData/adapters.ts";
import { certifyProvider } from "../../supabase/functions/_shared/provider-certification.ts";
import { startForwardValidation } from "../../src/lib/research/forwardValidation.ts";
import type { QualifiedStrategySet } from "../../src/lib/research/strategyQualification.ts";

const start=Date.UTC(2025,0,1), step=300_000;
const bars=Array.from({length:3},(_,i)=>({timestamp:start+i*step,open:100+i,high:102+i,low:99+i,close:101+i,volume:10}));
async function history(provider:HistoricalAdapter["provider"]){
  let calls=0;
  const adapter:HistoricalAdapter={provider,async fetch(request){calls++;if(provider==="MT5_BRIDGE"&&!request.accountId)throw new Error("MT5_ACCOUNT_REQUIRED");return {sourceSymbol:request.symbol,accountId:request.accountId,broker:provider==="MT5_BRIDGE"?"Broker":undefined,server:provider==="MT5_BRIDGE"?"Demo":undefined,bars};}};
  const service=new HistoricalDataService(new MemoryHistoricalCache(),[adapter]);
  const request={provider,symbol:provider==="MT5_BRIDGE"?"EURUSD":"BTCUSDT",timeframe:"5m" as const,from:start,to:start+step*2,accountId:provider==="MT5_BRIDGE"?"account-1":undefined};
  const one=await service.get(request),two=await service.get(request);
  assert.equal(calls,1,"cache prevents hidden refetch/substitution");
  assert.equal(one.metadata.provenance.provider,provider);
  assert.equal(one.metadata.provenance.native,true);
  assert.match(one.metadata.dataHash,/^fnv1a32:/);
  assert.equal(two.metadata.dataHash,one.metadata.dataHash,"identical normalized evidence hashes identically");
}
await history("MT5_BRIDGE");await history("BINANCE");await history("BYBIT");

const external=certifyProvider({provider:"MT5",accountId:"account-1",requiredSymbols:["EURUSD"],executionRequired:true,evidence:[{capability:"AUTHENTICATION",verified:true},{capability:"HISTORICAL_DATA",verified:false,externallyUnavailable:true}]});
assert.equal(external.status,"EXTERNAL_VERIFICATION_REQUIRED");
assert.ok(external.reasonCodes.includes("HISTORICAL_DATA_EXTERNAL_VERIFICATION_REQUIRED"));
const capabilities=["AUTHENTICATION","HISTORICAL_DATA","CURRENT_MARKET_DATA","SYMBOL_AVAILABILITY","EXECUTION"].map(capability=>({capability:capability as any,verified:true}));
assert.equal(certifyProvider({provider:"BYBIT",accountId:"account-2",requiredSymbols:["BTCUSDT"],executionRequired:true,evidence:capabilities}).status,"CERTIFIED");

const parameters=Object.freeze({pullbackAtr:.55,stopAtr:1.65});
const set:QualifiedStrategySet=Object.freeze({version:"qualified-strategy-set/v1",id:"CRYPTO_PERSONAL_QUALIFIED_SET",setVersion:"set-v1",frozen:true,product:"PERSONAL",researchPolicyVersion:"policy/v1",certifiedAt:new Date(0).toISOString(),entries:Object.freeze([{strategyId:"crypto.trend-pullback",strategyVersion:"1.0.0",configId:"config-1",configVersion:"research/grid/v1/1",qualificationStatus:"FORWARD_VALIDATION_CANDIDATE" as const,supportedSymbols:["BTCUSDT"],supportedTimeframes:["15m"],researchRunIds:["run-1"],strategyParameters:parameters}])});
const frozen={version:"qualified-forward-config/v1" as const,strategyId:"crypto.trend-pullback",strategyVersion:"1.0.0",configId:"config-1",configVersion:"research/grid/v1/1",strategyParameters:parameters,symbols:["BTCUSDT"],timeframes:["15m"],qualifiedSetVersion:"set-v1",immutable:true as const,propProfileId:null,researchEvidence:{pipelineRunHash:"run-1"}};
const ready=startForwardValidation({frozen,qualifiedSet:set,account:{accountId:"account-2",product:"PERSONAL",providerCertificationStatus:"CERTIFIED",active:true},startedAt:"2026-09-11T00:00:00Z"});
assert.equal(ready.status,"READY");assert.deepEqual(ready.strategyParameters,parameters);assert.ok(Object.isFrozen(ready.strategyParameters));
assert.equal(startForwardValidation({frozen:{...frozen,strategyParameters:{...parameters,stopAtr:9}},qualifiedSet:set,account:{accountId:"account-2",product:"PERSONAL",providerCertificationStatus:"CERTIFIED",active:true},startedAt:"2026-09-11T00:00:00Z"}).status,"BLOCKED");
assert.equal(startForwardValidation({frozen,qualifiedSet:set,account:{accountId:"account-2",product:"PERSONAL",providerCertificationStatus:"EXTERNAL_VERIFICATION_REQUIRED",active:true},startedAt:"2026-09-11T00:00:00Z"}).status,"BLOCKED");

const fs=await import("node:fs");
const serviceSource=fs.readFileSync("src/lib/historicalData/HistoricalDataService.ts","utf8");assert.doesNotMatch(serviceSource,/synthetic|mock/i,"real-data service has no synthetic fallback");
const repo=fs.readFileSync("src/lib/prop/propProductRepository.ts","utf8");assert.match(repo,/AWAITING_PROVIDER_OBSERVATIONS/);assert.doesNotMatch(repo,/truthStatus:\s*["']FILLED/);
const migration=fs.readFileSync("supabase/migrations/20260911180000_provider_capability_certification.sql","utf8");assert.match(migration,/EXTERNAL_VERIFICATION_REQUIRED/);
console.log("final 3C certification: history provenance, provider capability, immutable handoff and truth checks passed");
