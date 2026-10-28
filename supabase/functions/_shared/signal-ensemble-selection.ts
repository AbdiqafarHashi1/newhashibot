import {requiredReplayBars as priorBars,needsBtcReference as priorReference,referenceOnly as priorOnly,validateCoordinatedDatasets as priorValidate,isCryptoTeam} from './coordinated-crypto-selection.ts';
import {SIGNAL_ENSEMBLE_ROLES,SIGNAL_ENSEMBLE_SYMBOLS,SIGNAL_ENSEMBLE_VERSION} from './crypto-signal-ensemble-contract.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
export {isCryptoTeam};
export const isSignalEnsemble=(c:ApprovedReplayConfiguration)=>c.strategies.some(s=>s.enabled&&SIGNAL_ENSEMBLE_ROLES.some(r=>r.id===s.id));
export const requiredReplayBars=(c:ApprovedReplayConfiguration)=>isSignalEnsemble(c)?960:priorBars(c);
export const needsBtcReference=(c:ApprovedReplayConfiguration)=>isSignalEnsemble(c)||priorReference(c);
export const referenceOnly=(c:ApprovedReplayConfiguration,s:string)=>isSignalEnsemble(c)?s==='BTCUSDT'&&c.strategies.filter(x=>x.enabled).every(x=>x.id==='crypto.sleeve-relative'):priorOnly(c,s);
export function validateCoordinatedDatasets(c:ApprovedReplayConfiguration,datasets:readonly {symbol:string;timeframe:string;market_type?:string;market?:string}[]){
 if(!isSignalEnsemble(c))return priorValidate(c,datasets);
 if(c.strategies.some(s=>!SIGNAL_ENSEMBLE_ROLES.some(r=>r.id===s.id)||s.version!==SIGNAL_ENSEMBLE_VERSION||Object.keys(s.parameters).length||s.maxBarsInTrade!==96||s.minScore<75||s.minRiskReward<(s.id==='crypto.sleeve-reversal'?.8:1.5)||s.timeframes.length!==1||s.timeframes[0]!=='15m'||!s.symbols.length||s.symbols.some(x=>!SIGNAL_ENSEMBLE_SYMBOLS.includes(x)||s.id==='crypto.sleeve-relative'&&x==='BTCUSDT')))throw Error('SIGNAL_ENSEMBLE_FROZEN_CONFIGURATION_REQUIRED');
 if(!datasets.length||datasets.length>5||datasets.filter(d=>d.symbol==='BTCUSDT').length!==1||new Set(datasets.map(d=>d.symbol)).size!==datasets.length||datasets.some(d=>d.timeframe!=='15m'||(d.market_type??d.market)!=='crypto'||!c.strategies.some(s=>s.enabled&&s.symbols.includes(d.symbol))&&d.symbol!=='BTCUSDT')||datasets.every(d=>referenceOnly(c,d.symbol)))throw Error('SIGNAL_ENSEMBLE_NATIVE_DATASET_SCOPE_REQUIRED');
}
