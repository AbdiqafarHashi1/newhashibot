import {stableFingerprint} from './strategy-plan.ts';
/** A qualified set cannot certify a different parameter set from the one that actually produced a signal. */
export function assertMeasuredExecutionLineage(evidence:any){
 const release=evidence.measured_release,signal=evidence.signal,plan=evidence.strategy_plan;
 if(!release||release.state!=='PROMOTED'||release.strategy_id!==signal?.strategy_id||plan?.provenance?.measured_release_id!==release.id)throw Error('CURRENT_MEASURED_EXECUTION_RELEASE_REQUIRED');
 const frozen=release.immutable_configuration?.strategies?.find((s:any)=>s.id===signal.strategy_id&&s.enabled===true);
 if(!frozen||!Array.isArray(frozen.symbols)||!frozen.symbols.includes(signal.symbol)||!Array.isArray(frozen.timeframes)||!frozen.timeframes.includes(signal.timeframe))throw Error('MEASURED_RELEASE_SCOPE_MISMATCH');
 const actual=plan.provenance.evaluated_parameters;
 if(!actual||!frozen.parameters||stableFingerprint(actual)!==stableFingerprint(frozen.parameters))throw Error('EVALUATED_STRATEGY_PARAMETERS_MISMATCH');
 if(actual.entry_engine_version===1&&frozen.version!==signal.strategy_version)throw Error('MEASURED_STRATEGY_VERSION_MISMATCH');
 const set=evidence.qualified_set;
 const entry=set?.entries?.find((e:any)=>e.strategyId===signal.strategy_id&&e.strategyVersion===signal.strategy_version&&e.supportedSymbols?.includes(signal.symbol)&&e.supportedTimeframes?.includes(signal.timeframe));
 if(!entry||stableFingerprint(entry.strategyParameters)!==stableFingerprint(actual))throw Error('QUALIFIED_STRATEGY_PARAMETERS_MISMATCH');
 return {releaseId:release.id,configurationHash:release.configuration_hash};
}
