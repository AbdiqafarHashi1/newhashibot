import type {StrategyCandle} from './professional-strategies.ts';
export const NATIVE_FIELDS=['instrument_type','quote_volume','trade_count','taker_buy_volume','taker_buy_quote_volume','ask_open','ask_high','ask_low','ask_close'] as const;
export function nativeCandleEvidence(value:Record<string,unknown>):Record<string,string|number>{
 const out:Record<string,string|number>={};
 for(const key of NATIVE_FIELDS){const v=value[key];if(v===undefined||v===null)continue;
  if(key==='instrument_type'){if(v!=='SPOT'&&v!=='USDT_PERPETUAL')throw Error('NATIVE_INSTRUMENT_INVALID');out[key]=v;}
  else {if(typeof v!=='number'||!Number.isFinite(v)||v<0||key==='trade_count'&&!Number.isSafeInteger(v))throw Error('NATIVE_EVIDENCE_INVALID:'+key);out[key]=v;}
 }
 const volume=Number(value.volume),quote=out.quote_volume;
 if(out.taker_buy_volume!==undefined&&(!Number.isFinite(volume)||Number(out.taker_buy_volume)>volume)||out.taker_buy_quote_volume!==undefined&&(quote===undefined||Number(out.taker_buy_quote_volume)>Number(quote)))throw Error('NATIVE_FLOW_RANGE_INVALID');
 const ask=['ask_open','ask_high','ask_low','ask_close'] as const,provided=ask.filter(k=>out[k]!==undefined);
 if(provided.length&&provided.length!==4)throw Error('NATIVE_ASK_INCOMPLETE');
 if(provided.length){for(const k of ask)if(Number(out[k])<Number(value[k.slice(4)]))throw Error('NATIVE_BID_ASK_CROSSED');
  if(Number(out.ask_high)<Math.max(Number(out.ask_open),Number(out.ask_close))||Number(out.ask_low)>Math.min(Number(out.ask_open),Number(out.ask_close)))throw Error('NATIVE_ASK_OHLC_INVALID');}
 return out;
}
export function storedValidationCandle(c:StrategyCandle){const {instrument_type,quote_volume,trade_count,taker_buy_volume,taker_buy_quote_volume,ask_open,ask_high,ask_low,ask_close,...base}=c;
 return {...base,native_evidence:nativeCandleEvidence({...c,instrument_type,quote_volume,trade_count,taker_buy_volume,taker_buy_quote_volume,ask_open,ask_high,ask_low,ask_close})};}
export function restoreValidationCandle(row:Record<string,unknown>):StrategyCandle{
 const {native_evidence,...base}=row;const core={...base,open_time:new Date(String(base.open_time)).toISOString(),open:Number(base.open),high:Number(base.high),low:Number(base.low),close:Number(base.close),volume:Number(base.volume)};
 if(native_evidence!==undefined&&(native_evidence===null||typeof native_evidence!=='object'||Array.isArray(native_evidence)))throw Error('NATIVE_EVIDENCE_OBJECT_REQUIRED');
 return {...core,...nativeCandleEvidence({...core,...native_evidence as Record<string,unknown>})} as unknown as StrategyCandle;
}
export const VALIDATION_CANDLE_SELECT='symbol,market_type,timeframe,open_time,open,high,low,close,volume,source,native_evidence';
export const MAX_STORED_CANDLES=250000;
