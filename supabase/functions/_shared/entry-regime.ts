import {observeAdaptiveMarket,type AdaptiveMarketEvidence} from './adaptive-market-policy.ts';
import {calculateActiveIndicators} from './active-validation-runtime.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export type EntryRegime='UPTREND'|'DOWNTREND'|'RANGE'|'COMPRESSION'|'VOLATILITY_EXPANSION'|'TRANSITION'|'ABNORMAL'|'UNAVAILABLE';
export interface EntryRegimeEvidence {policy:'entry-regime/v1';state:EntryRegime;direction:-1|0|1;current:AdaptiveMarketEvidence;prior:AdaptiveMarketEvidence;}
/** Reuses the existing causal classifier. Expansion compares the closed bar with prior context. */
export function classifyEntryRegime(rows:readonly StrategyCandle[]):EntryRegimeEvidence {
 const unavailable:AdaptiveMarketEvidence={version:'adaptive-market/v1',state:'INVALID',efficiency:0,relativeAtr:0,barRangeAtr:0,trendAtr:0,valid:false};
 if(rows.length<51)return {policy:'entry-regime/v1',state:'UNAVAILABLE',direction:0,current:unavailable,prior:unavailable};
 const current=observeAdaptiveMarket(rows,calculateActiveIndicators(rows)),prior=observeAdaptiveMarket(rows.slice(0,-1),calculateActiveIndicators(rows.slice(0,-1)));
 const map:Record<AdaptiveMarketEvidence['state'],EntryRegime>={TREND_UP:'UPTREND',TREND_DOWN:'DOWNTREND',COMPRESSION:'COMPRESSION',RANGE:'RANGE',TRANSITION:'TRANSITION',SHOCK:'ABNORMAL',INVALID:'UNAVAILABLE'};
 let state=map[current.state];
 if(current.valid&&prior.valid&&state!=='ABNORMAL'&&current.barRangeAtr>=1.5&&(prior.state==='COMPRESSION'||current.relativeAtr>=1.5))state='VOLATILITY_EXPANSION';
 const delta=rows.length>1?rows.at(-1)!.close-rows.at(-2)!.close:0;
 return {policy:'entry-regime/v1',state,direction:state==='UPTREND'?1:state==='DOWNTREND'?-1:state==='VOLATILITY_EXPANSION'?(delta>0?1:delta<0?-1:0):0,current,prior};
}
export function entryRegimeRejection(family:'TREND'|'BREAKOUT'|'REVERSAL',side:'buy'|'sell',e:EntryRegimeEvidence):string|undefined {
 if(e.state==='UNAVAILABLE')return 'REGIME_DATA_UNAVAILABLE';
 if(e.state==='ABNORMAL')return 'ABNORMAL_MARKET';
 const sign=side==='buy'?1:-1;
 if(family==='TREND'&&(e.state==='RANGE'||e.state==='COMPRESSION'||e.state==='TRANSITION'))return 'REGIME_INCOMPATIBLE_WITH_TREND';
 if(family==='TREND'&&e.direction!==sign)return 'REGIME_DIRECTION_CONFLICT';
 if(family==='REVERSAL'&&e.state==='VOLATILITY_EXPANSION'&&e.direction!==sign)return 'REVERSAL_AGAINST_EXPANSION';
 if(family==='BREAKOUT'&&e.state==='RANGE')return 'BREAKOUT_WITHOUT_EXPANSION';
}
