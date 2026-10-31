import {fetchCoordinatedCryptoHistory} from './coordinated-crypto-feed.ts';
import {coordinatedConfiguration} from './coordinated-crypto.ts';
import {CRYPTO_TEAM_PROFILE_IDS} from './coordinated-crypto-contract.ts';
import type {ShadowAdapter} from './shadow-observer.ts';
export async function prepareCoordinatedShadow(input:{researchCandidateId?:string;provider:string;symbol:string;timeframe:string}){
 if(!input.researchCandidateId)return null;
 if(!CRYPTO_TEAM_PROFILE_IDS.includes(input.researchCandidateId)||input.provider!=='BINANCE'||input.timeframe!=='15m')throw Error('TEAM_SHADOW_SOURCE_INVALID');
 const configuration=coordinatedConfiguration(input.researchCandidateId);if(!configuration.strategies.some(s=>s.symbols.includes(input.symbol)))throw Error('TEAM_SHADOW_SYMBOL_INELIGIBLE');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(configuration))))].map(n=>n.toString(16).padStart(2,'0')).join('');return{configuration,hash};
}
/** Observes the latest newly closed H1 decision only; never backfills historical alerts. */
export class CoordinatedCryptoShadowAdapter implements ShadowAdapter {
 constructor(private readonly symbol:string,private readonly fetcher:typeof fetch=fetch,private readonly now:()=>number=Date.now){}
 async observe(input:{after:string|null;maxRequests:number;signal:AbortSignal}){
  const at=Math.floor(this.now()/3600000)*3600000,closedAt=new Date(at).toISOString();if(input.after&&Date.parse(input.after)>=at)return[];
  if(input.maxRequests<(this.symbol==='BTCUSDT'?1:2))throw Error('TEAM_SHADOW_REQUEST_BUDGET_REQUIRED');
  const scoped:typeof fetch=async(url,options)=>{if(input.signal.aborted)throw Error('SHADOW_CANCELLED');const target=new URL(String(url));target.searchParams.set('endTime',String(at-1));const response=await this.fetcher(target,options);if(input.signal.aborted)throw Error('SHADOW_CANCELLED');return response;};
  const candles=await fetchCoordinatedCryptoHistory(this.symbol,at,scoped),referenceCandles=this.symbol==='BTCUSDT'?candles:await fetchCoordinatedCryptoHistory('BTCUSDT',at,scoped);
  return[{source:'BINANCE_USDM_KLINES',provenance:'NATIVE_FUTURES_CLOSED_HOUR_SHADOW',symbol:this.symbol,market:'crypto' as const,timeframe:'15m',candles,referenceCandles,closedAt,observedAt:new Date(this.now()).toISOString(),observationGapHours:input.after?Math.max(0,(at-Date.parse(input.after))/3600000-1):0}];
 }
}
