import {test} from 'node:test';import assert from 'node:assert/strict';
import {executionStrategyPresets,executionStrategyEvidence,executionStrategyDisplayName} from '../../supabase/functions/_shared/execution-strategy-presets';
import {validateExecutionStrategySelection} from '../../supabase/functions/_shared/execution-strategy-selection';
test('presets select reviewed exact configurations compatible with each account',()=>{
 for(const provider of ['MT5_PERSONAL','MT5_PROP','BINANCE','BYBIT'])for(const environment of ['demo','testnet','live']){
  const presets=executionStrategyPresets(provider,environment);
  if(environment==='live'){assert.deepEqual(presets,[]);continue;}
  for(const p of presets){assert(p.ids.length>0);assert(p.ids.every(id=>executionStrategyEvidence(id)));assert.deepEqual(validateExecutionStrategySelection(provider,environment,p.ids),[...p.ids].sort());}
 }
 assert.deepEqual(executionStrategyPresets('UNKNOWN','demo'),[]);
 assert.equal(executionStrategyPresets('MT5_PROP','demo').find(p=>p.id==='reviewed')?.ids.length,7);
 assert.equal(executionStrategyPresets('MT5_PROP','demo').find(p=>p.id==='gold-compression')?.ids.length,1);
 assert.equal(executionStrategyPresets('MT5_PERSONAL','demo').find(p=>p.id==='gold')?.ids.length,3);
 assert.equal(executionStrategyPresets('BINANCE','testnet').find(p=>p.id==='reviewed')?.ids.length,5);
 assert.deepEqual(executionStrategyPresets('MT5_PERSONAL','demo').find(p=>p.id==='gold-momentum-focused')?.ids,['gold.native-momentum-15-48-2-5']);
 assert.deepEqual(executionStrategyPresets('MT5_PROP','demo').find(p=>p.id==='gold-momentum-focused')?.ids,['gold.native-momentum-15-48-2-5']);
 assert.equal(executionStrategyPresets('BINANCE','testnet').some(p=>p.id==='gold-momentum-focused'),false);
});
test('higher target names remain exact to the reviewed configuration',()=>{
 assert.match(executionStrategyDisplayName('gold.native-momentum-15-48-2-5','fallback'),/15m · 5R/);
 assert.equal(executionStrategyEvidence('gold.frontier-unreviewed'),null);
 assert.equal(executionStrategyDisplayName('unknown','fallback'),'fallback');
});
