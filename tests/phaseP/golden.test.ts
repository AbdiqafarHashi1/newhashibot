import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROP_PROFILES,simulateFullChallenge,simulateFullChallengeSteps,type HistoricalTradeEvidence,type PropAccountConfiguration} from '../../src/lib/prop/professionalPropEngine.ts';
import {directionalPressure} from '../../supabase/functions/_shared/crypto-production-evaluators.ts';
import {candles} from './fixtures.ts';
test('professional Prop generator preserves full historical golden challenge results from current main',()=>{
 const golden=JSON.parse(readFileSync('tests/phaseP/prop-golden.json','utf8'));
 for(const c of golden.cases){const profile=PROP_PROFILES[c.profileId as keyof typeof PROP_PROFILES],trades=c.trades as HistoricalTradeEvidence[],config=c.config as PropAccountConfiguration;
 assert.deepEqual(simulateFullChallenge(profile,config,trades),c.result);
 const steps=simulateFullChallengeSteps(profile,config,trades);let step=steps.next(),work=0;while(step.done===false){work++;step=steps.next();}assert.deepEqual(step.value,c.result);assert.ok(work<=trades.length*4,'linear bounded stepping replaces repeated prefix simulation');}
});
test('restored shared directional-pressure helper matches the production scanner formula exactly',()=>{
 const scanner=readFileSync('supabase/functions/market-scanner/index.ts','utf8');const from=scanner.indexOf(' {\n  const slice = candles.slice'),to=scanner.indexOf('\nfunction higherTimeframeTrendConfirmed',from);
 const production=new Function('candles','direction','lookback',scanner.slice(from,to));
 for(const direction of ['buy','sell'] as const)for(const lookback of [1,2,3,5])assert.deepEqual(directionalPressure(candles,direction,lookback),production(candles,direction,lookback));
});
