/** Pure qualification boundary between the one global scanner and downstream products.
 * It has no provider, persistence, account-control, or order-submission capability. */
export type EligibilityProduct = "SIGNAL_ONLY" | "FOREX_PERSONAL" | "FOREX_PROP" | "CRYPTO_PERSONAL" | "CRYPTO_PROP";
export type EligibilityMarket = "FOREX" | "CRYPTO";
export type ExecutionQualificationStatus = "FORWARD_VALIDATION_CANDIDATE" | "FORWARD_VALIDATED" | "PRODUCTION_APPROVED";

export interface PinnedQualifiedEntry {
  strategyId: string;
  strategyVersion: string;
  configId: string;
  configVersion: string;
  qualificationStatus: string;
  supportedSymbols: readonly string[];
  supportedTimeframes: readonly string[];
  strategyParameters: Readonly<Record<string, number>>;
}
export interface RuntimeQualifiedSet {
  version: "qualified-strategy-set/v1";
  id: string;
  setVersion: string;
  product: "PERSONAL" | "PROP";
  researchPolicyVersion: string;
  entries: readonly PinnedQualifiedEntry[];
}
export interface EligibilityClaim {
  product: EligibilityProduct;
  market: EligibilityMarket;
  strategyId: string;
  strategyVersion: string;
  configId: string;
  configVersion: string;
  qualifiedSetVersion: string;
  strategyParameters: Readonly<Record<string, number>>;
  symbol: string;
  timeframe: string;
  requiredQualification: ExecutionQualificationStatus;
}
export interface SignalOnlyPolicy {
  version: string;
  enabled: boolean;
  markets: readonly EligibilityMarket[];
  strategyIds: readonly string[];
}
export interface EligibilityDecision {
  version: "production-eligibility-router/v1";
  decision: "ELIGIBLE" | "INELIGIBLE";
  reasonCodes: readonly string[];
  product: EligibilityProduct;
  market: EligibilityMarket;
  qualifiedSetId: string | null;
  qualifiedSetVersion: string | null;
  configId: string | null;
  configVersion: string | null;
  pinnedStrategyParameters: Readonly<Record<string, number>> | null;
  signalPolicyVersion: string | null;
}

const rank: Readonly<Record<ExecutionQualificationStatus, number>> = Object.freeze({ FORWARD_VALIDATION_CANDIDATE: 1, FORWARD_VALIDATED: 2, PRODUCTION_APPROVED: 3 });
const normalize = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
function sameParameters(left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>) {
  const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && Object.is(left[key], right[key]));
}
function result(claim: EligibilityClaim, reasonCodes: readonly string[], set: RuntimeQualifiedSet | null, entry: PinnedQualifiedEntry | null, signalPolicyVersion: string | null = null): EligibilityDecision {
  return Object.freeze({ version: "production-eligibility-router/v1", decision: reasonCodes.length ? "INELIGIBLE" : "ELIGIBLE", reasonCodes: Object.freeze([...reasonCodes]), product: claim.product, market: claim.market, qualifiedSetId: set?.id ?? null, qualifiedSetVersion: set?.setVersion ?? null, configId: entry?.configId ?? null, configVersion: entry?.configVersion ?? null, pinnedStrategyParameters: entry ? Object.freeze({ ...entry.strategyParameters }) : null, signalPolicyVersion });
}
const expected = (product: Exclude<EligibilityProduct, "SIGNAL_ONLY">) => ({ market: product.startsWith("FOREX") ? "FOREX" as const : "CRYPTO" as const, setProduct: product.endsWith("PROP") ? "PROP" as const : "PERSONAL" as const, setId: `${product}_QUALIFIED_SET` });

