import { CALIBRATION_PARAMETER_REGISTRY } from './strategyQualification';
import { createPipelineInput, discoverResearchStrategies, researchHash } from './permanentResearchLab';
import { runCandidatePipelineReplay, type ResearchExecutionModel } from './canonicalPipelineReplay';
import { metrics } from './researchValidation';
import type { HistoricalDataset } from '../historicalData/types';

export function calibrationPeriods(dataset: HistoricalDataset) {
  if (dataset.bars.length < 300) throw new Error('AT_LEAST_300_CLOSED_CANDLES_REQUIRED');
  const bars=dataset.bars, a=Math.floor(bars.length*.6),b=Math.floor(bars.length*.8);
  return {development:bars.slice(0,a),validation:bars.slice(a,b),holdout:bars.slice(b)};
}
/** Model output is data only. Reject unknown keys, risk changes and out-of-range parameters. */
export function validateCalibrationProposal(strategyId:string, proposed:Record<string,unknown>) {
  const registry=CALIBRATION_PARAMETER_REGISTRY[strategyId]?.filter(p=>p.namespace==='STRATEGY')??[];
  if (!Object.keys(proposed).length) throw new Error('EMPTY_PROPOSAL');
  const result:Record<string,number>={};
  for(const [key,value] of Object.entries(proposed)) {
    const rule=registry.find(p=>p.name===key);
    if(!rule||typeof value!=='number'||!Number.isFinite(value)||!rule.discreteValues.includes(value)) throw new Error(`UNAPPROVED_PARAMETER:${key}`);
    result[key]=value;
  }
  return result;
}
export function calibrationCandidates(strategyId:string,defaults:Record<string,number>) {
  const registry=CALIBRATION_PARAMETER_REGISTRY[strategyId]?.filter(p=>p.namespace==='STRATEGY')??[];
  const candidates=[{...defaults}];
  for(const rule of registry)for(const value of rule.discreteValues) {
    if(candidates.length>=8)break;
    const config={...defaults,[rule.name]:value};
    if(!candidates.some(c=>JSON.stringify(c)===JSON.stringify(config)))candidates.push(config);
  }
  return candidates;
}
export function evaluateCalibrationPeriod(dataset:HistoricalDataset,strategyId:string,parameters:Record<string,number>,period:'development'|'validation'|'holdout',execution:ResearchExecutionModel) {
  if(![execution.forex?.spreadCost,execution.forex?.commissionPerTrade,execution.forex?.slippageCost,execution.crypto?.takerFeeRate,execution.crypto?.slippageRate].filter(x=>x!==undefined).every(x=>Number.isFinite(x)&&x!>=0))throw new Error('INVALID_COST_ASSUMPTIONS');
  if(dataset.bars.length>20000)throw new Error('CALIBRATION_LIMIT_20000_CANDLES_SELECT_SMALLER_RANGE');
  const bars=calibrationPeriods(dataset)[period];
  const inputDataset={...dataset,bars,metadata:{...dataset.metadata,barCount:bars.length,requestedRange:{from:bars[0].timestamp,to:bars[bars.length-1].timestamp}}};
  const input=createPipelineInput(inputDataset,strategyId,parameters,researchHash({dataset:dataset.metadata.dataHash,strategyId,parameters,period},'calibration'),execution);
  const result=runCandidatePipelineReplay(input);
  return {period,from:bars[0].timestamp,to:bars[bars.length-1].timestamp,barCount:bars.length,runHash:result.runHash,metrics:metrics(result.trades),parameters:{...parameters}};
}
export const calibrationStrategies=discoverResearchStrategies;
