import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deployPresetToLiveStrategyConfigs,deployCategoryPresetToLivePipeline,OFFICIAL_LIVE_SCANNER_PRESET} from '../../src/pages/admin/backtest/presetStorage';
test('historical champion templates cannot claim or grant production calibration',async()=>{
 let writes=0;const previous=(globalThis as any).localStorage;(globalThis as any).localStorage={setItem(){writes++}};
 try{for(const result of [await deployPresetToLiveStrategyConfigs(OFFICIAL_LIVE_SCANNER_PRESET),await deployCategoryPresetToLivePipeline('crypto')]){assert.equal(result.success,false);assert.equal(result.count,0);assert.equal(result.error,'MEASURED_CONFIGURATION_REVIEW_REQUIRED')}assert.equal(writes,0)}finally{(globalThis as any).localStorage=previous}
});
