import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertMeasuredExecutionLineage} from '../../supabase/functions/_shared/measured-execution-lineage';
import {pinnedClaimFromQualifiedSet,routeProductionEligibility} from '../../supabase/functions/_shared/trading-domain/production-eligibility-router';
const fixture=()=>({signal:{strategy_id:'forex.trend-pullback',strategy_version:'1.0.0',symbol:'EURUSD',timeframe:'15m'},strategy_plan:{provenance:{measured_release_id:'release',evaluated_parameters:{stopAtr:1.4}}},measured_release:{id:'release',state:'PROMOTED',strategy_id:'forex.trend-pullback',configuration_hash:'hash',immutable_configuration:{strategies:[{id:'forex.trend-pullback',enabled:true,symbols:['EURUSD'],timeframes:['15m'],parameters:{stopAtr:1.4}}]}},qualified_set:{version:'qualified-strategy-set/v1',id:'FOREX_PERSONAL_QUALIFIED_SET',setVersion:'set',product:'PERSONAL',researchPolicyVersion:'policy',entries:[{strategyId:'forex.trend-pullback',strategyVersion:'1.0.0',configId:'config',configVersion:'1',qualificationStatus:'FORWARD_VALIDATION_CANDIDATE',supportedSymbols:['EURUSD'],supportedTimeframes:['15m'],strategyParameters:{stopAtr:1.4}}]}});
test('measured execution requires the exact promoted release, evaluated parameters and product qualification',()=>{
 assert.equal(assertMeasuredExecutionLineage(fixture()).releaseId,'release');
 for(const mutate of [(x:any)=>x.measured_release.state='RETIRED',(x:any)=>x.strategy_plan.provenance.measured_release_id='old',(x:any)=>x.strategy_plan.provenance.evaluated_parameters.stopAtr=2,(x:any)=>x.qualified_set.entries[0].strategyParameters.stopAtr=2,(x:any)=>x.measured_release.immutable_configuration.strategies[0].symbols=['GBPUSD']]){const x=fixture();mutate(x);assert.throws(()=>assertMeasuredExecutionLineage(x),/RELEASE|PARAMETERS/)}
});
test('production eligibility compares actual evaluator parameters instead of copying its own qualification evidence',()=>{
 const x=fixture(),set=x.qualified_set as any;
 const claim=pinnedClaimFromQualifiedSet({product:'FOREX_PERSONAL',market:'FOREX',set,strategyId:x.signal.strategy_id,strategyVersion:'1.0.0',symbol:'EURUSD',timeframe:'15m',requiredQualification:'FORWARD_VALIDATION_CANDIDATE',evaluatedParameters:{stopAtr:2}});
 assert.deepEqual(routeProductionEligibility({claim,qualifiedSet:set}).reasonCodes,['STRATEGY_PARAMETER_MISMATCH']);
});
