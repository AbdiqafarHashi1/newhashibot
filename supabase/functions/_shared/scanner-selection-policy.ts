/** Shared post-arbitration admission policy for production scanner and isolated replay. */
export interface ScannerSelectionState {activeSignalId?:string;lastSelectedAt?:string}
export interface ScannerSelectionPolicy {preventDuplicateSymbolSignals:boolean;cooldownMs:number}
export function applyScannerSelectionPolicy(at:string,state:ScannerSelectionState,policy:ScannerSelectionPolicy){if(policy.preventDuplicateSymbolSignals&&state.activeSignalId)return{allowed:false,reason:"duplicate_active_signal" as const};if(state.lastSelectedAt&&Date.parse(at)-Date.parse(state.lastSelectedAt)<policy.cooldownMs)return{allowed:false,reason:"scanner_cooldown" as const};return{allowed:true,reason:null}}
