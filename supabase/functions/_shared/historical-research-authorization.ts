import type {StrategyDefinition} from './professional-strategies.ts';
import {canonicalSnapshotFingerprint} from './canonical-historical-replay.ts';
/** Explicit isolated experiment admission; never a promoted release or customer execution approval.
 * Caller retains immutable input/configuration fingerprints and may use these definitions only in historical adapters. */
export async function authorizeHistoricalResearch(definitions:readonly StrategyDefinition[],experimentId:string){
 if(!/^[a-zA-Z0-9._:-]{3,120}$/.test(experimentId))throw Error('RESEARCH_EXPERIMENT_ID_REQUIRED');
 const authorization=await canonicalSnapshotFingerprint({scope:'HISTORICAL_RESEARCH_ONLY',experimentId,strategies:definitions.map(d=>({id:d.id,version:d.version,config:d.config}))});
 return definitions.map(d=>({...d,lifecycle:'ENABLED' as const,publicationMode:'SHADOW' as const,certification:'RESEARCH' as const,config:{...structuredClone(d.config),enabled:true,config_source:`research_authorization:v1:${authorization}`,params:{...d.config.params,entry_engine_version:1}}}));
}
