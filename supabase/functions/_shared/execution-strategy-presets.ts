import {PERSONAL_GROWTH_STRATEGIES} from './strategy-deployment-policy.ts';
import {defaultTierStrategies} from './execution-tier-presets.ts';
import {COST_POSITIVE_CONFIG_IDS} from './cost-positive-configs.ts';
import {GOLD_RSI_TRAILING} from './atr-trailing-policy.ts';
import {EXECUTION_CANONICAL_REVIEWS} from './execution-canonical-reviews.ts';
import {FRONTIER_CANONICAL_REVIEWS} from './frontier-canonical-reviews.ts';
import {executionStrategyChoices} from './execution-strategy-selection.ts';
import {PROP_STRATEGY_BUNDLES} from './prop-strategy-bundles.ts';

/** Selection shortcuts only. Never alter risk, symbols, releases or account authorization. */
export function executionStrategyPresets(provider:string,environment:string,mode=provider.toUpperCase()==='MT5_PROP'?'PROP_EVALUATION':'PERSONAL'){
 if(!['MT5','MT5_PERSONAL','MT5_PROP','BINANCE','BYBIT'].includes(provider.toUpperCase())||!['demo','testnet','live'].includes(environment))return [];
 const available=new Set(executionStrategyChoices(provider,environment).map(c=>c.id));
 const reviewed=COST_POSITIVE_CONFIG_IDS.filter(id=>available.has(id));
 const productReviewed=mode==='PERSONAL'?reviewed.filter(id=>PERSONAL_GROWTH_STRATEGIES.includes(id)):reviewed;
 const definitions=[
  {id:'reviewed',label:provider.toUpperCase()==='MT5_PROP'?'Prop · reviewed Forex & Gold':'Personal · audited growth lineup',ids:defaultTierStrategies(provider,environment,mode)},
  {id:'all-reviewed-comparison',label:'Admin comparison · all earlier reviewed configurations',ids:reviewed},
  {id:'gold-trailing',label:'Gold · focused RSI trailing',ids:available.has(GOLD_RSI_TRAILING)&&EXECUTION_CANONICAL_REVIEWS.some(r=>r.strategyId===GOLD_RSI_TRAILING)?[GOLD_RSI_TRAILING]:[]},
  {id:'crypto-focused',label:'Crypto · focused trend pullback',ids:available.has('crypto.launch-trend-pullback-48-1.5-5')?['crypto.launch-trend-pullback-48-1.5-5']:[]},
  {id:'gold-momentum-focused',label:'Gold · focused momentum · 15m',ids:available.has('gold.native-momentum-15-48-2-5')?['gold.native-momentum-15-48-2-5']:[]},
  {id:'gold-compression',label:'Admin comparison · Gold compression · full 5R',ids:FRONTIER_CANONICAL_REVIEWS.map(r=>r.strategyId).filter(id=>available.has(id))},
  {id:'gold',label:'Gold · momentum & reversal',ids:productReviewed.filter(id=>id.startsWith('gold.')||id==='forex.complementary-ema-pullback')},
  {id:'forex',label:'Forex · reviewed setups',ids:productReviewed.filter(id=>id.startsWith('forex.')&&id!=='forex.complementary-ema-pullback')},
  {id:'crypto-swing',label:'Crypto · swing & pullback',ids:productReviewed.filter(id=>id.startsWith('crypto.')&&!id.includes('native-'))},
  {id:'crypto-intraday',label:'Crypto · reviewed reversal intraday',ids:productReviewed.filter(id=>id.startsWith('crypto.native-'))},
  {id:'prop-intraday',label:'Prop · intraday comparison',ids:provider.toUpperCase()==='MT5_PROP'?PROP_STRATEGY_BUNDLES.INTRADAY.ids.filter(id=>reviewed.includes(id)):[]},
 ];
 return definitions.filter(p=>p.ids.length>0);
}
const friendlyNames:Record<string,string>={
 [GOLD_RSI_TRAILING]:'Gold RSI trailing · 15m · one ATR after 2R',
 'gold.frontier-compression-15-24-1.5-5-h96':'Gold compression · 15m · 5R · up to 24h',
 'crypto.launch-trend-pullback-48-1.5-5':'Crypto trend pullback · 1.5 ATR / 5R',
 'crypto.launch-trend-pullback-48-2-3-h72':'Crypto trend pullback · 2 ATR / 3R',
 'crypto.launch-rsi2-48-3-3-h72':'Crypto RSI reversal · 3 ATR / 3R',
 'crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006':'DOGE VWAP reclaim · 5m · 1.5R',
 'crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006':'LTC failed breakout · 15m · 1.5R',
 'gold.native-momentum-15-48-2-5':'Gold momentum · 15m · 5R',
 'gold.native-momentum-60-24-2-5':'Gold momentum · 1h · 5R',
 'gold.native-band-reentry-15-48-3-5':'Gold range re-entry · 15m · 5R',
 'forex.native-band-reentry-60-12-2-5':'USDJPY range re-entry · 1h · 5R',
 'forex.native-sweep-retest-60-16-2-5-usdjpy-h72':'USDJPY sweep & retest · 1h · 5R',
 'forex.native-squeeze-15-48-2-3-usdjpy-h12':'USDJPY compression breakout · 15m · 3R',
 'forex.native-rsi2-15-48-2-5-gbpusd-h24-v0.0008':'GBPUSD RSI reversal · 15m · 5R',
};
export function executionStrategyDisplayName(id:string,fallback:string){return friendlyNames[id]??fallback;}
export function executionStrategyEvidence(id:string){return EXECUTION_CANONICAL_REVIEWS.find(r=>r.strategyId===id)??null;}
