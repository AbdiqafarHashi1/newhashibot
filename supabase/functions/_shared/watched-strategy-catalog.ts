import {goldFrontierDefinitions} from './gold-frontier-strategies.ts';
import {cryptoShortDefinitions} from './crypto-short-families.ts';
import {brokerStrategyDefinitions} from './broker-strategy-families.ts';
import {launchStrategyDefinitions} from './launch-strategy-families.ts';
import {ProfessionalStrategyRegistry,RESEARCH_STRATEGY_CONFIG,evaluateCryptoTrendPullback,evaluateReversalExhaustion,type StrategyDefinition,type StrategyRuntimeConfig} from './professional-strategies.ts';
import {evalMicroScalper,evalQuickScalp,evalCompressionBreakout,evalSwingContinuation} from './crypto-production-evaluators.ts';
import {FOREX_PRODUCTION_EVALUATORS} from './forex-production-strategies.ts';
import {FOREX_STRATEGY_CONTRACTS} from './forex-runtime-contracts.ts';
import {microScalperRuntimeParams} from './micro-scalper-runtime.ts';
import {coordinatedCryptoDefinitions} from './coordinated-crypto.ts';
import {signalEnsembleDefinitions} from './crypto-signal-ensemble.ts';
import {dailyTrendDefinitions} from './daily-trend.ts';
import {relativeWeaknessDefinitions} from './crypto-relative-weakness.ts';
import {altResearchDefinitions} from './crypto-relative-strength.ts';
import {regimeResearchDefinitions} from './regime-opportunities.ts';
import {intradayResearchDefinitions} from './intraday-opportunities.ts';
import {costAwareResearchDefinitions} from './cost-aware-opportunities.ts';
import {measuredRuntimeConfiguration} from './measured-strategy-runtime.ts';

export const CORE_WATCH_STRATEGIES=[
 {id:'crypto.micro-scalper',name:'MicroScalper',frames:['5m','15m'],hold:24,evaluate:evalMicroScalper},
 {id:'crypto.quick-scalp',name:'QuickScalp',frames:['5m','15m'],hold:12,evaluate:evalQuickScalp},
 {id:'crypto.compression-breakout',name:'CompressionBreakout',frames:['15m','1h'],hold:48,evaluate:evalCompressionBreakout},
 {id:'crypto.swing-continuation',name:'SwingContinuation',frames:['15m','1h'],hold:96,evaluate:evalSwingContinuation},
] as const;
/** Uses the real evaluator functions. Analysis configuration grants no account execution or research promotion. */
export function watchedStrategyCatalog(configurations:readonly any[]=[],releases:readonly any[]=[]):StrategyDefinition[] {
 const config=(name:string,frames:readonly string[],symbols:readonly string[],hold:number,id:string,version:string):StrategyRuntimeConfig=>{
  const r=configurations.find(r=>r.strategy_name===name);
  const base={strategy_name:name,config_source:r?'db':'missing',enabled:r?.enabled===true&&(!r.allowed_timeframes?.length||r.allowed_timeframes.some((tf:string)=>frames.includes(tf)))&&(!symbols.length||!r.allowed_symbols?.length||r.allowed_symbols.some((s:string)=>symbols.includes(s))),min_score:r?.min_score??(name==='QuickScalp'?82:name==='MicroScalper'?72:name.startsWith('Forex')||name==='GoldVolatilityBreakout'?78:75),min_rr:r?.min_rr??(name==='QuickScalp'?1.15:name.startsWith('Forex')||name==='GoldVolatilityBreakout'?1.4:1.2),max_bars_in_trade:r?.max_bars_in_trade??hold,allowed_symbols:r?.allowed_symbols?.length?r.allowed_symbols.filter((s:string)=>!symbols.length||symbols.includes(s)):[...symbols],allowed_timeframes:r?.allowed_timeframes?.length?r.allowed_timeframes.filter((tf:string)=>frames.includes(tf)):[...frames],params:{...r?.params}};
  const measured=measuredRuntimeConfiguration(name,base,[...releases],'A',{id,version});
  return measured.config_source?.startsWith('measured_release:')?measured:base;
 };
 const core:StrategyDefinition[]=CORE_WATCH_STRATEGIES.map(c=>{const cfg=config(c.name,c.frames,[],c.hold,c.id,'1.0.0');return {id:c.id,version:'1.0.0',legacyName:c.name,market:'crypto',lifecycle:'ENABLED',publicationMode:'LIVE',certification:'PRODUCTION',config:cfg,evaluate:ctx=>c.evaluate([...ctx.candles],ctx.indicators,ctx.timeframe,c.id==='crypto.micro-scalper'?microScalperRuntimeParams(cfg,ctx.timeframe).params:{...cfg.params,min_score:cfg.min_score,min_rr:cfg.min_rr,max_bars_in_trade:cfg.max_bars_in_trade,...(c.id==='crypto.quick-scalp'?{}:{crypto_behavior_tuning:1})},ctx.higher_timeframe_candles?[...ctx.higher_timeframe_candles]:undefined)};});
 for(const c of FOREX_STRATEGY_CONTRACTS){const cfg=config(c.legacyName,c.primaryTimeframes,c.symbols,c.id==='forex.micro-scalper'?24:48,c.id,c.version);core.push({id:c.id,version:c.version,legacyName:c.legacyName,market:'forex',lifecycle:'ENABLED',publicationMode:'LIVE',certification:'PRODUCTION',config:cfg,evaluate:ctx=>FOREX_PRODUCTION_EVALUATORS[c.id](ctx,{...cfg.params,min_score:cfg.min_score,min_rr:cfg.min_rr})});}
 const research=[...goldFrontierDefinitions(),...cryptoShortDefinitions(),...brokerStrategyDefinitions(),...launchStrategyDefinitions(),...regimeResearchDefinitions(),...intradayResearchDefinitions(),...altResearchDefinitions(),...relativeWeaknessDefinitions(),...signalEnsembleDefinitions(),...dailyTrendDefinitions(),...costAwareResearchDefinitions(),...coordinatedCryptoDefinitions(),
  ...[{id:'crypto.trend-pullback',name:'CryptoTrendPullback',evaluate:evaluateCryptoTrendPullback},{id:'crypto.reversal-exhaustion',name:'ReversalExhaustion',evaluate:evaluateReversalExhaustion}].map(c=>({id:c.id,version:'0.1.0-research',legacyName:c.name,market:'crypto' as const,lifecycle:'RESEARCH' as const,publicationMode:'SHADOW' as const,certification:'RESEARCH' as const,config:{...RESEARCH_STRATEGY_CONFIG,strategy_name:c.name},evaluate:c.evaluate}))];
 const seen=new Set(core.map(d=>d.id));
 for(const d of research){if(seen.has(d.id))throw Error(`DUPLICATE_WATCH_STRATEGY:${d.id}`);seen.add(d.id);
  const current=configurations.find(r=>r.strategy_name===d.legacyName),cfg=measuredRuntimeConfiguration(d.legacyName,{...d.config,...current,config_source:current?'db':'missing'},[...releases],'A',{id:d.id,version:d.version});
  const released=cfg.enabled===true&&cfg.config_source?.startsWith('measured_release:');
  core.push({...d,certification:released?'PRODUCTION':d.certification,lifecycle:released?'ENABLED':'DISABLED',publicationMode:released?'LIVE':'SHADOW',config:released?cfg:{...d.config,enabled:false}});
 }
 new ProfessionalStrategyRegistry(core); // validates inventory uniqueness at startup
 return core;
}
