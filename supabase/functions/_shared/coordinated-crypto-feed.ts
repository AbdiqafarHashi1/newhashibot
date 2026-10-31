import {decodeNativeKline} from './native-kline.ts';
import {admitClosedRuntimeCandles} from './scanner-limits.ts';
/** Exactly one native futures request. No spot/account fallback and no execution credentials. */
export async function fetchCoordinatedCryptoHistory(symbol:string,asOf:number,fetcher:typeof fetch=fetch){
 if(!/^[A-Z0-9]{2,15}USDT$/.test(symbol)||!Number.isFinite(asOf))throw Error('TEAM_FEED_IDENTITY_INVALID');
 const response=await fetcher(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=961`,{signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error(`TEAM_NATIVE_PROVIDER_UNAVAILABLE:${response.status}`);
 const raw:unknown=await response.json();if(!Array.isArray(raw)||raw.length>961)throw Error('TEAM_NATIVE_RESPONSE_INVALID');
 const rows=raw.map(row=>{if(!Array.isArray(row))throw Error('TEAM_NATIVE_RESPONSE_INVALID');return decodeNativeKline(symbol,'15m',row,'USDT_PERPETUAL');});
 const admitted=admitClosedRuntimeCandles(rows,15,asOf);if(admitted.rejection||admitted.candles.length<960)throw Error('TEAM_NATIVE_CLOSED_HISTORY_REQUIRED');
 if(Date.parse(admitted.candles.at(-1)!.open_time)+900000!==Math.floor(asOf/900000)*900000)throw Error('TEAM_NATIVE_HISTORY_STALE');
 return admitted.candles.slice(-960);
}
