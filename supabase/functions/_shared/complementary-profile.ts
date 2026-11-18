import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
import {COMPLEMENTARY_VERSION} from './complementary-strategies.ts';
export const COMPLEMENTARY_ETH_PROFILE='crypto.complementary-eth-trend-v1';
export const COMPLEMENTARY_GOLD_PROFILE='forex.complementary-gold-trend-v1';
export const COMPLEMENTARY_PROFILES=[COMPLEMENTARY_ETH_PROFILE,COMPLEMENTARY_GOLD_PROFILE];
export const COMPLEMENTARY_CATALOG=[{id:COMPLEMENTARY_ETH_PROFILE,label:'ETH · 1h trend pullback',symbols:['ETHUSDT'],timeframe:'1h',costBps:25,warmupBars:960},{id:COMPLEMENTARY_GOLD_PROFILE,label:'Gold · 1h trend pullback',symbols:['XAUUSD'],timeframe:'1h',costBps:3,warmupBars:960}];
/** Runnable in the existing authenticated replay/ACCOUNT/PROP workflow. Research
 * eligibility is not a persisted release, customer entitlement or execution grant. */
export function complementaryConfiguration(id=COMPLEMENTARY_ETH_PROFILE):ApprovedReplayConfiguration&{researchOnly:true}{
 if(!COMPLEMENTARY_PROFILES.includes(id))throw Error('COMPLEMENTARY_PROFILE_UNKNOWN');
 const gold=id===COMPLEMENTARY_GOLD_PROFILE;
 return {researchOnly:true,version:id,minSignalGrade:'A',outcomeAssumptions:{entryTiming:'NEXT_OPEN',feeBps:gold?.7:20,spreadBps:gold?1.8:2,slippageBps:gold?.2:3,fundingBps:gold?.3:0,partialExitPct:.5,moveStopToBreakevenAfterTp1:true,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',tp1StopPolicy:'CONSERVATIVE_SAME_BAR',closeAtHorizon:true},strategies:[{id:gold?'forex.complementary-ema-pullback':'crypto.complementary-ema-pullback',version:COMPLEMENTARY_VERSION,enabled:true,minScore:75,minRiskReward:1,maxBarsInTrade:96,symbols:[gold?'XAUUSD':'ETHUSDT'],timeframes:['1h'],parameters:{entry_engine_version:1}}]};
}
export const isComplementaryProfile=(c:ApprovedReplayConfiguration)=>COMPLEMENTARY_PROFILES.includes(c.version);
const canonical=(value:unknown):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
export function validateComplementarySelection(c:ApprovedReplayConfiguration,rows:readonly {symbol:string;timeframe:string;market_type?:string;market?:string}[]){
 if(canonical(c)!==canonical(complementaryConfiguration(c.version)))throw Error('COMPLEMENTARY_FROZEN_CONFIGURATION_REQUIRED');
 const gold=c.version===COMPLEMENTARY_GOLD_PROFILE;
 if(rows.length!==1||rows[0].symbol!==(gold?'XAUUSD':'ETHUSDT')||rows[0].timeframe!=='1h'||(rows[0].market_type??rows[0].market)!==(gold?'forex':'crypto'))throw Error('COMPLEMENTARY_NATIVE_SCOPE_REQUIRED');
}
