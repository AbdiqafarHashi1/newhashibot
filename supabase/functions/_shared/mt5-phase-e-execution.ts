import {rotationEntry} from './conditional-market.ts';
import {validateAtrTrailingPolicy,type AtrTrailingPolicy} from './atr-trailing-policy.ts';
/**
 * Phase E boundary between the Phase-D account decision and the existing MT5
 * certified planner/command transport.  This module is deliberately pure: it
 * does not replace the certified executor, HashiBridge, or trade manager.
 */
export const MT5_PHASE_E_VERSION = "mt5-phase-e/v1" as const;

export type Mt5DemoProvider = "MT5_PERSONAL" | "MT5_PROP";
export type Mt5LifecycleState =
  | "QUEUED" | "REJECTED" | "SUBMISSION_UNCERTAIN" | "PARTIALLY_FILLED"
  | "FILLED_PROTECTION_PENDING" | "PROTECTED" | "PROTECTION_INCIDENT"
  | "RECONCILING" | "BREAKEVEN" | "TP1_PROTECTED" | "TP2_CLOSED" | "CLOSED";

export interface PhaseDExecutionLineage {
  decisionId: string;
  intentId: string;
  signalId: string;
  customerId: string;
  executionAccountId: string;
  immutableAccountIdentity: string;
  provider: Mt5DemoProvider;
  decision: "ALLOW" | "REDUCE" | "BLOCK" | "LOCK";
  policyProfileId: string;
  policyVersion: string;
  brainVersion: string;
  authorizedRiskPct: number;
  approvedQuantity: number;
  evaluatedAt: string;
}

export interface Mt5RouteTruth {
  provider: Mt5DemoProvider;
  executionAccountId: string;
  mt5AccountId: string;
  customerId: string;
  immutableAccountIdentity: string;
  bridgeId: string | null;
  assignedBridgeId: string | null;
  accountMode: "PERSONAL" | "PROP_EVALUATION" | "PROP_FUNDED";
  environment: "DEMO" | "LIVE";
  liveAuthorized?: boolean; executionEnabled: boolean;
  operational: boolean;
  providerHealth: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  lastHeartbeatAt: string | null;
}

export interface Mt5EntryCommand {
  version: typeof MT5_PHASE_E_VERSION;
  operation: "OPEN_POSITION";
  idempotencyKey: string;
  accountId: string;
  customerId: string;
  bridgeId: string;
  payload: Readonly<Record<string, unknown>>;
}

export class Mt5PhaseERejection extends Error {
  constructor(readonly code: string) { super(code); this.name = "Mt5PhaseERejection"; }
}

function requireValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Mt5PhaseERejection(code);
}

