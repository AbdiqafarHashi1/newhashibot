import {strategyById} from "./strategies.ts";
export type ProductionBoundary="CANDIDATE_PERSISTENCE"|"SIGNAL_TRUTH"|"TELEGRAM"|"EXECUTION_PLANNING"|"CUSTOMER_ROUTING"|"BROKER_SUBMISSION";
export function assertProductionBoundary(strategyId:string,boundary:ProductionBoundary):void {const strategy=strategyById(strategyId);if(strategy.status!=="CANONICAL")throw new Error(`RESEARCH_STRATEGY_PRODUCTION_BOUNDARY_BLOCKED:${strategyId}:${boundary}`);}
export function mayCrossProductionBoundary(strategyId:string):boolean {try{assertProductionBoundary(strategyId,"SIGNAL_TRUTH");return true;}catch{return false;}}
