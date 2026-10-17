import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deployPresetToLiveStrategyConfigs,deployCategoryPresetToLivePipeline,OFFICIAL_LIVE_SCANNER_PRESET} from '../../src/pages/admin/backtest/presetStorage';
test('historical champion templates cannot claim or grant production calibration',async()=>{
 let writes=0;const previous=(globalThis as any).localStorage;(globalThis as any).localStorage={setItem(){writes++}};
 try{for(const result of [await deployPresetToLiveStrategyConfigs(OFFICIAL_LIVE_SCANNER_PRESET),await deployCategoryPresetToLivePipeline('crypto')]){assert.equal(result.success,false);assert.equal(result.count,0);assert.equal(result.error,'MEASURED_CONFIGURATION_REVIEW_REQUIRED')}assert.equal(writes,0)}finally{(globalThis as any).localStorage=previous}
});


test('legacy calibration reports preserve measured baseline instead of manufacturing improved returns',async()=>{
 const {generateAICalibrationReport,runSingleStrategyEngine}=await import('../../src/pages/admin/backtest/simulationEngine');
 const measured=runSingleStrategyEngine([],'CryptoMicroScalper',{}, {assetClass:'crypto',symbol:'BTCUSDT',pipOrPointSize:.01,spreadPipsOrPts:2,feePctPerSide:.04,accountSizeUsd:10000,riskPctPerTrade:.25,fridayWeekendClose:false,enforceSessionWindows:false},24,80).metrics;
 const metrics={...measured,totalR:-5,winRate:20,maxDrawdownPct:12};
 const report=generateAICalibrationReport([],metrics,[],{} as Parameters<typeof generateAICalibrationReport>[3],{} as Parameters<typeof generateAICalibrationReport>[4]);
 assert.equal(report.projectedPortfolioReturnR,-5);assert.equal(report.projectedWinRatePct,20);assert.equal(report.projectedDrawdownPct,12);
 assert.equal(report.globalTweaks.recommendedForexRiskPct,0);assert.ok(report.lossDiagnosis.some(x=>x.includes('unmeasured')));
});
