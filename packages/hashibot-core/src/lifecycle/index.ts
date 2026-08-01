import type { Correlation, Evidence } from "../shared.ts";
export type TradeState="PLANNED"|"SUBMITTED"|"OPEN"|"PROTECTED"|"PARTIALLY_CLOSED"|"CLOSED"|"RECOVERY_REQUIRED"|"FAILED";
export interface TradeTruth {tradeId:string;state:TradeState;truthVersion:number;updatedAt:string;evidence:readonly Evidence[];}
export interface TradeTransition extends Correlation {transitionId:string;tradeId:string;from:TradeState;to:TradeState;expectedTruthVersion:number;occurredAt:string;evidence:readonly Evidence[];}
const ALLOWED:Readonly<Record<TradeState,readonly TradeState[]>>={PLANNED:["SUBMITTED","FAILED"],SUBMITTED:["OPEN","FAILED","RECOVERY_REQUIRED"],OPEN:["PROTECTED","PARTIALLY_CLOSED","CLOSED","RECOVERY_REQUIRED"],PROTECTED:["PARTIALLY_CLOSED","CLOSED","RECOVERY_REQUIRED"],PARTIALLY_CLOSED:["PROTECTED","CLOSED","RECOVERY_REQUIRED"],RECOVERY_REQUIRED:["OPEN","PROTECTED","PARTIALLY_CLOSED","CLOSED","FAILED"],CLOSED:[],FAILED:[]};
export function validateTransition(current:TradeTruth,next:TradeTransition):void{if(current.tradeId!==next.tradeId)throw new Error("TRADE_ID_MISMATCH");if(current.truthVersion!==next.expectedTruthVersion)throw new Error("STALE_TRUTH_VERSION");if(current.state!==next.from||!ALLOWED[current.state].includes(next.to))throw new Error("INVALID_TRADE_TRANSITION");}
export interface TradeTruthRepository {load(tradeId:string):Promise<TradeTruth|null>;compareAndSet(transition:TradeTransition):Promise<TradeTruth>;}
export interface ReconciliationSnapshot {trade:TradeTruth;providerObservedAt:string;providerPositionKnown:boolean;providerOrderIds:readonly string[];}
