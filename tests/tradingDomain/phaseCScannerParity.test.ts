import assert from "node:assert/strict";
import { arbitrateCanonical, buildCanonicalMarketView, classifyRuntimeOnlyDifference, materializeCanonicalSignal, resolveCanonicalStrategyParameters, runCanonicalScanner, strategyById, type DomainCandle } from "../../supabase/functions/_shared/trading-domain/index.ts";

const start=Date.parse("2026-01-05T06:00:00Z"),width=900_000,symbol="EURUSD";
const m15:DomainCandle[]=Array.from({length:64},(_,i)=>{const base=1.08+i*.00012,pullback=i===63?-.00018:0;return {datasetId:"fixture:eurusd:m15:v1",symbol,timeframe:"15m",openTime:new Date(start+i*width).toISOString(),open:base,high:base+.00035,low:base-.0003,close:base+.0002+pullback,volume:1000+i};});
const h1:DomainCandle[]=Array.from({length:64},(_,i)=>{const base=1.07+i*.0004;return {datasetId:"fixture:eurusd:h1:v1",symbol,timeframe:"1h",openTime:new Date(start+i*3_600_000).toISOString(),open:base,high:base+.0008,low:base-.0005,close:base+.00045,volume:4000+i};});
const asOf=new Date(start+64*width).toISOString(),configurationVersion="phase-b:qualified-config:fixture-v1",request={strategyId:"forex.trend-pullback",configurationVersion,parameters:{}};

// Research entry path: independently constructs its market view and invokes the
// registry definition, arbitrator, and immutable writer (not the scanner wrapper).
const definition=strategyById(request.strategyId),parameters=resolveCanonicalStrategyParameters(request.strategyId,request.parameters);
const researchMarket=buildCanonicalMarketView({symbol,asOf,primaryTimeframe:definition.requirements.primaryTimeframe,requiredTimeframes:definition.requirements.requiredTimeframes,warmupBars:definition.requirements.warmupBars,datasets:{"15m":m15,"1h":h1},session:{open:true,code:"FIXTURE_SESSION"}});
const researchEvaluation=definition.evaluate({market:researchMarket,configurationVersion,parameters});
const researchCandidates=researchEvaluation.decision==="CANDIDATE"?[researchEvaluation.candidate]:[];
const researchArbitration=arbitrateCanonical(researchCandidates,{minimumScore:0,blockedSymbols:[]});
const researchSignal=materializeCanonicalSignal(researchArbitration,asOf);

// Scanner entry path starts from raw provider-shaped datasets and converges on
// those same canonical authorities.
const scanner=runCanonicalScanner({symbol,asOf,datasets:{"15m":m15,"1h":h1},strategies:[request],minimumScore:0,session:{open:true,code:"FIXTURE_SESSION"}});
assert.deepEqual(scanner.identities,[{strategyId:definition.id,strategyVersion:definition.version,configurationVersion,parameters}]);
assert.deepEqual(scanner.evaluations,[researchEvaluation]);
assert.deepEqual(scanner.candidates,researchCandidates);
assert.deepEqual(scanner.arbitration,researchArbitration);
assert.deepEqual(scanner.signal,researchSignal);
assert.ok(Object.isFrozen(scanner)&&(!scanner.signal||Object.isFrozen(scanner.signal)));

const beforeClose=runCanonicalScanner({symbol,asOf:new Date(start+width-1).toISOString(),datasets:{"15m":m15,"1h":h1},strategies:[request],minimumScore:0,session:{open:true,code:"FIXTURE_SESSION"}});
assert.equal(beforeClose.outcome,"NO_TRADE");
assert.deepEqual(beforeClose.evaluations[0].decision==="NO_TRADE"?beforeClose.evaluations[0].reasonCodes:[],["INSUFFICIENT_WARMUP"]);
const rejected=runCanonicalScanner({symbol,asOf,datasets:{"15m":m15,"1h":h1},strategies:[request],minimumScore:101,session:{open:true,code:"FIXTURE_SESSION"}});
assert.equal(rejected.outcome,"NO_TRADE");
assert.deepEqual(rejected.arbitration.rejected.map(x=>x.reasonCodes),researchCandidates.length?[["BELOW_SCORE"]]:[]);
assert.equal(classifyRuntimeOnlyDifference("telegram.delivery_id"),"DELIVERY_METADATA");
assert.equal(classifyRuntimeOnlyDifference("evaluation.score"),null,"semantic mismatches cannot be classified away");
assert.throws(()=>runCanonicalScanner({symbol,asOf,datasets:{"15m":m15,"1h":h1},strategies:[{strategyId:"crypto.trend-pullback",configurationVersion,parameters:{}}],minimumScore:0,session:{open:true,code:"FIXTURE_SESSION"}}),/NON_PRODUCTION_STRATEGY/);
console.log("phase C scanner parity tests passed");
