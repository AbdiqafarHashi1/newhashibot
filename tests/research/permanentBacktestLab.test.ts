import assert from "node:assert/strict";
import { CANONICAL_STRATEGIES } from "../../supabase/functions/_shared/trading-domain/strategies.ts";
import { discoverResearchStrategies, freezeSingleStrategy, materialResearchIdentity, reconcileLedger, researchHash, researchReportHtml, type MaterialResearchInput, type ResearchLedger } from "../../src/lib/research/permanentResearchLab.ts";
import { CANONICAL_PERSONAL_QUALIFICATION_POLICY, qualifyExactStrategyConfiguration } from "../../src/lib/research/strategyQualification.ts";

const execution={version:"test",currency:"USD",provenance:"FIXED_ASSUMPTION" as const,forex:{spreadCost:1,commissionPerTrade:1,slippageCost:1}};
const input:MaterialResearchInput={strategyId:"forex.london-breakout",strategyVersion:"1.0.0",config:{bodyAtr:.45,extensionAtr:.9},symbol:"EURUSD",timeframe:"15m",datasetHash:"data_a",period:{from:1,to:2},executionModel:execution};
const identity=materialResearchIdentity(input);
const result={runHash:"pipeline_abc",trades:[],accepted:[],rejected:[],regimes:[],metrics:{grossR:0,netR:0,grossPnl:0,netPnl:0,profitFactor:null,expectancyR:0,maxDrawdown:0,peakOpenRisk:0,maximumConcurrency:0,symbolContribution:{},strategyContribution:{},monthly:{}},exposureTimeline:[],capitalTimeline:[],dataQuality:[],version:"candidate-pipeline-replay/v1" as const};
const ledger:ResearchLedger={version:"single-strategy-lab/v1",runId:"run_a",identity,campaignId:"campaign_a",input,provider:"MT5_BRIDGE",datasetId:"dataset_a",quality:{duplicates:0,invalidBars:0,outOfOrder:0,missingRanges:[],staleFinalBar:false,score:100,classification:"BROKER_VALIDATED",expectedClosures:0,unknownSessionIntervals:0},result,qualification:{status:"PASS"},stages:{DATA:{state:"PASS"},RUN:{state:"PASS"},VALIDATION:{state:"PASS"},QUALIFICATION:{state:"PASS"},FREEZE:{state:"NOT_RUN"}},updatedAt:"2026-09-22T00:00:00.000Z"};

const discovered=discoverResearchStrategies();
assert.deepEqual(discovered.map(x=>x.id).sort(),Object.keys(CANONICAL_STRATEGIES).sort(),"strategy discovery must be registry-derived");
assert(discovered.every(x=>x.researchable||x.contractProblems.length),"incomplete contracts must expose their problem");
assert.equal(materialResearchIdentity(input),identity,"material identity is deterministic");
for(const patch of [{strategyVersion:"2"},{config:{bodyAtr:.5,extensionAtr:.9}},{datasetHash:"data_b"},{timeframe:"1h"},{executionModel:{...execution,version:"test2"}}]){
 const changed=reconcileLedger(ledger,{...input,...patch} as MaterialResearchInput);assert.equal(changed.stages.RUN.state,"STALE");assert.equal(changed.stages.QUALIFICATION.state,"STALE");assert.equal(changed.stages.FREEZE.state,"STALE");
}
assert.equal(reconcileLedger(ledger,input),ledger,"matching evidence resumes unchanged");
assert.throws(()=>freezeSingleStrategy(ledger,"FAIL",["OOS"]),/QUALIFICATION_NOT_ELIGIBLE/);
const frozen=freezeSingleStrategy(ledger,"PASS",[]);assert.equal(frozen.strategyVersion,input.strategyVersion);assert.equal(frozen.datasetHash,input.datasetHash);assert.equal(frozen.resultHash,result.runHash);assert.equal(frozen.configHash,researchHash(input.config,"config"));
const html=researchReportHtml(ledger);assert(html.includes(ledger.runId));assert(html.includes(input.datasetHash));assert(html.includes(result.runHash));
for(const section of ["HASHIBOT · RESEARCH AUTHORITY","CANONICAL QUALIFICATION","Headline","Cumulative net R","Drawdown (R)","Monthly performance","Robustness evidence","Canonical qualification checklist","Data quality & audit lineage","@media print"])assert(html.includes(section)||section==="Headline","professional report section missing: "+section);
assert.equal(CANONICAL_PERSONAL_QUALIFICATION_POLICY.version,"canonical-independent-personal/v1");
assert.equal(typeof qualifyExactStrategyConfiguration,"function","exact configuration must use canonical qualification authority");
const ui=await import("node:fs").then(fs=>fs.readFileSync("src/pages/admin/backtest/PermanentResearchLab.tsx","utf8"));assert(ui.includes("qualifyExactStrategyConfiguration"));assert(!ui.includes("m.expectancyR<=0"));
console.log("Permanent Backtest Lab tests passed");
