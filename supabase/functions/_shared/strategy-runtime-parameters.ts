import type {StrategyDefinition} from './professional-strategies.ts';
/** Engine/version metadata stays in immutable configuration, never becomes an algorithm tuning parameter. */
export function strategyAlgorithmParameters(params:Record<string,number>){return Object.fromEntries(Object.entries(params).filter(([key])=>key!=='entry_engine_version'));}
export function watchedHistoryBars(definitions:readonly StrategyDefinition[],symbol:string,timeframe:string){
 return definitions.some(d=>d.config.enabled&&d.lifecycle==='ENABLED'&&d.config.allowed_timeframes.includes(timeframe)&&(!d.config.allowed_symbols.length||d.config.allowed_symbols.includes(symbol))&&/(?:crypto\.(?:team-|sleeve-|alt-relative|launch-|native-|complementary-)|(?:forex|gold)\.(?:native-|complementary-))/.test(d.id))?960:240;
}

/** Keep the asset's lower and higher context on the native perpetual venue selected by its release. */
export function watchedCryptoInstrument(definitions:readonly StrategyDefinition[],symbol:string,timeframe?:string):'SPOT'|'USDT_PERPETUAL'{
 return definitions.some(d=>(!timeframe||d.config.allowed_timeframes.includes(timeframe))&&d.market==='crypto'&&/^crypto\.(?:launch-|native-)/.test(d.id)&&d.config.enabled&&d.lifecycle==='ENABLED'&&(!d.config.allowed_symbols.length||d.config.allowed_symbols.includes(symbol)))?'USDT_PERPETUAL':'SPOT';
}
