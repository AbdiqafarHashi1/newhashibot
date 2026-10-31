import type {HistoricalDataset,CanonicalCandle,HistoricalProvider,HistoricalTimeframe} from './types';
import {hashHistoricalBars} from './HistoricalDataService';
import {normalizeAndValidate,TIMEFRAME_MS} from './validation';
import {normalizeUploadBars} from '../../../supabase/functions/_shared/validation-dataset-upload';
import {nativeCandleEvidence} from '../../../supabase/functions/_shared/native-candle-evidence';
/** Imports observed files into the same Lab registration path; never manufactures missing flow/quotes. */
export function importNativeDataset(text:string,now=Date.now()):HistoricalDataset{
 const input:unknown=JSON.parse(text);if(!Array.isArray(input)||!input.length||input.length>250000)throw Error('IMPORT_CANDLE_ARRAY_REQUIRED');
 const first=input[0] as Record<string,unknown>,symbol=String(first.symbol),timeframe=String(first.timeframe) as HistoricalTimeframe;
 if(!['crypto','forex'].includes(String(first.market_type)))throw Error('IMPORT_MARKET_REQUIRED');
 const provider:HistoricalProvider=first.instrument_type==='USDT_PERPETUAL'?'BINANCE_USDM':first.market_type==='crypto'?String(first.source).startsWith('BINANCE')?'BINANCE':String(first.source).startsWith('BYBIT')?'BYBIT':(()=>{throw Error('IMPORT_CRYPTO_SOURCE_UNSUPPORTED')})():String(first.source).startsWith('mt5_hashibridge:')?'MT5_BRIDGE':'CSV';
 const bars:CanonicalCandle[]=input.map((raw:Record<string,unknown>)=>{if(raw.symbol!==symbol||raw.timeframe!==timeframe||raw.market_type!==first.market_type)throw Error('IMPORT_MIXED_IDENTITIES');return{timestamp:Date.parse(String(raw.open_time)),open:Number(raw.open),high:Number(raw.high),low:Number(raw.low),close:Number(raw.close),volume:Number(raw.volume),source:String(raw.source),...nativeCandleEvidence(raw)} as CanonicalCandle;});
 const width=TIMEFRAME_MS[timeframe];if(!width||bars.some((b,i)=>!Number.isFinite(b.timestamp)||b.timestamp%width||b.timestamp+width>now||i>0&&b.timestamp<=bars[i-1].timestamp))throw Error('IMPORT_OPEN_UNORDERED_OR_UNALIGNED');
 const normalized=normalizeUploadBars({provider,symbol,timeframe},bars as unknown as Record<string,unknown>[]);if(normalized.length!==bars.length)throw Error('IMPORT_COUNT_MISMATCH');
 const range={from:bars[0].timestamp,to:bars.at(-1)!.timestamp},checked=normalizeAndValidate(bars,timeframe,range,'RESEARCH',now);
 if(checked.quality.invalidBars)throw Error('IMPORT_INVALID_OHLC');
 const dataHash=hashHistoricalBars(bars);return{bars,metadata:{provider,symbol,timeframe,from:range.from,to:range.to,requestedRange:range,actualCoverage:{ranges:[range],...range,barCount:bars.length},barCount:bars.length,timezone:'UTC',lastSync:new Date(now).toISOString(),quality:checked.quality,datasetVersion:1,datasetKey:`native-import:${symbol}:${timeframe}:${dataHash}`,dataHash,provenance:{provider,sourceSymbol:symbol,native:true,sourceName:provider==='BINANCE_USDM'?'BINANCE':provider==='MT5_BRIDGE'?'MT5':'CSV',sourceVersion:'operator-native-import/v1'}}};
}