/** Fail-closed validation performed immediately before the existing queue. */
export function createMt5EntryCommand(input: { authorizedRiskAmount?:number;
  lineage: PhaseDExecutionLineage;
  route: Mt5RouteTruth;
  executionPlanId: string;
  deterministicOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  now: string;
  maximumIntentAgeMs: number;
  nativeChildOrders?: readonly Record<string,unknown>[];
  maximumHoldingSeconds?:number;
  trailingPolicy?:AtrTrailingPolicy;
}): Readonly<Mt5EntryCommand> {
  const { lineage, route } = input;
  requireValue(rotationEntry(input.symbol,input.now,/^(BTC|ETH|SOL)USD(?:[._-].*)?$/.test(input.symbol)).allowed,'WEEKEND_FX_METALS_ENTRY_BLOCKED');
  requireValue(lineage.decision === "ALLOW" || lineage.decision === "REDUCE", "PHASE_D_DECISION_NOT_EXECUTABLE");
  requireValue(lineage.intentId.length > 0 && lineage.decisionId.length > 0, "PHASE_D_LINEAGE_MISSING");
  requireValue(lineage.customerId === route.customerId, "CUSTOMER_SCOPE_MISMATCH");
  requireValue(lineage.executionAccountId === route.executionAccountId, "ACCOUNT_SCOPE_MISMATCH");
  requireValue(lineage.immutableAccountIdentity === route.immutableAccountIdentity, "ACCOUNT_IDENTITY_MISMATCH");
  requireValue(lineage.provider === route.provider, "MT5_PROVIDER_SCOPE_MISMATCH");
  requireValue(route.bridgeId !== null && route.bridgeId === route.assignedBridgeId, "BRIDGE_ACCOUNT_SCOPE_MISMATCH");
  requireValue(route.environment === "DEMO" || (route.environment === "LIVE" && route.liveAuthorized === true), "LIVE_EXECUTION_FORBIDDEN");
  requireValue(lineage.provider === "MT5_PERSONAL" ? route.accountMode === "PERSONAL" : route.accountMode !== "PERSONAL", "MT5_ACCOUNT_MODE_MISMATCH");
  requireValue(route.executionEnabled && route.operational && route.providerHealth === "HEALTHY", "MT5_ACCOUNT_NOT_READY");
  const heartbeatAge = Date.parse(input.now) - Date.parse(route.lastHeartbeatAt ?? "");
  requireValue(Number.isFinite(heartbeatAge) && heartbeatAge >= 0 && heartbeatAge <= 45_000, "MT5_BRIDGE_HEARTBEAT_STALE");
  const intentAge = Date.parse(input.now) - Date.parse(lineage.evaluatedAt);
  requireValue(Number.isFinite(intentAge) && intentAge >= 0 && intentAge <= input.maximumIntentAgeMs, "MT5_INTENT_STALE");
  requireValue(Number.isFinite(lineage.approvedQuantity) && lineage.approvedQuantity > 0, "APPROVED_QUANTITY_INVALID");
  requireValue(Number.isFinite(lineage.authorizedRiskPct) && lineage.authorizedRiskPct > 0, "AUTHORIZED_RISK_INVALID");
  requireValue(Number.isFinite(input.stopLoss) && input.stopLoss > 0, "INITIAL_PROTECTION_REQUIRED");

  if(input.nativeChildOrders){
    const c=input.nativeChildOrders;
    // The certified planner can conserve a minimum-lot single-target allocation
    // as one ENTRY_TP2 child. It must never collapse two different targets.
    const single=c.length===1&&Number.isFinite(input.takeProfit1)&&input.takeProfit1>0&&input.takeProfit1===input.takeProfit2;
    requireValue((single||c.length===2)&&c.every((x,i)=>x.role===(single||i===1?'ENTRY_TP2':'ENTRY_TP1')&&(x.action===undefined||x.action==='market')&&x.symbol===input.symbol&&String(x.side).toUpperCase()===input.side&&Number(x.sl)===input.stopLoss&&Number(x.tp)===(single||i===1?input.takeProfit2:input.takeProfit1)&&Number.isFinite(Number(x.quantity))&&Number(x.quantity)>0)&&Math.abs(c.reduce((n,x)=>n+Number(x.quantity),0)-lineage.approvedQuantity)<1e-9,'MT5_CHILD_ALLOCATION_MISMATCH');
  }
  if(input.maximumHoldingSeconds!==undefined)requireValue(Number.isSafeInteger(input.maximumHoldingSeconds)&&input.maximumHoldingSeconds>=60&&input.maximumHoldingSeconds<=30*86400,'MT5_HOLDING_LIMIT_INVALID');
  if(input.trailingPolicy){validateAtrTrailingPolicy(input.trailingPolicy);requireValue(route.environment==='DEMO'&&input.maximumHoldingSeconds===86400&&input.takeProfit1===input.takeProfit2,'MT5_TRAILING_DEMO_CONTRACT_REQUIRED');}
  // Quantity and risk are copied from Phase D. MT5 is not permitted to resize.
  const payload = Object.freeze({
    certified: true,
    ...(input.trailingPolicy?{trailing_policy:Object.freeze({...input.trailingPolicy})}:{}),
    ...(input.maximumHoldingSeconds!==undefined?{maximum_holding_seconds:input.maximumHoldingSeconds}:{}),
    ...(input.nativeChildOrders?{native_child_orders:Object.freeze(input.nativeChildOrders.map(x=>Object.freeze({...x})))}:{}),
    execution_plan_id: input.executionPlanId,
    deterministic_identity: input.deterministicOrderId,
    signal_id: lineage.signalId,
    phase_d_decision_id: lineage.decisionId,
    phase_d_intent_id: lineage.intentId,
    customer_id: lineage.customerId,
    execution_account_id: lineage.executionAccountId,
    immutable_account_identity: lineage.immutableAccountIdentity,
    policy_profile_id: lineage.policyProfileId,
    policy_version: lineage.policyVersion,
    brain_version: lineage.brainVersion,
    phase_d_decision: lineage.decision,
    authorized_risk_amount:input.authorizedRiskAmount,
    authorized_risk_pct: lineage.authorizedRiskPct,
    quantity: lineage.approvedQuantity,
    symbol: input.symbol,
    side: input.side,
    stop_loss: input.stopLoss,
    take_profit_1: input.takeProfit1,
    take_profit_2: input.takeProfit2,
    protection_required: true,
  });
  return Object.freeze({ version: MT5_PHASE_E_VERSION, operation: "OPEN_POSITION", idempotencyKey: `${lineage.executionAccountId}:${lineage.intentId}:${input.deterministicOrderId}`, accountId: route.mt5AccountId, customerId: lineage.customerId, bridgeId: route.bridgeId, payload });
}

