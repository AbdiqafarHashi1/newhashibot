import { deepFreeze, stableFingerprint, type DeepReadonly } from "./strategy-plan.ts";
import { floorToIncrement, type CapitalAllocationPlan, type ProviderContractSpecification } from "./professional-capital-allocation.ts";
import type { RiskDomain, TruthState } from "./professional-risk-engine.ts";

export const EXECUTION_PLANNING_CONTEXT_VERSION = "execution-planning-context/v1" as const;
export const EXECUTION_PLAN_VERSION = "execution-plan/v1" as const;
export const ROUTING_POLICY_VERSION = "execution-routing-policy/v1" as const;

export type ExecutionPlanStatus = "PLANNED" | "REJECTED";
export type ExecutionGateStatus = "PASS" | "REJECT" | "NOT_APPLICABLE";

export interface ExecutionRoutingPolicy {
  schema_version: typeof ROUTING_POLICY_VERSION;
  policy_id: string;
  version: string;
  provider: RiskDomain;
  allowed_environments: readonly CapitalAllocationPlan["risk_decision"]["account"]["environment"][];
  execution_mode: "PAPER" | "TESTNET" | "DEMO" | "LIVE";
  entry_order_type: "MARKET" | "LIMIT";
  time_in_force: "GTC" | "IOC" | "FOK";
  post_only: boolean;
  protection_mode: "NATIVE_CONDITIONAL" | "ATTACHED";
  tp1_quantity_fraction: number;
  tp2_quantity_fraction: number;
  trigger_reference: "MARK_PRICE" | "LAST_PRICE" | "BID_ASK";
  maximum_provider_truth_age_ms: number;
}

export interface ProviderRoutingCapabilities {
  provider: RiskDomain;
  provider_symbol: string;
  supported_entry_types: readonly ("MARKET" | "LIMIT")[];
  supported_time_in_force: readonly ("GTC" | "IOC" | "FOK")[];
  supported_leverage_modes: readonly string[];
  minimum_stop_distance_price: number;
  supports_reduce_only: boolean;
  supports_close_on_trigger: boolean;
  supports_post_only: boolean;
  leverage_configuration: "SET_BEFORE_ENTRY" | "PRECONFIGURED_ACCOUNT";
  margin_mode_configuration: "SET_BEFORE_ENTRY" | "PRECONFIGURED_ACCOUNT";
  mt5_fill_policies?: readonly ("IOC" | "RETURN" | "FOK")[];
  current_bid?: number | null;
  current_ask?: number | null;
}

export interface ExecutionPlanningContext {
  schema_version: typeof EXECUTION_PLANNING_CONTEXT_VERSION;
  capital_allocation_plan: DeepReadonly<CapitalAllocationPlan>;
  evaluation_id: string;
  correlation_id: string;
  provider: RiskDomain;
  environment: CapitalAllocationPlan["risk_decision"]["account"]["environment"];
  account_id: string;
  contract_specification: ProviderContractSpecification;
  contract_specification_fingerprint: string;
  provider_truth_timestamp: string;
  routing_timestamp: string;
  freshness: TruthState;
  routing_policy: ExecutionRoutingPolicy;
  capabilities: ProviderRoutingCapabilities;
}

export interface PlannedOrder {
  sequence: number;
  role: "ENTRY" | "ENTRY_TP1" | "ENTRY_TP2" | "STOP_LOSS" | "TAKE_PROFIT_1" | "TAKE_PROFIT_2";
  provider: RiskDomain;
  order_type: string;
  side: "BUY" | "SELL";
  quantity: number;
  quantity_unit: "BASE_ASSET" | "LOTS";
  price: number | null;
  trigger: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  reduce_only: boolean;
  post_only: boolean;
  time_in_force: "GTC" | "IOC" | "FOK" | "POST_ONLY" | null;
  client_order_id: string;
  idempotency_key: string;
  provider_payload: Readonly<Record<string, unknown>>;
}

