import type { EligibilityDecision, EligibilityProduct } from "./trading-domain/production-eligibility-router.ts";

export const ACCOUNT_EXECUTION_CONTROLLER_VERSION = "account-execution-controller/v1" as const;
export type AccountRuntimeControl = "START" | "PAUSE_NEW_ENTRIES" | "RESUME" | "MANAGE_ONLY" | "STOP_AFTER_FLAT" | "EMERGENCY_STOP";
export type ExecutionProduct = Exclude<EligibilityProduct, "SIGNAL_ONLY">;
export interface AccountExecutionGateInput {
  attempt: "NEW_ENTRY" | "MANAGE_EXISTING";
  signalId: string;
  accountId: string;
  customerId: string;
  product: EligibilityProduct;
  assignedProvider: "MT5_PERSONAL" | "MT5_PROP" | "BINANCE" | "BYBIT";
  requestedProvider: "MT5_PERSONAL" | "MT5_PROP" | "BINANCE" | "BYBIT";
  eligibility: EligibilityDecision;
  runtimeControl: AccountRuntimeControl;
  openPositions: number;
  pendingOrders: number;
  duplicateSignalForAccount: boolean;
  activeSymbolConflict: boolean;
  canonicalRiskApproved: boolean;
  canonicalCapitalApproved: boolean;
  accountRuleApproved: boolean;
  propDecision?: { decision: "ALLOW" | "REDUCE" | "BLOCK"; reasonCodes: readonly string[]; riskMultiplier: number; managementEnabled: boolean } | null;
}
export interface AccountExecutionGateDecision {
  version: typeof ACCOUNT_EXECUTION_CONTROLLER_VERSION;
  decision: "ALLOW" | "BLOCK";
  reasonCodes: readonly string[];
  accountId: string;
  customerId: string;
  product: EligibilityProduct;
  provider: string;
  managementEnabled: boolean;
  protectionEnabled: boolean;
  reconciliationEnabled: boolean;
  transitionControlTo: AccountRuntimeControl | null;
  riskMultiplier: number;
  scannerRemainsActive: true;
}
const providerProduct: Readonly<Record<AccountExecutionGateInput["assignedProvider"], readonly ExecutionProduct[]>> = Object.freeze({ MT5_PERSONAL: ["FOREX_PERSONAL"], MT5_PROP: ["FOREX_PROP"], BINANCE: ["CRYPTO_PERSONAL", "CRYPTO_PROP"], BYBIT: ["CRYPTO_PERSONAL", "CRYPTO_PROP"] });
export function decideAccountExecution(input: AccountExecutionGateInput): AccountExecutionGateDecision {
  const reasons: string[] = [];
  const management = input.attempt === "MANAGE_EXISTING" || input.openPositions > 0;
  let transition: AccountRuntimeControl | null = null;
  if (input.product === "SIGNAL_ONLY") reasons.push("SIGNAL_ONLY_EXECUTION_FORBIDDEN");
  if (input.eligibility.decision !== "ELIGIBLE") reasons.push("QUALIFICATION_INELIGIBLE", ...input.eligibility.reasonCodes);
  if (input.eligibility.product !== input.product) reasons.push("ELIGIBILITY_PRODUCT_MISMATCH");
  if (input.assignedProvider !== input.requestedProvider || (input.product !== "SIGNAL_ONLY" && !providerProduct[input.assignedProvider].includes(input.product))) reasons.push("ACCOUNT_PROVIDER_PRODUCT_MISMATCH");
  if (input.attempt === "NEW_ENTRY") {
    if (["PAUSE_NEW_ENTRIES", "MANAGE_ONLY"].includes(input.runtimeControl)) reasons.push("ACCOUNT_NEW_ENTRIES_PAUSED");
    if (input.runtimeControl === "STOP_AFTER_FLAT") { reasons.push("ACCOUNT_STOP_AFTER_FLAT"); if (input.openPositions === 0 && input.pendingOrders === 0) transition = "PAUSE_NEW_ENTRIES"; }
    if (input.runtimeControl === "EMERGENCY_STOP") reasons.push("ACCOUNT_EMERGENCY_STOP");
    if (input.duplicateSignalForAccount) reasons.push("DUPLICATE_SIGNAL_ACCOUNT");
    if (input.activeSymbolConflict) reasons.push("ACCOUNT_SYMBOL_ALREADY_ACTIVE");
    if (!input.canonicalRiskApproved) reasons.push("CANONICAL_RISK_REJECTED");
    if (!input.canonicalCapitalApproved) reasons.push("CANONICAL_CAPITAL_REJECTED");
    if (!input.accountRuleApproved) reasons.push("ACCOUNT_RULE_REJECTED");
    if (input.product.endsWith("PROP")) {
      if (!input.propDecision) reasons.push("PROP_DECISION_MISSING");
      else if (input.propDecision.decision === "BLOCK") reasons.push("PROP_RULE_BLOCK", ...input.propDecision.reasonCodes);
    }
  }
  const riskMultiplier = input.product.endsWith("PROP") && input.propDecision?.decision === "REDUCE" ? input.propDecision.riskMultiplier : 1;
  return Object.freeze({ version: ACCOUNT_EXECUTION_CONTROLLER_VERSION, decision: reasons.length ? "BLOCK" : "ALLOW", reasonCodes: Object.freeze(reasons), accountId: input.accountId, customerId: input.customerId, product: input.product, provider: input.assignedProvider, managementEnabled: management || input.attempt === "MANAGE_EXISTING" || input.runtimeControl !== "EMERGENCY_STOP", protectionEnabled: true, reconciliationEnabled: true, transitionControlTo: transition, riskMultiplier, scannerRemainsActive: true });
}

export async function executeAccountEntry<T>(input: AccountExecutionGateInput, ports: { submit(): Promise<T>; emergency(): Promise<void>; audit(decision: AccountExecutionGateDecision): Promise<void> }): Promise<{ gate: AccountExecutionGateDecision; submitted: boolean; providerResult: T | null; providerError: string | null }> {
  const gate = decideAccountExecution(input);
  await ports.audit(gate);
  if (input.runtimeControl === "EMERGENCY_STOP") await ports.emergency();
  if (gate.decision === "BLOCK" || input.attempt !== "NEW_ENTRY") return { gate, submitted: false, providerResult: null, providerError: null };
  try { return { gate, submitted: true, providerResult: await ports.submit(), providerError: null }; }
  catch (error) { return { gate, submitted: false, providerResult: null, providerError: error instanceof Error ? error.message : String(error) }; }
}
