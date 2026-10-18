import type {StrategyCandle,StrategyIndicatorSnapshot} from './professional-strategies.ts';
export type AdaptiveMarketState='TREND_UP'|'TREND_DOWN'|'COMPRESSION'|'RANGE'|'TRANSITION'|'SHOCK'|'INVALID';
export interface AdaptiveMarketEvidence {version:'adaptive-market/v1';state:AdaptiveMarketState;efficiency:number;relativeAtr:number;barRangeAtr:number;trendAtr:number;valid:boolean}
/** Only closed trailing observations; ratios make thresholds comparable across instruments. */
export function observeAdaptiveMarket(candles:readonly StrategyCandle[],ind:StrategyIndicatorSnapshot):AdaptiveMarketEvidence {
 const invalid:AdaptiveMarketEvidence={version:'adaptive-market/v1',state:'INVALID',efficiency:0,relativeAtr:0,barRangeAtr:0,trendAtr:0,valid:false};
 if(candles.length<50||![ind.atr14,ind.ema20,ind.ema50].every(Number.isFinite)||ind.atr14<=0||candles.some((c,i)=>![c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.low<=0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||c.volume<0||!Number.isFinite(Date.parse(c.open_time))||(i>0&&Date.parse(c.open_time)<=Date.parse(candles[i-1].open_time))))return invalid;
 const recent=candles.slice(-21),travel=recent.slice(1).reduce((sum,c,i)=>sum+Math.abs(c.close-recent[i].close),0),efficiency=travel>0?Math.abs(recent.at(-1)!.close-recent[0].close)/travel:0;
 const ranges=candles.slice(-50,-14).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-(candles[candles.length-51+i]?.close??c.open)),Math.abs(c.low-(candles[candles.length-51+i]?.close??c.open)))).sort((a,b)=>a-b);
 const baseline=ranges[Math.floor(ranges.length/2)],relativeAtr=baseline>0?ind.atr14/baseline:0,last=candles.at(-1)!,barRangeAtr=(last.high-last.low)/ind.atr14,trendAtr=(ind.ema20-ind.ema50)/ind.atr14;
 let state:AdaptiveMarketState='TRANSITION';
 if(relativeAtr>2.5||barRangeAtr>3.5)state='SHOCK';
 else if(ind.range_compression_ratio<.55)state='COMPRESSION';
 else if(efficiency>=.25&&Math.abs(trendAtr)>=.6)state=trendAtr>0?'TREND_UP':'TREND_DOWN';
 else if(efficiency<.2&&Math.abs(trendAtr)<.6)state='RANGE';
 return {version:'adaptive-market/v1',state,efficiency,relativeAtr,barRangeAtr,trendAtr,valid:true};
}
export function adaptiveCandidateBlock(candidate:{strategyId:string;side:string;market:string},market:AdaptiveMarketEvidence):string|undefined {
 if(!market.valid)return 'adaptive_invalid_market_evidence';
 if(market.state==='SHOCK')return 'adaptive_volatility_shock';
 // Forex strategy-specific regime certification requires broker history; retain its existing gates.
 if(candidate.market!=='crypto')return;
 const trend=candidate.strategyId.includes('swing-continuation'),scalp=candidate.strategyId.includes('scalp');
 if((trend||scalp)&&market.state==='RANGE')return 'adaptive_range_unsuitable_for_continuation';
 if(trend&&market.state==='TRANSITION')return 'adaptive_transition_without_trend';
 if((trend||scalp)&&((market.state==='TREND_UP'&&candidate.side==='sell')||(market.state==='TREND_DOWN'&&candidate.side==='buy')))return 'adaptive_countertrend_continuation';
}