export interface PlannedProviderConfiguration {
  sequence: number;
  action: "SET_MARGIN_MODE" | "SET_LEVERAGE" | "VERIFY_PRECONFIGURED_MARGIN_MODE" | "VERIFY_PRECONFIGURED_LEVERAGE";
  idempotency_key: string;
  provider_payload: Readonly<Record<string, unknown>>;
}

export interface ExecutionRoutingGate {
  id: string;
  order: number;
  status: ExecutionGateStatus;
  observed: unknown;
  required: unknown;
  reason_code: string;
  explanation: string;
}

export interface ExecutionPlan {
  schema_version: typeof EXECUTION_PLAN_VERSION;
  execution_plan_id: string;
  status: ExecutionPlanStatus;
  evaluation_id: string;
  correlation_id: string;
  planned_at: string;
  strategy_plan: CapitalAllocationPlan["approved_strategy_plan"]["strategy_plan"];
  risk_decision: CapitalAllocationPlan["risk_decision"];
  capital_allocation_plan: DeepReadonly<CapitalAllocationPlan>;
  provider: RiskDomain;
  routing: {
    account_id: string;
    environment: ExecutionPlanningContext["environment"];
    canonical_symbol: string;
    provider_symbol: string;
    execution_mode: ExecutionRoutingPolicy["execution_mode"];
    routing_policy_id: string;
    routing_policy_version: string;
    order_sequence: readonly string[];
  } | null;
  orders: readonly PlannedOrder[];
  provider_configuration: readonly PlannedProviderConfiguration[];
  gate_ledger: readonly ExecutionRoutingGate[];
  idempotency_key: string;
  execution_fingerprint: string;
  routing_fingerprint: string;
  capability_fingerprint: string;
  diagnostics: {
    routing_explanation: string;
    rejected_instructions: readonly string[];
    provider_assumptions: readonly string[];
    execution_warnings: readonly string[];
    active_execution_adoption: "PENDING_PHASE_1F";
    runtime: { canonical: false; duration_ms: null };
  };
}

function positive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function shortHash(value: unknown, length = 16): string { return stableFingerprint(value).split(":")[1].slice(0, length); }
function clientId(context: ExecutionPlanningContext, role: PlannedOrder["role"]): string {
  const prefix = context.provider.startsWith("MT5") ? "hbmt5" : context.provider === "BYBIT" ? "hbby" : "hbbn";
  return `${prefix}-${shortHash({ correlation: context.correlation_id, account: context.account_id, provider: context.provider, role }, 20)}-${role.toLowerCase().replace(/_/g, "-")}`.slice(0, 36);
}
function idempotency(context: ExecutionPlanningContext, role: PlannedOrder["role"]): string {
  return `${EXECUTION_PLAN_VERSION}:${context.provider}:${shortHash({ correlation: context.correlation_id, allocation: context.capital_allocation_plan.allocation_id, policy: context.routing_policy, role }, 24)}:${role}`;
}
function opposite(side: "BUY" | "SELL"): "BUY" | "SELL" { return side === "BUY" ? "SELL" : "BUY"; }
function triggerDirection(side: "BUY" | "SELL", trigger: number, entry: number): 1 | 2 {
  return trigger > entry ? 1 : 2;
}

function splitQuantity(total: number, fraction: number, spec: ProviderContractSpecification): number {
  const step = spec.kind === "CRYPTO" ? spec.quantity_step : spec.lot_step;
  const precision = spec.kind === "CRYPTO" ? spec.quantity_precision : undefined;
  return floorToIncrement(total * fraction, step, precision);
}

