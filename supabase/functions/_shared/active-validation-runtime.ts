import { atrRootV1, emaRootV1, rsiRootV1 } from "./indicator-engine.ts";
import { FOREX_PRODUCTION_EVALUATORS, type ProductionEvaluatorId } from "./forex-production-strategies.ts";
import { FOREX_STRATEGY_CONTRACTS, forexStrategyEligibility } from "./forex-runtime-contracts.ts";
import { ProfessionalStrategyRegistry, type StrategyCandle, type StrategyDefinition, type StrategyIndicatorSnapshot, type StrategyRuntimeConfig } from "./professional-strategies.ts";

export interface ApprovedReplayStrategy { id:string; version:string; enabled:boolean; minScore:number; minRiskReward:number; maxBarsInTrade:number; symbols:string[]; timeframes:string[]; parameters:Record<string,number>; }
export interface ApprovedReplayConfiguration { version:string; strategies:ApprovedReplayStrategy[]; }

/** The scanner and validation runners share this exact indicator construction. */
export function calculateActiveIndicators(candles:readonly StrategyCandle[]):StrategyIndicatorSnapshot {
 if(candles.length<50)throw new Error("ACTIVE_SCANNER_REQUIRES_50_CANDLES");
 const closes=candles.map(c=>c.close), highs=candles.map(c=>c.high), lows=candles.map(c=>c.low), volumes=candles.map(c=>c.volume),last=candles.at(-1)!;
 const ema20=emaRootV1(closes,20),ema50=emaRootV1(closes,50),atr14=atrRootV1(candles as StrategyCandle[],14),rsi14=rsiRootV1(closes,14),recent_high=Math.max(...highs.slice(-20)),recent_low=Math.min(...lows.slice(-20)),avg_volume=volumes.slice(-20).reduce((a,b)=>a+b,0)/20,body_size=Math.abs(last.close-last.open),atr_pct=last.close>0?atr14/last.close*100:0;
 const older=candles.slice(-50,-20),olderRange=older.length?Math.max(...older.map(c=>c.high))-Math.min(...older.map(c=>c.low)):recent_high-recent_low,range_compression_ratio=olderRange>0?(recent_high-recent_low)/olderRange:1,recent=closes.slice(-4);let up=0,down=0;for(let i=1;i<recent.length;i++)recent[i]>recent[i-1]?up++:recent[i]<recent[i-1]?down++:0;const momentum_score=(up-down)/3,volatility_state=atr_pct>3?"high":atr_pct<.5?"low":"normal";let regime="unclear";if(ema20>ema50*1.002&&rsi14>52)regime="trend_up";else if(ema20<ema50*.998&&rsi14<48)regime="trend_down";else if(range_compression_ratio<.55)regime="compression";else if(atr_pct>2)regime="expansion";else if(rsi14>45&&rsi14<55)regime="ranging";
 return {ema20,ema50,atr14,rsi14,recent_high,recent_low,avg_volume,body_size,atr_pct,range_compression_ratio,momentum_score,volatility_state,regime};
}

/** Builds only definitions backed by the production evaluator registry; unknown or unapproved configuration fails closed. */
export function createApprovedReplayRegistry(config:ApprovedReplayConfiguration,symbol:string,timeframe:string):ProfessionalStrategyRegistry {
 if(!config.version||!config.strategies.length)throw new Error("APPROVED_SCANNER_CONFIGURATION_REQUIRED");
 const definitions:StrategyDefinition[]=[];
 for(const item of config.strategies.filter(s=>s.enabled)){
  const evaluator=FOREX_PRODUCTION_EVALUATORS[item.id as ProductionEvaluatorId],contract=FOREX_STRATEGY_CONTRACTS.find(c=>c.id===item.id);
  if(!evaluator||!contract)throw new Error(`ACTIVE_STRATEGY_EVALUATOR_UNAVAILABLE:${item.id}`);
  if(item.version!==contract.version)throw new Error(`ACTIVE_STRATEGY_VERSION_MISMATCH:${item.id}`);
  const eligibility=forexStrategyEligibility(contract,symbol);if(!eligibility.eligible||!item.timeframes.includes(timeframe))continue;
  const runtime:StrategyRuntimeConfig={strategy_name:contract.legacyName,enabled:true,min_score:item.minScore,min_rr:item.minRiskReward,max_bars_in_trade:item.maxBarsInTrade,allowed_symbols:item.symbols,allowed_timeframes:item.timeframes,params:item.parameters};
  definitions.push({id:contract.id,version:contract.version,legacyName:contract.legacyName,market:"forex",lifecycle:"ENABLED",publicationMode:"LIVE",certification:"PRODUCTION",config:runtime,evaluate:ctx=>evaluator(ctx,{...item.parameters,min_score:item.minScore,min_rr:item.minRiskReward})});
 }
 if(!definitions.length)throw new Error("NO_APPROVED_STRATEGY_FOR_SYMBOL_TIMEFRAME");
 return new ProfessionalStrategyRegistry(definitions);
}
