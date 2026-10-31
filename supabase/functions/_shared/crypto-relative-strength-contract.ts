import type {ReplayFillAssumptions} from './replay-outcomes.ts';
export const ALT_CANDIDATE_ID='crypto.alt-relative-strength-v1';
export const ALT_SYMBOLS=Object.freeze(['BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT','BCHUSDT','NEARUSDT','TRXUSDT']);
export const ALT_CONTEXT_BARS=960;
export const ALT_ASSUMPTIONS:Readonly<ReplayFillAssumptions>=Object.freeze({entryTiming:'NEXT_OPEN',feeBps:10,spreadBps:2,slippageBps:4,fundingBps:9,partialExitPct:0,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',maxBarsInTrade:96,closeAtHorizon:true});