function baseOrder(context: ExecutionPlanningContext, sequence: number, role: PlannedOrder["role"], side: "BUY" | "SELL", quantity: number, price: number | null, trigger: number | null, reduceOnly: boolean, orderType: string, tif: PlannedOrder["time_in_force"], providerPayload: Record<string, unknown>, stopLoss: number | null = null, takeProfit: number | null = null): PlannedOrder {
  const clientOrderId = clientId(context, role), key = idempotency(context, role);
  return { sequence, role, provider: context.provider, order_type: orderType, side, quantity, quantity_unit: context.contract_specification.kind === "MT5" ? "LOTS" : "BASE_ASSET", price, trigger, stop_loss: stopLoss, take_profit: takeProfit, reduce_only: reduceOnly, post_only: context.routing_policy.post_only && !reduceOnly, time_in_force: tif, client_order_id: clientOrderId, idempotency_key: key, provider_payload: deepFreeze({ ...providerPayload, client_order_id: clientOrderId, idempotency_key: key }) };
}

function translateBinance(context: ExecutionPlanningContext, side: "BUY" | "SELL", quantity: number, tp1Qty: number, tp2Qty: number, entry: number, stop: number, tp1: number, tp2: number): PlannedOrder[] {
  const symbol = context.capabilities.provider_symbol, closeSide = opposite(side), entryType = context.routing_policy.entry_order_type;
  const entryPayload: Record<string, unknown> = { symbol, side, type: entryType, quantity, newClientOrderId: clientId(context, "ENTRY") };
  if (entryType === "LIMIT") Object.assign(entryPayload, { price: entry, timeInForce: context.routing_policy.post_only ? "GTX" : context.routing_policy.time_in_force });
  const exit = (role: "STOP_LOSS" | "TAKE_PROFIT_1" | "TAKE_PROFIT_2", type: string, qty: number, trigger: number, sequence: number) => baseOrder(context, sequence, role, closeSide, qty, null, trigger, true, type, null, { symbol, side: closeSide, type, quantity: qty, stopPrice: trigger, reduceOnly: true, workingType: context.routing_policy.trigger_reference === "MARK_PRICE" ? "MARK_PRICE" : "CONTRACT_PRICE", newClientOrderId: clientId(context, role) });
  return [
    baseOrder(context, 1, "ENTRY", side, quantity, entryType === "LIMIT" ? entry : null, null, false, entryType, entryType === "LIMIT" ? context.routing_policy.post_only ? "POST_ONLY" : context.routing_policy.time_in_force : null, entryPayload),
    exit("STOP_LOSS", "STOP_MARKET", quantity, stop, 2),
    exit("TAKE_PROFIT_1", "TAKE_PROFIT_MARKET", tp1Qty, tp1, 3),
    exit("TAKE_PROFIT_2", "TAKE_PROFIT_MARKET", tp2Qty, tp2, 4),
  ];
}

function translateBybit(context: ExecutionPlanningContext, side: "BUY" | "SELL", quantity: number, tp1Qty: number, tp2Qty: number, entry: number, stop: number, tp1: number, tp2: number): PlannedOrder[] {
  const symbol = context.capabilities.provider_symbol, bybitSide = side === "BUY" ? "Buy" : "Sell", closeSide = side === "BUY" ? "Sell" : "Buy", entryType = context.routing_policy.entry_order_type === "LIMIT" ? "Limit" : "Market";
  const entryPayload: Record<string, unknown> = { category: "linear", symbol, side: bybitSide, orderType: entryType, qty: String(quantity), orderLinkId: clientId(context, "ENTRY") };
  if (entryType === "Limit") Object.assign(entryPayload, { price: String(entry), timeInForce: context.routing_policy.post_only ? "PostOnly" : context.routing_policy.time_in_force });
  const exit = (role: "STOP_LOSS" | "TAKE_PROFIT_1" | "TAKE_PROFIT_2", qty: number, trigger: number, sequence: number) => baseOrder(context, sequence, role, opposite(side), qty, null, trigger, true, "MarketConditional", null, { category: "linear", symbol, side: closeSide, orderType: "Market", qty: String(qty), reduceOnly: true, closeOnTrigger: true, triggerPrice: String(trigger), triggerDirection: triggerDirection(side, trigger, entry), triggerBy: context.routing_policy.trigger_reference === "MARK_PRICE" ? "MarkPrice" : "LastPrice", orderLinkId: clientId(context, role) });
  return [
    baseOrder(context, 1, "ENTRY", side, quantity, entryType === "Limit" ? entry : null, null, false, entryType, entryType === "Limit" ? context.routing_policy.post_only ? "POST_ONLY" : context.routing_policy.time_in_force : null, entryPayload),
    exit("STOP_LOSS", quantity, stop, 2),
    exit("TAKE_PROFIT_1", tp1Qty, tp1, 3),
    exit("TAKE_PROFIT_2", tp2Qty, tp2, 4),
  ];
}

