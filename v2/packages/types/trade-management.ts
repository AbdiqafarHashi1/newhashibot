export interface DesiredTradeState { tradeId:string; stopLoss?:number; takeProfits:readonly number[]; targetExposure:number }
export interface ActualTradeState { tradeId:string; stopLoss?:number; takeProfits:readonly number[]; currentExposure:number; source:string }
export interface ProtectionCheckResult { tradeId:string; verified:boolean; repairNeeded:boolean; reasons:readonly string[] }
export interface ProtectionRepairPlan { tradeId:string; actions:readonly string[]; safeCloseIfRepairFails:boolean }
export interface TradeManagementRule { ruleId:string; enabled:boolean; description:string }
export interface BreakEvenRule extends TradeManagementRule { triggerR:number; offsetPoints:number }
export interface TrailingStopRule extends TradeManagementRule { trailDistance:number; activationR:number }
export interface PartialCloseRule extends TradeManagementRule { closePct:number; triggerR:number }
export interface TimeExitRule extends TradeManagementRule { maxDuration:string }
export interface RecoveryPlan { recoveryId:string; tradeId:string; steps:readonly string[]; maxRetries:number }
export interface SafeClosePlan { tradeId:string; reason:string; commandIds:readonly string[] }
