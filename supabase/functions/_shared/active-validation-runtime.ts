import {relativeWeaknessDefinitions} from './crypto-relative-weakness.ts';
import {dailyTrendDefinitions} from './daily-trend.ts';
import {signalEnsembleDefinitions} from './crypto-signal-ensemble.ts';
import {coordinatedCryptoDefinitions} from './coordinated-crypto.ts';
import {altResearchDefinitions} from './crypto-relative-strength.ts';
import {microScalperRuntimeParams} from "./micro-scalper-runtime.ts";
import {regimeResearchDefinitions} from './regime-opportunities.ts';
import {intradayResearchDefinitions} from './intraday-opportunities.ts';
import {costAwareResearchDefinitions} from './cost-aware-opportunities.ts';
import { atrRootV1, emaRootV1, rsiRootV1 } from "./indicator-engine.ts";
import { FOREX_PRODUCTION_EVALUATORS, type ProductionEvaluatorId } from "./forex-production-strategies.ts";
import { FOREX_STRATEGY_CONTRACTS, forexStrategyEligibility } from "./forex-runtime-contracts.ts";
import { calculateGarmanKlassVolatility } from "./predictive-intelligence.ts";
import { evalMicroScalper,evalQuickScalp,evalCompressionBreakout,evalSwingContinuation } from "./crypto-production-evaluators.ts";
import { ProfessionalStrategyRegistry, type StrategyCandle, type StrategyDefinition, type StrategyIndicatorSnapshot, type StrategyRuntimeConfig } from "./professional-strategies.ts";

export interface ApprovedReplayStrategy { id:string; version:string; enabled:boolean; minScore:number; minRiskReward:number; maxBarsInTrade:number; minStopDistancePct?:number; minTp1DistancePct?:number; minTp2DistancePct?:number; symbols:string[]; timeframes:string[]; parameters:Record<string,number>; }
export interface ApprovedReplayConfiguration { version:string; minSignalGrade:string; strategies:ApprovedReplayStrategy[]; outcomeAssumptions?:import("./replay-outcomes.ts").ReplayFillAssumptions; }

/** The scanner and validation runners share this exact indicator construction. */
export function calculateActiveIndicators(candles:readonly StrategyCandle[]):StrategyIndicatorSnapshot {
 if(candles.length<50)throw new Error("ACTIVE_SCANNER_REQUIRES_50_CANDLES");
 const closes=candles.map(c=>c.close), highs=candles.map(c=>c.high), lows=candles.map(c=>c.low), volumes=candles.map(c=>c.volume),last=candles.at(-1)!;
 const ema20=emaRootV1(closes,20),ema50=emaRootV1(closes,50),atr14=atrRootV1(candles as StrategyCandle[],14),rsi14=rsiRootV1(closes,14),recent_high=Math.max(...highs.slice(-20)),recent_low=Math.min(...lows.slice(-20)),avg_volume=volumes.slice(-20).reduce((a,b)=>a+b,0)/20,body_size=Math.abs(last.close-last.open),atr_pct=last.close>0?atr14/last.close*100:0;
 const older=candles.slice(-50,-20),olderRange=older.length?Math.max(...older.map(c=>c.high))-Math.min(...older.map(c=>c.low)):recent_high-recent_low,range_compression_ratio=olderRange>0?(recent_high-recent_low)/olderRange:1,recent=closes.slice(-4);let up=0,down=0;for(let i=1;i<recent.length;i++)recent[i]>recent[i-1]?up++:recent[i]<recent[i-1]?down++:0;const momentum_score=(up-down)/3,gk_volatility=calculateGarmanKlassVolatility(candles as StrategyCandle[]),volatility_state=atr_pct>3||gk_volatility>.0018?"high":atr_pct<.5&&gk_volatility<.0002?"low":"normal";let regime="unclear";if(ema20>ema50*1.002&&rsi14>52)regime="trend_up";else if(ema20<ema50*.998&&rsi14<48)regime="trend_down";else if(range_compression_ratio<.55)regime="compression";else if(atr_pct>2||gk_volatility>.0025)regime="expansion";else if(rsi14>45&&rsi14<55)regime="ranging";
 return {ema20,ema50,atr14,rsi14,recent_high,recent_low,avg_volume,body_size,atr_pct,range_compression_ratio,momentum_score,volatility_state,regime,gk_volatility};
}