function translateMt5(context: ExecutionPlanningContext, side: "BUY" | "SELL", tp1Qty: number, tp2Qty: number, entry: number, stop: number, tp1: number, tp2: number): PlannedOrder[] {
  const symbol = context.capabilities.provider_symbol, action = context.routing_policy.entry_order_type === "MARKET" ? "market" : "pending";
  const fill = context.capabilities.mt5_fill_policies?.[0] ?? "IOC";
  const magic = Number.parseInt(shortHash({ correlation: context.correlation_id, account: context.account_id }, 7), 16);
  const pendingType = side === "BUY" ? entry < Number(context.capabilities.current_ask) ? "BUY_LIMIT" : "BUY_STOP" : entry > Number(context.capabilities.current_bid) ? "SELL_LIMIT" : "SELL_STOP";
  const child = (role: "ENTRY_TP1" | "ENTRY_TP2", quantity: number, tp: number, sequence: number) => baseOrder(context, sequence, role, side, quantity, action === "pending" ? entry : null, null, false, action === "market" ? "DEAL" : pendingType, context.routing_policy.time_in_force, { action, order_type: action === "market" ? "DEAL" : pendingType, symbol, side: side.toLowerCase(), volume: quantity, price: action === "pending" ? entry : undefined, sl: stop, tp, type_time: context.routing_policy.time_in_force, type_filling: fill, magic, comment: `HashiBot ${role}`, clientRequestId: clientId(context, role) }, stop, tp);
  return [child("ENTRY_TP1", tp1Qty, tp1, 1), child("ENTRY_TP2", tp2Qty, tp2, 2)];
}

function providerConfiguration(context: ExecutionPlanningContext, leverage: number): PlannedProviderConfiguration[] {
  const spec = context.contract_specification, symbol = context.capabilities.provider_symbol;
  const instruction = (sequence: number, action: PlannedProviderConfiguration["action"], payload: Record<string, unknown>): PlannedProviderConfiguration => ({ sequence, action, idempotency_key: `${EXECUTION_PLAN_VERSION}:${context.provider}:${shortHash({ correlation: context.correlation_id, action, payload }, 24)}:${action}`, provider_payload: deepFreeze(payload) });
  const marginAction = context.capabilities.margin_mode_configuration === "SET_BEFORE_ENTRY" ? "SET_MARGIN_MODE" : "VERIFY_PRECONFIGURED_MARGIN_MODE";
  const leverageAction = context.capabilities.leverage_configuration === "SET_BEFORE_ENTRY" ? "SET_LEVERAGE" : "VERIFY_PRECONFIGURED_LEVERAGE";
  if (context.provider === "BINANCE") return [
    instruction(1, marginAction, marginAction === "SET_MARGIN_MODE" ? { endpoint: "/fapi/v1/marginType", method: "POST", symbol, marginType: spec.leverage_mode } : { symbol, requiredMarginMode: spec.leverage_mode }),
    instruction(2, leverageAction, leverageAction === "SET_LEVERAGE" ? { endpoint: "/fapi/v1/leverage", method: "POST", symbol, leverage } : { symbol, requiredLeverage: leverage }),
  ];
  if (context.provider === "BYBIT") return [
    instruction(1, marginAction, { category: "linear", symbol, requiredMarginMode: spec.leverage_mode }),
    instruction(2, leverageAction, { category: "linear", symbol, requiredLeverage: String(leverage) }),
  ];
  return [
    instruction(1, "VERIFY_PRECONFIGURED_MARGIN_MODE", { accountId: context.account_id, symbol, requiredMarginMode: "ACCOUNT" }),
    instruction(2, "VERIFY_PRECONFIGURED_LEVERAGE", { accountId: context.account_id, symbol, maximumLeverage: leverage }),
  ];
}

