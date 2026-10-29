import {ALT_WEAKNESS_ID} from './crypto-relative-weakness.ts';
import {TEN_REGIME_PROFILE,TEN_ASSET_PROFILES} from './ten-asset-contract.ts';
import {TEN_ASSET_PROFILE,TEN_ALT_SYMBOLS} from './ten-asset-contract.ts';
import {dailyConfiguration} from './daily-trend-profile.ts';
import {PROMISING_PAIR_PROFILE,DAILY_SYMBOLS} from './daily-trend-contract.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
export function tenAssetConfiguration():ApprovedReplayConfiguration&{researchOnly:true}{const c=dailyConfiguration(PROMISING_PAIR_PROFILE);return {...c,version:TEN_ASSET_PROFILE,strategies:c.strategies.map(s=>s.timeframes[0]==='15m'?{...s,symbols:[...TEN_ALT_SYMBOLS]}:s)};}
export const isTenAsset=(c:ApprovedReplayConfiguration)=>TEN_ASSET_PROFILES.includes(c.version);
const stable=(x:unknown):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?`[${x.map(stable)}]`:`{${Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
export function validateTenAssetSelection(c:ApprovedReplayConfiguration,d:readonly {symbol:string;timeframe:string;market_type?:string;market?:string}[]){
 if(![tenAssetConfiguration(),tenAssetRegimeConfiguration()].some(approved=>stable(c)===stable(approved)))throw Error('TEN_ASSET_FROZEN_CONFIGURATION_REQUIRED');
 if(d.length<3||d.length>11||new Set(d.map(x=>x.symbol+':'+x.timeframe)).size!==d.length||d.some(x=>(x.market_type??x.market)!=='crypto'||!(x.timeframe==='1d'&&DAILY_SYMBOLS.includes(x.symbol)||x.timeframe==='15m'&&['BTCUSDT',...TEN_ALT_SYMBOLS].includes(x.symbol)))||d.filter(x=>x.symbol==='BTCUSDT'&&x.timeframe==='15m').length!==1||!d.some(x=>x.timeframe==='15m'&&x.symbol!=='BTCUSDT')||!d.some(x=>x.timeframe==='1d'))throw Error('TEN_ASSET_NATIVE_SCOPE_REQUIRED');
}

export function tenAssetRegimeConfiguration():ApprovedReplayConfiguration&{researchOnly:true}{const c=tenAssetConfiguration();return {...c,version:TEN_REGIME_PROFILE,strategies:[...c.strategies,{...c.strategies[1],id:ALT_WEAKNESS_ID}]};}
