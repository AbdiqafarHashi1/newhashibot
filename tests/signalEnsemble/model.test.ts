import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {predictSleeveContext,sleeveContextFeatures,sleeveContextGate,type FrozenSleeveContextModel} from '../../supabase/functions/_shared/sleeve-context-model.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
const source=JSON.parse(gunzipSync(readFileSync('docs/research/signal-ensemble-model/model-proposals.json.gz')).toString()) as {models:FrozenSleeveContextModel[];proposals:{candidate:ArbitrationCandidate;prediction:number}[]};
for(const path of ['docs/research/signal-ensemble-model/model-proposals.json.gz','docs/research/signal-ensemble-extended-model/model-proposals.json.gz']){const source=JSON.parse(gunzipSync(readFileSync(path)).toString()) as {models:FrozenSleeveContextModel[];proposals:{candidate:ArbitrationCandidate;prediction:number}[]};
test(`${path}: portable inference matches frozen Python predictions from decision-time evidence`,()=>{assert.equal(source.models.length,4);assert.ok(source.proposals.length>100);for(const p of source.proposals){const f=sleeveContextFeatures(p.candidate),prediction=predictSleeveContext(source.models.find(m=>m.id===p.candidate.strategyId)!,f);assert.ok(Math.abs(prediction-p.prediction)<1e-12);assert.equal(sleeveContextGate(prediction,Number(p.candidate.evidence.estimated_cost_r)),true);const altered={...p.candidate,evidence:{...p.candidate.evidence,future_profit:10000,future_close:0}};assert.deepEqual(sleeveContextFeatures(altered),f);}});
}
test('corrupt or non-finite models cannot predict or pass a gate',()=>{const p=source.proposals[0],m=source.models.find(m=>m.id===p.candidate.strategyId)!,f=sleeveContextFeatures(p.candidate);assert.throws(()=>predictSleeveContext({...m,trees:[]},f),/SHAPE/);assert.throws(()=>predictSleeveContext(m,[NaN,...f.slice(1)]),/SHAPE/);assert.equal(sleeveContextGate(Infinity,.1),false);assert.equal(sleeveContextGate(.2,NaN),false);assert.throws(()=>sleeveContextFeatures({...p.candidate,evidence:{}}),/IDENTITY/);});
