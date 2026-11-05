import {test} from 'node:test';import assert from 'node:assert/strict';
import {measuredRuntimeConfiguration} from '../../supabase/functions/_shared/measured-strategy-runtime.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
test('new entry policy cannot inherit an approval for absent or different strategy code versions',()=>{
 const release={id:'test-release',strategy_id:'crypto.micro-scalper',state:'PROMOTED',immutable_configuration:{minSignalGrade:'A',strategies:[{id:'crypto.micro-scalper',version:'wrong-version',enabled:true,minScore:72,minRiskReward:1.2,maxBarsInTrade:24,symbols:['BTCUSDT'],timeframes:['5m'],parameters:{entry_engine_version:1}}]}};
 const catalog=()=>watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true}],[release]);
 assert.equal(catalog().find(d=>d.id==='crypto.micro-scalper')!.config.config_source,'db');
 release.immutable_configuration.strategies[0].version='1.0.0';assert.equal(catalog().find(d=>d.id==='crypto.micro-scalper')!.config.config_source,'measured_release:test-release');
});
test('an explicit registry identity resolves a research release without a second hardcoded name registry',()=>{
 const release={id:'research-only-test',strategy_id:'crypto.research-fixture',state:'PROMOTED',immutable_configuration:{minSignalGrade:'A',strategies:[{id:'crypto.research-fixture',version:'research-v1',enabled:true,minScore:80,minRiskReward:2,maxBarsInTrade:20,symbols:['BTCUSDT'],timeframes:['15m'],parameters:{entry_engine_version:1}}]}};
 const config=measuredRuntimeConfiguration('ResearchFixture',{enabled:true},[release],'A',{id:release.strategy_id,version:'research-v1'});
 assert.equal(config.config_source,'measured_release:research-only-test');assert.equal(config.enabled,true);
 assert.equal(measuredRuntimeConfiguration('ResearchFixture',{enabled:true},[release],'A',{id:release.strategy_id,version:'research-v2'}).enabled,false);
});
