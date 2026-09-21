import { CANONICAL_STRATEGIES } from "../../supabase/functions/_shared/trading-domain/strategies.ts";
import type { HistoricalTimeframe } from "../../src/lib/historicalData/types.ts";

export type AcquisitionMarket="FOREX"|"METALS"|"CRYPTO";
export interface AcquisitionSpec {market:AcquisitionMarket;symbol:string;timeframe:HistoricalTimeframe;stage:"REQUIRED"|"SUPPORTING"}

/** The registry is authoritative; 5m is deliberately not part of initial certification acquisition. */
export function acquisitionPlan(){
  const universe:Record<AcquisitionMarket,readonly string[]>={FOREX:["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD"],METALS:["XAUUSD"],CRYPTO:["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT"]};
  const required=(Object.keys(universe) as AcquisitionMarket[]).flatMap(market=>{const timeframes=[...new Set(Object.values(CANONICAL_STRATEGIES).filter(s=>s.market===market).flatMap(s=>s.requirements.requiredTimeframes))] as HistoricalTimeframe[];return universe[market].flatMap(symbol=>timeframes.map(timeframe=>({market,symbol,timeframe,stage:"REQUIRED" as const}))) });
  const supporting=(Object.keys(universe) as AcquisitionMarket[]).flatMap(market=>universe[market].map(symbol=>({market,symbol,timeframe:"5m" as const,stage:"SUPPORTING" as const})));
  return {required,supporting};
}

export class ProviderCircuits {
  private readonly openUntil=new Map<string,number>();
  private readonly throttles=new Map<string,number>();
  constructor(private readonly now:()=>number=Date.now,private readonly dukascopyCooldownMs=60_000){}
  isOpen(provider:string){return (this.openUntil.get(provider)??0)>this.now()}
  record(provider:string,status:number|null){if((provider==="BINANCE"&&status===451)||(provider==="BYBIT"&&status===403))this.openUntil.set(provider,Infinity);else if(provider==="DUKASCOPY"&&status===429){const count=(this.throttles.get(provider)??0)+1;this.throttles.set(provider,count);if(count>=3)this.openUntil.set(provider,this.now()+this.dukascopyCooldownMs)}else if(provider==="DUKASCOPY"&&status!==null&&status<400)this.throttles.set(provider,0)}
}

export async function mapBounded<T,R>(values:readonly T[],limit:number,worker:(value:T,index:number)=>Promise<R>){
  const results=new Array<R>(values.length);let cursor=0,active=0,peak=0;
  await Promise.all(Array.from({length:Math.min(Math.max(1,limit),values.length)},async()=>{while(true){const index=cursor++;if(index>=values.length)return;active++;peak=Math.max(peak,active);try{results[index]=await worker(values[index],index)}finally{active--}}}));
  return {results,peak};
}

export class Semaphore {private active=0;private readonly waiting:Array<()=>void>=[];constructor(private readonly limit:number){}async run<T>(work:()=>Promise<T>){if(this.active>=this.limit)await new Promise<void>(resolve=>this.waiting.push(resolve));this.active++;try{return await work()}finally{this.active--;this.waiting.shift()?.()}}}

export function statusFromReadyMarkets(ready:number){return ready===3?"PASS":ready>0?"PARTIAL_REAL_DATA":"DATA_SOURCE_BLOCKED"}

export interface CertifiableDatasetRef {symbol:string;timeframe:HistoricalTimeframe;certifiable:boolean}
export interface MarketReadiness {
  status:"READY"|"DATA_SOURCE_BLOCKED";
  eligibleSymbols:string[];
  excludedSymbols:string[];
  exclusionReasons:Record<string,"INSUFFICIENT_OR_INVALID_DATA">;
}

/** Phase B readiness is based on complete symbols, rather than requiring every research-universe symbol. */
export function assessMarketReadiness(market:AcquisitionMarket,universe:readonly string[],datasets:readonly CertifiableDatasetRef[]):MarketReadiness{
  const required:readonly HistoricalTimeframe[]=market==="METALS"?["15m","1h","4h"]:["15m","1h"];
  const eligibleSymbols=universe.filter(symbol=>required.every(timeframe=>datasets.some(row=>row.symbol===symbol&&row.timeframe===timeframe&&row.certifiable)));
  const excludedSymbols=universe.filter(symbol=>!eligibleSymbols.includes(symbol));
  const minimum=market==="METALS"?1:3;
  return {status:eligibleSymbols.length>=minimum?"READY":"DATA_SOURCE_BLOCKED",eligibleSymbols,excludedSymbols,exclusionReasons:Object.fromEntries(excludedSymbols.map(symbol=>[symbol,"INSUFFICIENT_OR_INVALID_DATA" as const]))};
}

export interface SurvivorSymbol {market:AcquisitionMarket;strategyId:string;symbols:readonly string[]}
/** Stage 2 is deliberately driven by qualified, OOS-backed symbols, never the original universe. */
export function supportingPlanForSurvivors(survivors:readonly SurvivorSymbol[]){
  const plan=acquisitionPlan().supporting;
  const keys=new Set(survivors.flatMap(row=>row.symbols.map(symbol=>`${row.market}:${symbol}`)));
  return plan.filter(spec=>keys.has(`${spec.market}:${spec.symbol}`));
}

export function certificationStatus(marketStates:readonly {market:string;status:string;reason?:string}[]){
  const completed=marketStates.filter(x=>x.status==="READY"||x.status==="COMPLETED").length;
  const unavailable=marketStates.filter(x=>x.status==="DATA_SOURCE_BLOCKED"||x.status==="UNAVAILABLE").length;
  return completed===0?"DATA_SOURCE_BLOCKED":unavailable>0?"PARTIAL_REAL_DATA":"PASS";
}
