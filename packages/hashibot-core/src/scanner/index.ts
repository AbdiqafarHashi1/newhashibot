import type { Evidence, KnownState } from "../shared.ts";
import type { MarketContext } from "../market/index.ts";
export interface ScanRequest { runId:string; market:"crypto"|"forex"; symbols:readonly string[]; timeframes:readonly string[]; observedAt:string; }
export interface ScannerCandidate<T=unknown>{candidateId:string;symbol:string;timeframe:string;strategyIdentity:string;strategyVersion:string;state:KnownState;payload:T;evidence:readonly Evidence[];}
export interface ScannerRejection {symbol:string;timeframe:string;stage:"SYMBOL_FILTER"|"MARKET"|"STRATEGY"|"ARBITRATION"|"RISK"|"CAPITAL";reasons:readonly Evidence[];}
export interface ScanResult<T=unknown>{runId:string;candidates:readonly ScannerCandidate<T>[];rejections:readonly ScannerRejection[];startedAt:string;completedAt:string;}
export interface SymbolFilter { filter(symbols:readonly string[]):{accepted:readonly string[];rejected:readonly ScannerRejection[]}; }
export interface MarketLoader { load(symbol:string,timeframe:string,observedAt:string):Promise<MarketContext>; }
export interface ScannerStage<I,O>{readonly identity:string;run(input:I):O|Promise<O>;}
export interface CandidateSink { persist(result:ScanResult):Promise<void>; }
