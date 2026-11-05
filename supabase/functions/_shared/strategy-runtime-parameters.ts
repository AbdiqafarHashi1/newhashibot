import type {StrategyDefinition} from './professional-strategies.ts';
/** Engine/version metadata stays in immutable configuration, never becomes an algorithm tuning parameter. */
export function strategyAlgorithmParameters(params:Record<string,number>){return Object.fromEntries(Object.entries(params).filter(([key])=>key!=='entry_engine_version'));}
export function watchedHistoryBars(definitions:readonly StrategyDefinition[],symbol:string,timeframe:string){
 return definitions.some(d=>d.config.enabled&&d.lifecycle==='ENABLED'&&d.config.allowed_timeframes.includes(timeframe)&&(!d.config.allowed_symbols.length||d.config.allowed_symbols.includes(symbol))&&/crypto\.(team-|sleeve-|alt-relative)/.test(d.id))?960:240;
}