export type Mt5LifecycleEvent =
  | { type: "COMMAND_REJECTED" }
  | { type: "SUBMISSION_UNCERTAIN" }
  | { type: "PARTIAL_FILL" }
  | { type: "FILL_CONFIRMED" }
  | { type: "PROTECTION_CONFIRMED" }
  | { type: "PROTECTION_MISSING" | "PROTECTION_FAILED" }
  | { type: "RECONCILIATION_STARTED" }
  | { type: "TP1_FILLED" }
  | { type: "BREAKEVEN_CONFIRMED" }
  | { type: "TP2_FILLED" | "POSITION_CLOSED" };

/** Projection only; command creation remains owned by the existing trade manager. */
export function projectMt5Lifecycle(current: Mt5LifecycleState, event: Mt5LifecycleEvent): Mt5LifecycleState {
  if (event.type === "COMMAND_REJECTED") return "REJECTED";
  if (event.type === "SUBMISSION_UNCERTAIN") return "SUBMISSION_UNCERTAIN";
  if (event.type === "RECONCILIATION_STARTED") return "RECONCILING";
  if (event.type === "PARTIAL_FILL") return "PARTIALLY_FILLED";
  if (event.type === "FILL_CONFIRMED") return "FILLED_PROTECTION_PENDING";
  if (event.type === "PROTECTION_MISSING" || event.type === "PROTECTION_FAILED") return "PROTECTION_INCIDENT";
  if (event.type === "PROTECTION_CONFIRMED") return "PROTECTED";
  if (event.type === "TP1_FILLED") return "TP1_PROTECTED";
  if (event.type === "BREAKEVEN_CONFIRMED") return "BREAKEVEN";
  if (event.type === "POSITION_CLOSED") return "CLOSED";
  if (event.type === "TP2_FILLED") return "TP2_CLOSED";
  return current;
}

export function safeMt5AuditProjection(command: Mt5EntryCommand) {
  return Object.freeze({ version: command.version, operation: command.operation, idempotencyKey: command.idempotencyKey, accountId: command.accountId, customerId: command.customerId, bridgeId: command.bridgeId, payload: command.payload });
}

/** Convert only the certified immutable plan's holding instruction, never a user override. */
export function mt5HoldingSeconds(value:{bars:number;timeframe:string}|null|undefined){
 if(value==null)return undefined;
 const m=/^(\d+)(m|h|d)$/.exec(value.timeframe);
 const seconds=m?value.bars*Number(m[1])*(m[2]==='m'?60:m[2]==='h'?3600:86400):NaN;
 if(!Number.isSafeInteger(value.bars)||value.bars<1||!Number.isSafeInteger(seconds)||seconds<60||seconds>30*86400)throw new Mt5PhaseERejection('MT5_HOLDING_LIMIT_INVALID');
 return seconds;
}
