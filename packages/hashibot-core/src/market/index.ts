import { freeze, type DeepReadonly, type Evidence, type KnownState } from "../shared.ts";
export interface RawCandle { openTime:number; closeTime:number; open:number; high:number; low:number; close:number; volume:number; closed:boolean; }
export interface Candle extends RawCandle { symbol:string; timeframe:string; source:string; }
export interface MarketContext { symbol:string; timeframe:string; observedAt:string; state:KnownState; candles:readonly Candle[]; evidence:readonly Evidence[]; }
export function normalizeCandle(input:RawCandle,meta:{symbol:string;timeframe:string;source:string}):DeepReadonly<Candle>{
  const values=[input.openTime,input.closeTime,input.open,input.high,input.low,input.close,input.volume];
  if(values.some(v=>!Number.isFinite(v))||input.openTime>=input.closeTime||input.low>Math.min(input.open,input.close)||input.high<Math.max(input.open,input.close)||input.low>input.high||input.volume<0)throw new Error("INVALID_CANDLE");
  return freeze({...input,symbol:meta.symbol.trim().toUpperCase(),timeframe:meta.timeframe.trim().toLowerCase(),source:meta.source});
}
export function normalizeCandles(inputs:readonly RawCandle[],meta:{symbol:string;timeframe:string;source:string}):readonly DeepReadonly<Candle>[] {
  const out=inputs.map(x=>normalizeCandle(x,meta)).sort((a,b)=>a.openTime-b.openTime);
  if(out.some((x,i)=>i>0&&x.openTime<=out[i-1].openTime))throw new Error("DUPLICATE_OR_UNORDERED_CANDLE");
  return Object.freeze(out);
}
export interface IndicatorPort<T=unknown>{calculate(candles:readonly Candle[],context:{observedAt:string}):T;}
