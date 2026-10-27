import {ALT_ASSUMPTIONS,ALT_SYMBOLS} from './crypto-relative-strength-contract.ts';
export const CRYPTO_TEAM_VERSION='1.0.0';
export const CRYPTO_TEAM_PROFILE='crypto.four-role-v1';
export const CRYPTO_TEAM_ROLES=[
 {id:'crypto.team-trend',name:'CryptoTrendContinuation',label:'Trend pullback',regime:'TREND',description:'H1 trend and H4 alignment; pullback reclaim, structural ATR protection.'},
 {id:'crypto.team-range',name:'CryptoRangeReversal',label:'Range reversal',regime:'RANGE',description:'Stable H1 balance; rejected boundary, target the mean; no fading trends.'},
 {id:'crypto.team-breakout',name:'CryptoExpansionBreakout',label:'Compression breakout',regime:'EXPANSION',description:'Closed H1 range break with native quote-volume expansion and H4 alignment.'},
 {id:'crypto.team-alt',name:'CryptoAltRelativeStrength',label:'Altcoin relative strength',regime:'TREND_UP_OR_EXPANSION_UP',description:'Frozen BTC-relative breakout arithmetic, restricted to the shared bullish regime.'}
] as const;
export type CryptoTeamId=typeof CRYPTO_TEAM_ROLES[number]['id'];
export const CRYPTO_TEAM_SYMBOLS=Object.freeze(['BTCUSDT','ETHUSDT',...ALT_SYMBOLS]);
export const CRYPTO_TEAM_ASSUMPTIONS=Object.freeze({...ALT_ASSUMPTIONS});
export const CRYPTO_TEAM_PROFILE_IDS=Object.freeze([CRYPTO_TEAM_PROFILE,...CRYPTO_TEAM_ROLES.map(r=>r.id)]);
export const CRYPTO_TEAM_CATALOG=Object.freeze([
 {id:CRYPTO_TEAM_PROFILE,label:'Four crypto roles together · research',symbols:[...CRYPTO_TEAM_SYMBOLS],costBps:25,warmupBars:960},
 ...CRYPTO_TEAM_ROLES.map(r=>({id:r.id,label:`${r.label} · coordinated research`,symbols:r.id==='crypto.team-alt'?[...ALT_SYMBOLS]:[...CRYPTO_TEAM_SYMBOLS],costBps:25,warmupBars:960}))
]);
