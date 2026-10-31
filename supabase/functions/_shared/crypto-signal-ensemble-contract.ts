import type {ReplayFillAssumptions} from './replay-outcomes.ts';
export const SIGNAL_ENSEMBLE_ID='crypto.signal-ensemble-v1';
export const SIGNAL_ENSEMBLE_VERSION='1.0.0';
export const SIGNAL_ENSEMBLE_ROLES=[
 {id:'crypto.sleeve-trend',name:'SignalTrendPullback',label:'Trend pullback',role:'TREND_PULLBACK'},
 {id:'crypto.sleeve-breakout',name:'SignalVolatilityBreakout',label:'Volatility breakout',role:'VOLATILITY_BREAKOUT'},
 {id:'crypto.sleeve-reversal',name:'SignalExhaustionReversal',label:'Exhaustion reversal',role:'EXHAUSTION_REVERSAL'},
 {id:'crypto.sleeve-relative',name:'SignalRelativeMomentum',label:'Relative-strength momentum',role:'RELATIVE_MOMENTUM'}
] as const;
export type SignalSleeveId=typeof SIGNAL_ENSEMBLE_ROLES[number]['id'];
export const SIGNAL_ENSEMBLE_SYMBOLS=Object.freeze(['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT']);
export const SIGNAL_ENSEMBLE_ASSUMPTIONS:Readonly<ReplayFillAssumptions>=Object.freeze({entryTiming:'NEXT_OPEN',feeBps:10,spreadBps:2,slippageBps:4,fundingBps:9,partialExitPct:0,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',maxBarsInTrade:96,closeAtHorizon:true});
