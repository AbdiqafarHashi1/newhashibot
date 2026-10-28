import {REPLAY_LIFECYCLE_VERSION} from './scanner-replay-lifecycle.ts';
/** Lightweight descriptor shared by submission and worker; no account, provider or database imports. */
export const OBSERVED_REPLAY_SELECTION_POLICY=Object.freeze({version:REPLAY_LIFECYCLE_VERSION,scope:'crypto',closeObservation:'COMPLETE_NATIVE_CANDLE',cooldownMs:0});
