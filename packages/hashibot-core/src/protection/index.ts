export * from "../../../../supabase/functions/_shared/professional-protection-verification.ts";
export type ProtectionAction="VERIFY_SL"|"VERIFY_TP"|"MOVE_TO_BREAKEVEN"|"TRAIL_STOP"|"PARTIAL_EXIT";
export interface ProtectionIntent {action:ProtectionAction;tradeId:string;executionScopeKey:string;expectedTruthVersion:number;idempotencyKey:string;correlationId:string;reason:string;quantity:number|null;price:number|null;}
