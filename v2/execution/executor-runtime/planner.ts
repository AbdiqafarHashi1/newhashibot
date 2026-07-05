import type { Signal, CustomerProfile, CustomerAccount, RiskProfile, AdapterType } from '../../packages/types/index.js';
import type { Command } from '../command-queue/index.js';
export interface PlatformCapabilities { adapterType:AdapterType; supportsTrailing:boolean; supportsPartialClose:boolean; maxLeverage?:number }
export interface OpenExposure { symbol:string; notional:number; riskPct:number }
export interface ExecutionPlannerInput { approvedSignal:Signal; customerProfile:CustomerProfile; accountProfile:CustomerAccount; executorState:string; riskProfile:RiskProfile; openExposure:OpenExposure[]; platformCapabilities:PlatformCapabilities }
export interface ProtectionPlan { stopLoss:number; takeProfits:readonly number[]; verifyAfterMs:number }
export interface ExecutionPlannerOutput { approved:boolean; reason:string; positionSize?:number; leverage?:number; adapterTarget?:AdapterType; commandPlan:readonly Command[]; protectionPlan?:ProtectionPlan }
