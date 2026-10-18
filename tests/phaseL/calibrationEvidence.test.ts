import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const report=read('docs/research/SCANNER_CALIBRATION_2026-10-18.json');
const frozen=read('docs/research/SCANNER_FROZEN_CANDIDATE_2026-10-18.json');
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
assert.equal(report.protocolHash,digest(readFileSync('scripts/research/calibration-protocol.json','utf8')));
assert.equal(frozen.configurationHash,digest(JSON.stringify(report.selected.config)));
assert.equal(report.frozenConfigurationHash,frozen.configurationHash);
assert.equal(frozen.selectedBeforeValidationAndHoldout,true);
assert.equal(report.sources.length,36);assert.equal(report.sources.reduce((s:number,x:any)=>s+x.manifest.rows,0),64800);
assert.equal(report.development.length,12);assert.equal(report.development.filter((x:any)=>x.adaptive).length,6);
assert.equal(report.status,'REJECTED_NOT_FOR_PROMOTION');assert.equal(report.promoted,false);
for(const stage of ['validation','holdout','stressedHoldout']){const m=report[stage].metrics;assert.equal(m.tradeCount,m.resolvedCount);assert.equal(m.openCount,0);assert.ok(m.expectancyR<0);assert.ok(m.profitFactor<1);}
assert.ok(report.selected.config.strategies.every((s:any)=>s.parameters.market_adaptation_enabled!==1),'failed research must not enable production adaptation');
const all=[...report.protocol.development,...report.protocol.validation,...report.protocol.holdout];assert.equal(new Set(all).size,all.length);
assert.ok(report.protocol.development.at(-1)<report.protocol.validation[0]);assert.ok(report.protocol.validation.at(-1)<report.protocol.holdout[0]);
console.log('Frozen calibration lineage, chronological splits, source counts and failed-promotion safeguards passed');
