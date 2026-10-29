import {TEN_ASSET_PROFILE,TEN_REGIME_PROFILE,OPPORTUNITY_ORDER,REGIME_OPPORTUNITY_ORDER} from './ten-asset-contract.ts';
import {REPLAY_LIFECYCLE_VERSION} from './scanner-replay-lifecycle.ts';
/** Lightweight descriptor shared by submission and worker; no account, provider or database imports. */
export const OBSERVED_REPLAY_SELECTION_POLICY=Object.freeze({version:REPLAY_LIFECYCLE_VERSION,scope:'crypto',closeObservation:'COMPLETE_NATIVE_CANDLE',cooldownMs:0});

export const replaySelectionDescriptor=(configuration:{version:string})=>configuration.version===TEN_REGIME_PROFILE?{...OBSERVED_REPLAY_SELECTION_POLICY,opportunityOrdering:REGIME_OPPORTUNITY_ORDER}:configuration.version===TEN_ASSET_PROFILE?{...OBSERVED_REPLAY_SELECTION_POLICY,opportunityOrdering:OPPORTUNITY_ORDER}:OBSERVED_REPLAY_SELECTION_POLICY;
