import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregateReplay } from "../../src/pages/admin/backtest/ReplayCockpit";

const accepted=[
 {acceptedAt:"2026-01-01T00:00:00Z",closedAt:"2026-01-01T01:00:00Z",candidate:{side:"BUY"},result:{strategyId:"s1",symbol:"EURUSD",market:"FOREX",netR:2}},
 {acceptedAt:"2026-01-02T00:00:00Z",closedAt:"2026-01-02T02:00:00Z",candidate:{side:"SELL"},result:{strategyId:"s1",symbol:"EURUSD",market:"FOREX",netR:-1}},
 {acceptedAt:"2026-01-03T00:00:00Z",closedAt:"2026-01-03T03:00:00Z",candidate:{side:"BUY"},result:{strategyId:"s2",symbol:"XAUUSD",market:"METALS",netR:1}},
];
const pipeline={accepted};
const strategy=aggregateReplay(pipeline,"strategyId");
assert.deepEqual(strategy.map(x=>x.key),["s1","s2"]);assert.equal(strategy[0].count,2);assert.equal(strategy[0].wins,1);assert.equal(strategy[0].losses,1);assert.equal(strategy[0].net,1);assert.equal(strategy[0].pf,2);assert.equal(strategy[0].buy,1);assert.equal(strategy[0].sell,1);
assert.equal(aggregateReplay(pipeline,"market")[0].key,"FOREX");assert.equal(aggregateReplay(pipeline,"symbol")[1].key,"XAUUSD");
const ui=readFileSync("src/pages/admin/backtest/ReplayCockpit.tsx","utf8"),prop=readFileSync("src/lib/research/fullPropPipelineReplay.ts","utf8"),lab=readFileSync("src/pages/admin/BacktestLab.tsx","utf8");
for(const evidence of ["HISTORICAL SIGNAL REPLAY","SIGNAL INSPECTOR","HISTORICAL PERSONAL POLICY REPLAY","PERSONAL DECISION INSPECTOR","PROP ATTEMPT INSPECTOR","PASS RATE — DETERMINATE","STRATEGY CONTRIBUTION","MARKET / CATEGORY SCORECARDS","SYMBOL PERFORMANCE","ARBITRATION / REJECTION ANALYTICS","SAVED RESEARCH CONFIGURATIONS","RESEARCH DIAGNOSTICS","CAPITAL / RISK ALLOCATION LAB"])assert.ok(ui.includes(evidence),evidence);
for(const state of ["AMBIGUOUS","INCOMPLETE","PASSED","FAILED","PROFILE RULE NOT VERIFIED","INSUFFICIENT INTRADAY DATA"])assert.ok(`${ui}${prop}`.includes(state),state);
assert.ok(prop.includes("lowerTimeframeUsed"));assert.ok(prop.includes("profileDay"));assert.ok(prop.includes("dailyLossBreach"));assert.ok(prop.includes("determinatePassRate"));assert.ok(lab.includes("<PhaseMOperationsPanel"));assert.ok(lab.includes("initialMode=\"SCANNER\""));
assert.ok(!ui.includes("STRATEGY_DEFINITIONS"));assert.ok(!ui.includes("deployPresetToLiveStrategyConfigs"));assert.ok(!ui.includes("createDefaultMultiAssetFeeds"));
console.log("Phase A.3 cockpit tests passed");