/** Builds only definitions backed by the production evaluator registry; unknown or unapproved configuration fails closed. */
export function createApprovedReplayRegistry(config:ApprovedReplayConfiguration,symbol:string,timeframe:string):ProfessionalStrategyRegistry {
 if(!config.version||!config.strategies.length)throw new Error("APPROVED_SCANNER_CONFIGURATION_REQUIRED");
 const definitions:StrategyDefinition[]=[],researchDefinitions=[...regimeResearchDefinitions(),...intradayResearchDefinitions(),...costAwareResearchDefinitions(),...altResearchDefinitions(),...coordinatedCryptoDefinitions(),...signalEnsembleDefinitions(),...dailyTrendDefinitions(),...relativeWeaknessDefinitions()];
 for(const item of config.strategies.filter(s=>s.enabled)){
  const regime=researchDefinitions.find(s=>s.id===item.id);
  if(regime){
   if(item.version!==regime.version)throw new Error(`ACTIVE_STRATEGY_VERSION_MISMATCH:${item.id}`);
   if(!regime.config.allowed_timeframes.includes(timeframe)||!regime.config.allowed_symbols.includes(symbol)||!item.timeframes.includes(timeframe)||(item.symbols.length&&!item.symbols.includes(symbol)))continue;
   // Counterfactual replay eligibility is not a production publication grant.
   const params={...regime.config.params,...item.parameters};
   definitions.push({...regime,lifecycle:'ENABLED',publicationMode:'LIVE',config:{...regime.config,enabled:true,min_score:item.minScore,min_rr:item.minRiskReward,max_bars_in_trade:item.maxBarsInTrade,params},evaluate:ctx=>regime.evaluate({...ctx,strategy_parameters:params})});
   continue;
  }
  const contract=FOREX_STRATEGY_CONTRACTS.find(c=>c.id===item.id),forexEvaluator=FOREX_PRODUCTION_EVALUATORS[item.id as ProductionEvaluatorId],crypto={"crypto.micro-scalper":{name:"MicroScalper",evaluate:evalMicroScalper},"crypto.quick-scalp":{name:"QuickScalp",evaluate:evalQuickScalp},"crypto.compression-breakout":{name:"CompressionBreakout",evaluate:evalCompressionBreakout},"crypto.swing-continuation":{name:"SwingContinuation",evaluate:evalSwingContinuation}}[item.id as "crypto.micro-scalper"];
  if(!contract&&!crypto)throw new Error(`ACTIVE_STRATEGY_EVALUATOR_UNAVAILABLE:${item.id}`);if(item.version!=="1.0.0")throw new Error(`ACTIVE_STRATEGY_VERSION_MISMATCH:${item.id}`);if(!item.timeframes.includes(timeframe)||(item.symbols.length&&!item.symbols.includes(symbol)))continue;
  if(crypto&&!/^[A-Z0-9]{2,15}USDT$/.test(symbol))continue;
  if(contract&&!forexStrategyEligibility(contract,symbol).eligible)continue;
  const legacyName=contract?.legacyName??crypto!.name,market=contract?"forex":"crypto",runtime:StrategyRuntimeConfig={strategy_name:legacyName,enabled:true,min_score:item.minScore,min_rr:item.minRiskReward,max_bars_in_trade:item.maxBarsInTrade,min_stop_distance_pct:item.minStopDistancePct??0,min_tp1_distance_pct:item.minTp1DistancePct??0,min_tp2_distance_pct:item.minTp2DistancePct??0,allowed_symbols:item.symbols,allowed_timeframes:item.timeframes,params:item.parameters};
  definitions.push({id:item.id,version:item.version,legacyName,market,lifecycle:"ENABLED",publicationMode:"LIVE",certification:"PRODUCTION",config:runtime,evaluate:ctx=>contract?forexEvaluator!(ctx,{...item.parameters,min_score:item.minScore,min_rr:item.minRiskReward}):crypto!.evaluate(ctx.candles as StrategyCandle[],ctx.indicators,ctx.timeframe,item.id==="crypto.micro-scalper"?microScalperRuntimeParams(runtime,ctx.timeframe).params:{...item.parameters,min_score:item.minScore,min_rr:item.minRiskReward,max_bars_in_trade:item.maxBarsInTrade,...(item.id!=="crypto.quick-scalp"?{crypto_behavior_tuning:1}:{})},ctx.higher_timeframe_candles as StrategyCandle[]|undefined)});
 }
 if(!definitions.length)throw new Error("NO_APPROVED_STRATEGY_FOR_SYMBOL_TIMEFRAME");
 return new ProfessionalStrategyRegistry(definitions);
}
