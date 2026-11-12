import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchJourneys, type LaunchStatus } from '../../src/lib/launchOverview';

const now = Date.parse('2026-11-12T08:00:00Z');
const status = (): LaunchStatus => ({ observedAt:new Date(now).toISOString(), configuration:{}, checks:[] });
test('missing backend observations do not become successful zero records', () => {
  const journeys = launchJourneys(null,now);
  for (const id of ['scanner','payments','telegram','execution','research']) assert.equal(journeys.find(j=>j.id===id)?.state,'unavailable');
  assert.equal(journeys.length,9);
  assert(journeys.find(j=>j.id==='research')?.to==='/admin/research');
});
test('fresh scanner activity and stale provider observations remain separate', () => {
  const s = status(); s.checks = [
    {name:'scannerRuns',state:'LOADED',data:[{started_at:new Date(now-60_000).toISOString(),status:'failed'}]},
    {name:'accounts',state:'LOADED',data:[{last_synchronized_at:new Date(now-3600_000).toISOString()}]},
    {name:'paymentAttempts',state:'UNAVAILABLE',data:[]},
  ];
  const journeys = launchJourneys(s,now);
  assert.equal(journeys.find(j=>j.id==='scanner')?.state,'recorded','a failed run is an observation, never a healthy-service verdict');
  assert.match(journeys.find(j=>j.id==='scanner')!.evidence,/inspect its outcome/);
  assert.equal(journeys.find(j=>j.id==='execution')?.state,'attention');
  assert.equal(journeys.find(j=>j.id==='payments')?.state,'unavailable');
});
test('observations expire and future timestamps cannot appear fresh', () => {
  const s = status(); s.checks = [{name:'scannerRuns',state:'LOADED',data:[{started_at:new Date(now+60_000).toISOString()}]}];
  assert.equal(launchJourneys(s,now).find(j=>j.id==='scanner')?.state,'attention');
  assert.equal(launchJourneys(s,now+360_000).find(j=>j.id==='scanner')?.state,'unavailable');
});
