import type { AdapterType, CommandId, ISODateTime, SignalId, TradeId } from '../../packages/types/index.js';
import type { CommandState } from '../../packages/state-machines/index.js';
export type CommandAction='OpenPosition'|'ModifyPosition'|'ClosePosition'|'PartialClose'|'MoveStopLoss'|'MoveTakeProfit'|'StartTrailing'|'CancelOrder'|'Synchronize'|'RepairProtection'|'SafeClose';
export interface RetryPolicy { maxAttempts:number; backoffMs:number; retryableErrors:string[] }
export interface VerificationPolicy { required:boolean; timeoutMs:number; checks:string[] }
export interface Command<P=Record<string, unknown>> { id:CommandId; idempotencyKey:string; customerId:string; executorId:string; accountId:string; signalId?:SignalId; tradeId?:TradeId; adapterType:AdapterType; action:CommandAction; payload:P; state:CommandState; retryPolicy:RetryPolicy; verificationPolicy:VerificationPolicy; createdAt:ISODateTime; updatedAt:ISODateTime }
