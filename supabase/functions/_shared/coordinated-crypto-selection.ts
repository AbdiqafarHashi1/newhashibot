import {coordinatedConfiguration} from './coordinated-crypto.ts';
import {CRYPTO_TEAM_ROLES,CRYPTO_TEAM_PROFILE_IDS} from './coordinated-crypto-contract.ts';
import {usesAltReference,replayContextBars,validateAltDatasetSelection} from './crypto-relative-strength.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
const stable=(x:unknown):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?`[${x.map(stable)}]`:`{${Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
export const isCryptoTeam=(configuration:ApprovedReplayConfiguration)=>configuration.strategies.some(s=>s.enabled&&CRYPTO_TEAM_ROLES.some(r=>r.id===s.id));
export const needsBtcReference=(configuration:ApprovedReplayConfiguration)=>usesAltReference(configuration)||isCryptoTeam(configuration);
export const requiredReplayBars=(configuration:ApprovedReplayConfiguration)=>isCryptoTeam(configuration)?960:replayContextBars(configuration);
export const referenceOnly=(configuration:ApprovedReplayConfiguration,symbol:string)=>symbol==='BTCUSDT'&&(usesAltReference(configuration)||configuration.strategies.every(s=>s.id==='crypto.team-alt'));
export function validateCoordinatedDatasets(configuration:ApprovedReplayConfiguration,datasets:readonly {symbol:string;timeframe:string;market_type?:string;market?:string}[]){
 if(!isCryptoTeam(configuration))return validateAltDatasetSelection(configuration,datasets);
 const research=(configuration as ApprovedReplayConfiguration&{researchOnly?:boolean}).researchOnly===true;
 if(research&&!CRYPTO_TEAM_PROFILE_IDS.some(id=>stable(coordinatedConfiguration(id))===stable(configuration)))throw Error('TEAM_FROZEN_CONFIGURATION_REQUIRED');
 if(!research&&configuration.strategies.some(s=>!CRYPTO_TEAM_ROLES.some(r=>r.id===s.id)||s.version!=='1.0.0'||Object.keys(s.parameters).length||s.maxBarsInTrade!==96||s.minScore<75||s.minRiskReward<1.5||s.timeframes.length!==1||s.timeframes[0]!=='15m'||!s.symbols.length))throw Error('TEAM_APPROVED_CONFIGURATION_INVALID');
 if(!datasets.length||datasets.length>4||datasets.filter(d=>d.symbol==='BTCUSDT').length!==1||new Set(datasets.map(d=>d.symbol)).size!==datasets.length||datasets.some(d=>d.timeframe!=='15m'||(d.market_type??d.market)!=='crypto'||!configuration.strategies.some(s=>s.symbols.includes(d.symbol))&&d.symbol!=='BTCUSDT'))throw Error('TEAM_BTC_AND_NATIVE_15M_DATASETS_REQUIRED');
 if(datasets.every(d=>referenceOnly(configuration,d.symbol)))throw Error('TEAM_TRADABLE_DATASET_REQUIRED');
}
