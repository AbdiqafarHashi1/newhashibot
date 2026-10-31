import {DAILY_PROFILES,DAILY_TREND_ID,DAILY_TREND_PROFILE,PROMISING_PAIR_PROFILE,DAILY_SYMBOLS} from './daily-trend-contract.ts';
import {altReplayConfiguration} from './crypto-relative-strength.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
import type {ReplayFillAssumptions} from './replay-outcomes.ts';
export {DAILY_PROFILES} from './daily-trend-contract.ts';
export const DAILY_ASSUMPTIONS:Readonly<ReplayFillAssumptions>={entryTiming:'NEXT_OPEN',feeBps:20,spreadBps:2,slippageBps:4,fundingBps:0,partialExitPct:0,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',closeAtHorizon:false};
export function dailyConfiguration(id=DAILY_TREND_PROFILE):ApprovedReplayConfiguration&{researchOnly:true}{
 if(!DAILY_PROFILES.includes(id))throw Error('DAILY_PROFILE_UNKNOWN');
 return {researchOnly:true,version:id,minSignalGrade:'A',outcomeAssumptions:id===PROMISING_PAIR_PROFILE?{...altReplayConfiguration().outcomeAssumptions!}:{...DAILY_ASSUMPTIONS},strategies:[{id:DAILY_TREND_ID,version:'1.0.0',enabled:true,minScore:75,minRiskReward:0,maxBarsInTrade:3650,symbols:[...DAILY_SYMBOLS],timeframes:['1d'],parameters:{}},...(id===PROMISING_PAIR_PROFILE?altReplayConfiguration().strategies.map(s=>({...s,symbols:['BNBUSDT','SOLUSDT','XRPUSDT']})):[])]};
}
export const hasDaily=(c:ApprovedReplayConfiguration)=>c.strategies.some(s=>s.id===DAILY_TREND_ID);
const stable=(x:unknown):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?`[${x.map(stable)}]`:`{${Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
export function validateDailySelection(c:ApprovedReplayConfiguration,d:readonly {symbol:string;timeframe:string;market_type?:string;market?:string}[]){
 if(!DAILY_PROFILES.some(id=>stable(c)===stable(dailyConfiguration(id))))throw Error('DAILY_FROZEN_CONFIGURATION_REQUIRED');
 const pair=c.version===PROMISING_PAIR_PROFILE;
 if(!d.length||d.length>(pair?6:2)||new Set(d.map(x=>x.symbol+':'+x.timeframe)).size!==d.length||d.some(x=>(x.market_type??x.market)!=='crypto'||!(x.timeframe==='1d'&&DAILY_SYMBOLS.includes(x.symbol)||pair&&x.timeframe==='15m'&&['BTCUSDT','BNBUSDT','SOLUSDT','XRPUSDT'].includes(x.symbol)))||!d.some(x=>x.timeframe==='1d')||pair&&(d.filter(x=>x.timeframe==='15m'&&x.symbol==='BTCUSDT').length!==1||!d.some(x=>x.timeframe==='15m'&&x.symbol!=='BTCUSDT')))throw Error('DAILY_NATIVE_SCOPE_REQUIRED');
}
export function dailyOutcomeAssumptions(id:string,fallback:ReplayFillAssumptions):ReplayFillAssumptions{return id===DAILY_TREND_ID?{...DAILY_ASSUMPTIONS}:fallback;}