export function planExecution(context: ExecutionPlanningContext): DeepReadonly<ExecutionPlan> {
  const gates: ExecutionRoutingGate[] = [], rejected: string[] = [], warnings: string[] = [];
  const add = (id: string, order: number, status: ExecutionGateStatus, observed: unknown, required: unknown, reason: string, explanation: string) => { gates.push({ id, order, status, observed, required, reason_code: reason, explanation }); if (status === "REJECT") rejected.push(reason); };
  const allocation = context.capital_allocation_plan, sized = allocation.allocation, account = allocation.account, strategy = allocation.approved_strategy_plan.strategy_plan;

  // 1. Immutable allocation
  const immutable = Object.isFrozen(allocation) && Object.isFrozen(allocation.risk_decision) && Object.isFrozen(allocation.approved_strategy_plan) && Object.isFrozen(strategy);
  if (!immutable || allocation.status !== "ALLOCATED" || !sized) add("routing.allocation", 1, "REJECT", { immutable, status: allocation.status }, { immutable: true, status: "ALLOCATED" }, !immutable ? "mutable_capital_allocation" : "capital_allocation_not_executable", "Routing accepts only deeply immutable allocated capital plans."); else add("routing.allocation", 1, "PASS", allocation.status, "ALLOCATED", "capital_allocation_valid", "Capital allocation is immutable and executable.");

  // 2. Provider freshness
  const age = Date.parse(context.routing_timestamp) - Date.parse(context.provider_truth_timestamp);
  if (context.freshness !== "KNOWN" || !Number.isFinite(age) || age < 0 || age > context.routing_policy.maximum_provider_truth_age_ms) add("routing.freshness", 2, "REJECT", { state: context.freshness, age_ms: age }, { state: "KNOWN", maximum_age_ms: context.routing_policy.maximum_provider_truth_age_ms }, "provider_routing_truth_stale", "Routing fails rather than guessing with stale provider truth."); else add("routing.freshness", 2, "PASS", age, context.routing_policy.maximum_provider_truth_age_ms, "provider_routing_truth_fresh", "Provider routing truth is fresh.");

  // 3. Contract fingerprint
  const actualContractFingerprint = stableFingerprint(context.contract_specification);
  const fingerprintsMatch = context.contract_specification_fingerprint === allocation.diagnostics.contract_fingerprint && actualContractFingerprint === allocation.diagnostics.contract_fingerprint;
  if (!fingerprintsMatch) add("routing.contract_fingerprint", 3, "REJECT", { supplied: context.contract_specification_fingerprint, actual: actualContractFingerprint }, allocation.diagnostics.contract_fingerprint, "contract_fingerprint_mismatch", "Provider contract rules must exactly match certified allocation rules."); else add("routing.contract_fingerprint", 3, "PASS", actualContractFingerprint, allocation.diagnostics.contract_fingerprint, "contract_fingerprint_match", "Contract fingerprint matches allocation.");

  // 4. Provider compatibility and deterministic account route
  const modeCompatible = context.routing_policy.execution_mode === "PAPER" ? context.environment !== "LIVE" : context.routing_policy.execution_mode === (context.environment === "LIVE" ? "LIVE" : context.environment === "TESTNET" ? "TESTNET" : "DEMO");
  const providerCompatible = context.provider === allocation.provider && context.provider === context.capabilities.provider && context.provider === context.contract_specification.provider && context.routing_policy.provider === context.provider && context.routing_policy.allowed_environments.includes(context.environment) && modeCompatible && account?.account_id === context.account_id;
  if (!providerCompatible) add("routing.provider", 4, "REJECT", { provider: context.provider, allocation: allocation.provider, capability: context.capabilities.provider, contract: context.contract_specification.provider, account: context.account_id, allocated_account: account?.account_id, environment: context.environment, mode: context.routing_policy.execution_mode }, "one compatible authorized route", "provider_route_incompatible", "Provider, account, environment, policy, capability and specification must identify one route."); else add("routing.provider", 4, "PASS", `${context.provider}/${context.account_id}`, `${allocation.provider}/${account?.account_id}`, "provider_route_compatible", "Provider route is compatible and inside allocation scope.");

  // 5. Symbol mapping
  const canonicalSymbol = strategy.market_context.symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const contractSymbol = context.contract_specification.symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const symbolValid = Boolean(context.capabilities.provider_symbol.trim()) && canonicalSymbol === contractSymbol;
  if (!symbolValid) add("routing.symbol", 5, "REJECT", { canonical: canonicalSymbol, contract: contractSymbol, provider: context.capabilities.provider_symbol }, "explicit matching mapping", "symbol_mapping_invalid", "Canonical, contract and provider symbols require an explicit compatible mapping."); else add("routing.symbol", 5, "PASS", context.capabilities.provider_symbol, canonicalSymbol, "symbol_mapping_valid", "Provider symbol mapping is explicit.");

  // 6. Order validity
  const policy = context.routing_policy, capability = context.capabilities;
  const mt5PendingTruth = !context.provider.startsWith("MT5") || policy.entry_order_type === "MARKET" || (positive(Number(capability.current_bid)) && positive(Number(capability.current_ask)));
  const protectionCompatible = context.provider.startsWith("MT5") ? policy.protection_mode === "ATTACHED" : policy.protection_mode === "NATIVE_CONDITIONAL" && capability.supports_reduce_only && (context.provider !== "BYBIT" || capability.supports_close_on_trigger);
  const orderCompatible = capability.supported_entry_types.includes(policy.entry_order_type) && capability.supported_time_in_force.includes(policy.time_in_force) && (!policy.post_only || capability.supports_post_only) && (!policy.post_only || policy.entry_order_type === "LIMIT") && protectionCompatible && mt5PendingTruth;
  if (!orderCompatible) add("routing.order", 6, "REJECT", { entry: policy.entry_order_type, tif: policy.time_in_force, post_only: policy.post_only, protection: policy.protection_mode }, capability, "order_semantics_unsupported", "Routing policy requests unsupported provider semantics."); else add("routing.order", 6, "PASS", policy.entry_order_type, capability.supported_entry_types, "order_semantics_supported", "Entry and time-in-force semantics are supported.");

  const zone = strategy.entry_plan.zone, entry = sized?.entry_reference ?? (zone ? (zone.low + zone.high) / 2 : 0), stop = strategy.risk_proposal.initial_stop ?? 0, tp1 = strategy.risk_proposal.tp1 ?? 0, tp2 = strategy.risk_proposal.tp2 ?? 0;
  const side: "BUY" | "SELL" = strategy.decision.action === "SELL" ? "SELL" : "BUY";
  const stopValid = positive(entry) && positive(stop) && (side === "BUY" ? stop < entry : stop > entry) && Math.abs(entry - stop) >= capability.minimum_stop_distance_price;
  if (!stopValid) add("routing.stop", 7, "REJECT", { side, entry, stop, distance: Math.abs(entry - stop) }, { minimum_distance: capability.minimum_stop_distance_price }, "stop_instruction_invalid", "Stop must be directionally valid and satisfy provider minimum distance without mutation."); else add("routing.stop", 7, "PASS", stop, side === "BUY" ? `< ${entry}` : `> ${entry}`, "stop_instruction_valid", "Stop instruction is directionally and operationally valid.");
  const targetsValid = positive(tp1) && positive(tp2) && Math.abs(tp1 - entry) >= capability.minimum_stop_distance_price && Math.abs(tp2 - entry) >= capability.minimum_stop_distance_price && (side === "BUY" ? tp1 > entry && tp2 > tp1 : tp1 < entry && tp2 < tp1);
  if (!targetsValid) add("routing.targets", 8, "REJECT", { side, entry, tp1, tp2 }, side === "BUY" ? "entry < TP1 < TP2" : "entry > TP1 > TP2", "target_instructions_invalid", "Targets must preserve certified directional ordering."); else add("routing.targets", 8, "PASS", { tp1, tp2 }, "directionally ordered", "target_instructions_valid", "Target instructions preserve certified ordering.");

  // 9. Leverage compatibility
  const specMode = context.contract_specification.leverage_mode;
  const leverageValid = Boolean(sized && sized.leverage <= allocation.authorized_risk!.leverage_ceiling && capability.supported_leverage_modes.includes(specMode));
  if (!leverageValid) add("routing.leverage", 9, "REJECT", { leverage: sized?.leverage, mode: specMode }, { ceiling: allocation.authorized_risk?.leverage_ceiling, modes: capability.supported_leverage_modes }, "leverage_route_incompatible", "Execution routing cannot raise leverage or change to an unsupported mode."); else add("routing.leverage", 9, "PASS", { leverage: sized!.leverage, mode: specMode }, allocation.authorized_risk!.leverage_ceiling, "leverage_route_compatible", "Leverage and mode match certified allocation and provider capability.");

  // 10. Routing completeness and translation
  const fractionsValid = policy.tp1_quantity_fraction > 0 && policy.tp2_quantity_fraction > 0 && Math.abs(policy.tp1_quantity_fraction + policy.tp2_quantity_fraction - 1) <= 1e-9;
  const tp1Qty = sized ? splitQuantity(sized.quantity, policy.tp1_quantity_fraction, context.contract_specification) : 0;
  const tp2Qty = sized ? floorToIncrement(sized.quantity - tp1Qty, context.contract_specification.kind === "CRYPTO" ? context.contract_specification.quantity_step : context.contract_specification.lot_step, context.contract_specification.kind === "CRYPTO" ? context.contract_specification.quantity_precision : undefined) : 0;
  const minimum = context.contract_specification.kind === "CRYPTO" ? context.contract_specification.minimum_quantity : context.contract_specification.minimum_lot;
  const splitValid = fractionsValid && positive(tp1Qty) && positive(tp2Qty) && tp1Qty >= minimum && tp2Qty >= minimum && sized !== null && Math.abs(tp1Qty + tp2Qty - sized.quantity) <= 1e-9;
  if (!splitValid) add("routing.completeness", 10, "REJECT", { fractions: [policy.tp1_quantity_fraction, policy.tp2_quantity_fraction], total: sized?.quantity, tp1_quantity: tp1Qty, tp2_quantity: tp2Qty }, { fractions_sum: 1, minimum, quantity_conserved: true }, "routing_quantity_split_invalid", "Protection/child quantities must be positive, provider-valid and exactly conserve allocation."); else add("routing.completeness", 10, "PASS", { tp1_quantity: tp1Qty, tp2_quantity: tp2Qty }, sized!.quantity, "routing_complete", "Order quantities conserve the certified allocation.");

  let orders: PlannedOrder[] = [];
  let configuration: PlannedProviderConfiguration[] = [];
  if (!rejected.length && sized) {
    configuration = providerConfiguration(context, sized.leverage);
    if (context.provider === "BINANCE") orders = translateBinance(context, side, sized.quantity, tp1Qty, tp2Qty, entry, stop, tp1, tp2);
    else if (context.provider === "BYBIT") orders = translateBybit(context, side, sized.quantity, tp1Qty, tp2Qty, entry, stop, tp1, tp2);
    else orders = translateMt5(context, side, tp1Qty, tp2Qty, entry, stop, tp1, tp2);
  }
  const expectedOrders = context.provider.startsWith("MT5") ? 2 : 4;
  if (!rejected.length && orders.length !== expectedOrders) add("routing.translation", 10, "REJECT", orders.length, expectedOrders, "provider_translation_incomplete", "Provider translator did not produce the complete sequence."); else if (!rejected.length) add("routing.translation", 10, "PASS", orders.length, expectedOrders, "provider_translation_complete", "Provider-native order sequence is complete."); else add("routing.translation", 10, "NOT_APPLICABLE", 0, expectedOrders, "translation_skipped_after_rejection", "Translation was not attempted after routing rejection.");

  const status: ExecutionPlanStatus = rejected.length ? "REJECTED" : "PLANNED";
  const capabilityFingerprint = stableFingerprint(context.capabilities);
  const routingFingerprint = stableFingerprint({ provider: context.provider, environment: context.environment, account_id: context.account_id, symbol: context.capabilities.provider_symbol, policy: context.routing_policy, capabilities: context.capabilities, contract: actualContractFingerprint });
  const planIdempotency = `${EXECUTION_PLAN_VERSION}:${context.provider}:${shortHash({ allocation: allocation.allocation_id, routing: routingFingerprint }, 32)}`;
  const executionFingerprint = stableFingerprint({ allocation: allocation.allocation_id, routing: routingFingerprint, status, configuration, orders, gates: gates.map(({ id, status: gateStatus, reason_code }) => ({ id, status: gateStatus, reason_code })) });
  const result: ExecutionPlan = {
    schema_version: EXECUTION_PLAN_VERSION,
    execution_plan_id: stableFingerprint({ execution: executionFingerprint, idempotency: planIdempotency }),
    status, evaluation_id: context.evaluation_id, correlation_id: context.correlation_id, planned_at: context.routing_timestamp,
    strategy_plan: strategy, risk_decision: allocation.risk_decision, capital_allocation_plan: allocation, provider: context.provider,
    routing: symbolValid && account ? { account_id: context.account_id, environment: context.environment, canonical_symbol: canonicalSymbol, provider_symbol: context.capabilities.provider_symbol, execution_mode: policy.execution_mode, routing_policy_id: policy.policy_id, routing_policy_version: policy.version, order_sequence: context.provider.startsWith("MT5") ? ["SUBMIT_ENTRY_TP1_WITH_ATTACHED_SL_TP", "SUBMIT_ENTRY_TP2_WITH_ATTACHED_SL_TP"] : ["CONFIGURE_LEVERAGE", "SUBMIT_ENTRY", "AFTER_ENTRY_FILL_SUBMIT_STOP", "AFTER_ENTRY_FILL_SUBMIT_TP1", "AFTER_ENTRY_FILL_SUBMIT_TP2"] } : null,
    orders: status === "PLANNED" ? orders : [], provider_configuration: status === "PLANNED" ? configuration : [], gate_ledger: gates, idempotency_key: planIdempotency, execution_fingerprint: executionFingerprint, routing_fingerprint: routingFingerprint, capability_fingerprint: capabilityFingerprint,
    diagnostics: { routing_explanation: status === "PLANNED" ? `Routed deterministically to the Phase 1D-authorized ${context.provider} account ${context.account_id}; translated with ${policy.policy_id}@${policy.version}.` : `Routing rejected: ${[...new Set(rejected)].join(", ")}.`, rejected_instructions: [...new Set(rejected)], provider_assumptions: ["Provider capabilities and contract specification are caller-supplied certified truth.", "No order submission occurs in Phase 1E.", context.provider.startsWith("MT5") ? "Two MT5 child entries preserve TP1/TP2 quantities with attached SL/TP." : "Conditional protection is sequenced after confirmed entry fill."], execution_warnings: warnings, active_execution_adoption: "PENDING_PHASE_1F", runtime: { canonical: false, duration_ms: null } },
  };
  return deepFreeze(result);
}