export function routeProductionEligibility(input: { claim: EligibilityClaim; qualifiedSet?: RuntimeQualifiedSet | null; signalPolicy?: SignalOnlyPolicy | null }): EligibilityDecision {
  const { claim } = input;
  if (claim.product === "SIGNAL_ONLY") {
    const policy = input.signalPolicy;
    if (!policy) return result(claim, ["SIGNAL_POLICY_MISSING"], null, null);
    if (!policy.enabled) return result(claim, ["SIGNAL_POLICY_DISABLED"], null, null, policy.version);
    if (!policy.markets.includes(claim.market)) return result(claim, ["SIGNAL_POLICY_MARKET_MISMATCH"], null, null, policy.version);
    if (!policy.strategyIds.includes(claim.strategyId)) return result(claim, ["SIGNAL_POLICY_STRATEGY_NOT_ALLOWED"], null, null, policy.version);
    return result(claim, [], null, null, policy.version);
  }
  const contract = expected(claim.product), set = input.qualifiedSet ?? null;
  if (claim.market !== contract.market) return result(claim, ["WRONG_PRODUCT_MARKET"], set, null);
  if (!set) return result(claim, ["QUALIFIED_SET_MISSING"], null, null);
  if (set.version !== "qualified-strategy-set/v1") return result(claim, ["QUALIFIED_SET_SCHEMA_MISMATCH"], set, null);
  if (set.id !== contract.setId || set.product !== contract.setProduct) return result(claim, ["WRONG_QUALIFIED_SET_PRODUCT"], set, null);
  if (set.setVersion !== claim.qualifiedSetVersion) return result(claim, ["QUALIFIED_SET_VERSION_MISMATCH"], set, null);
  const strategyMarket = claim.strategyId.startsWith("crypto.") ? "CRYPTO" : "FOREX";
  if (strategyMarket !== claim.market) return result(claim, ["WRONG_STRATEGY_MARKET"], set, null);
  const strategyEntries = set.entries.filter(entry => entry.strategyId === claim.strategyId);
  if (!strategyEntries.length) return result(claim, ["STRATEGY_NOT_QUALIFIED"], set, null);
  const entry = strategyEntries.find(item => item.configId === claim.configId) ?? strategyEntries[0];
  if (entry.strategyVersion !== claim.strategyVersion) return result(claim, ["STRATEGY_VERSION_MISMATCH"], set, entry);
  if (entry.configId !== claim.configId || entry.configVersion !== claim.configVersion) return result(claim, ["CONFIG_VERSION_MISMATCH"], set, entry);
  if (!sameParameters(entry.strategyParameters, claim.strategyParameters)) return result(claim, ["STRATEGY_PARAMETER_MISMATCH"], set, entry);
  if (!entry.supportedSymbols.map(normalize).includes(normalize(claim.symbol))) return result(claim, ["UNSUPPORTED_SYMBOL"], set, entry);
  if (!entry.supportedTimeframes.includes(claim.timeframe)) return result(claim, ["UNSUPPORTED_TIMEFRAME"], set, entry);
  const actual = rank[entry.qualificationStatus as ExecutionQualificationStatus] ?? 0;
  if (actual < rank[claim.requiredQualification]) return result(claim, ["INSUFFICIENT_APPROVAL_STATE"], set, entry);
  return result(claim, [], set, entry);
}

/** Selects only an immutable set entry; never reads mutable strategy defaults. */
export function pinnedClaimFromQualifiedSet(input: { product: Exclude<EligibilityProduct, "SIGNAL_ONLY">; market: EligibilityMarket; set: RuntimeQualifiedSet; strategyId: string; strategyVersion: string; symbol: string; timeframe: string; requiredQualification: ExecutionQualificationStatus; evaluatedParameters?:Readonly<Record<string,number>> }): EligibilityClaim {
  const entry = input.set.entries.find(item => item.strategyId === input.strategyId && item.strategyVersion === input.strategyVersion && item.supportedSymbols.map(normalize).includes(normalize(input.symbol)) && item.supportedTimeframes.includes(input.timeframe));
  return Object.freeze({ product: input.product, market: input.market, strategyId: input.strategyId, strategyVersion: input.strategyVersion, configId: entry?.configId ?? "", configVersion: entry?.configVersion ?? "", qualifiedSetVersion: input.set.setVersion, strategyParameters: input.evaluatedParameters ? Object.freeze({...input.evaluatedParameters}) : entry ? Object.freeze({ ...entry.strategyParameters }) : Object.freeze({}), symbol: input.symbol, timeframe: input.timeframe, requiredQualification: input.requiredQualification });
}
