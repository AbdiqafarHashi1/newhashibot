import { deepFreeze, stableFingerprint, type DeepReadonly } from "./strategy-plan.ts";
import type { RiskDecision, RiskDomain, TruthState } from "./professional-risk-engine.ts";
import type {
  BrainProvider,
  ExecutionDecision,
  SignalContract,
  AccountExecutionContext,
  AccountPolicy,
  PositionPlan,
} from "./account-execution-brain/types.ts";

export const CAPITAL_ALLOCATION_CONTEXT_VERSION = "capital-allocation-context/v1" as const;
export const CAPITAL_ALLOCATION_PLAN_VERSION = "capital-allocation-plan/v1" as const;

export type AllocationStatus = "ALLOCATED" | "REJECTED";
export type AllocationGateStatus = "PASS" | "REJECT" | "NOT_APPLICABLE";

export interface AllocationAccountCandidate {
  account_id: string;
  customer_id: string | null;
  provider: RiskDomain;
  environment: RiskDecision["account"]["environment"];
  enabled: boolean;
  execution_enabled: boolean;
  provider_health: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  policy_priority: number;
  balance: number;
  equity: number;
  available_capital: number;
  available_margin: number;
  used_margin: number;
  utilization_pct: number;
  account_currency: string;
  provider_timestamp: string;
  freshness: TruthState;
}

export interface CryptoContractSpecification {
  kind: "CRYPTO";
  provider: "BINANCE" | "BYBIT";
  symbol: string;
  product: "SPOT" | "PERPETUAL";
  quantity_step: number;
  quantity_precision: number;
  minimum_quantity: number;
  maximum_quantity: number;
  tick_size: number;
  price_precision: number;
  minimum_notional: number;
  maximum_notional: number;
  contract_multiplier: number;
  leverage_mode: "NONE" | "ISOLATED" | "CROSS";
  maximum_leverage: number;
  quote_currency: string;
}

export interface Mt5ContractSpecification {
  kind: "MT5";
  provider: "MT5_PERSONAL" | "MT5_PROP";
  symbol: string;
  broker_symbol: string;
  contract_size: number;
  tick_size: number;
  tick_value_account_currency: number;
  pip_size: number;
  price_precision: number;
  minimum_lot: number;
  maximum_lot: number;
  lot_step: number;
  leverage_mode: "ACCOUNT";
  maximum_leverage: number;
  margin_rate: number | null;
  account_currency: string;
  quote_to_account_conversion: number;
}

export type ProviderContractSpecification = CryptoContractSpecification | Mt5ContractSpecification;

export interface CapitalAllocationContext {
  schema_version: typeof CAPITAL_ALLOCATION_CONTEXT_VERSION;
  risk_decision: DeepReadonly<RiskDecision>;
  evaluation_id: string;
  correlation_id: string;
  evaluated_at: string;
  provider: RiskDomain;
  permitted_account_ids: readonly string[];
  accounts: readonly AllocationAccountCandidate[];
  contract_specification: ProviderContractSpecification;
  provider_timestamp: string;
  freshness: TruthState;
  maximum_truth_age_ms: number;
}

export interface AllocationGate {
  id: string;
  order: number;
  status: AllocationGateStatus;
  observed: unknown;
  required: unknown;
  unit: string;
  reason_code: string;
  explanation: string;
}

export interface CapitalAllocationPlan {
  schema_version: typeof CAPITAL_ALLOCATION_PLAN_VERSION;
  allocation_id: string;
  status: AllocationStatus;
  evaluation_id: string;
  correlation_id: string;
  created_at: string;
  approved_strategy_plan: RiskDecision["approved_strategy_plan"];
  risk_decision: DeepReadonly<RiskDecision>;
  provider: RiskDomain;
  account: null | {
    account_id: string;
    customer_id: string | null;
    account_currency: string;
    selection_policy: "AUTHORIZED_SCOPE_HEALTH_UTILIZATION_PRIORITY_ID_V1";
    selection_explanation: string;
    considered_accounts: readonly { account_id: string; eligible: boolean; reason: string; rank: readonly (string | number)[] }[];
  };
  authorized_risk: { percent: number; amount: number; leverage_ceiling: number; maximum_notional: number | null; maximum_margin: number | null } | null;
  allocation: null | {
    quantity: number;
    quantity_unit: "BASE_ASSET" | "LOTS";
    contract_quantity: number;
    lot_size: number | null;
    notional: number;
    margin: number;
    leverage: number;
    entry_reference: number;
    stop_reference: number;
  };
  precision_adjustments: readonly { field: string; raw: number; adjusted: number; rule: string }[];
  rounding_explanation: string;
  gate_ledger: readonly AllocationGate[];
  rejected_constraints: readonly string[];
  diagnostics: {
    calculator: "CRYPTO_V1" | "MT5_V1" | "NONE";
    contract_fingerprint: string;
    context_fingerprint: string;
    warnings: readonly string[];
    active_runtime_adoption: "PENDING_PHASE_1E";
    runtime: { canonical: false; duration_ms: null };
  };
}

function finitePositive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.includes(".") ? text.split(".")[1].length : 0;
}
export function floorToIncrement(value: number, increment: number, precision = decimalPlaces(increment)): number {
  if (!finitePositive(value) || !finitePositive(increment)) return 0;
  const steps = Math.floor((value / increment) + 1e-9);
  return Number((steps * increment).toFixed(Math.min(Math.max(precision, 0), 12)));
}

export interface AccountSelectionResult {
  selected: AllocationAccountCandidate | null;
  considered: CapitalAllocationPlan["account"] extends { considered_accounts: infer T } ? T : readonly { account_id: string; eligible: boolean; reason: string; rank: readonly (string | number)[] }[];
  explanation: string;
}

/** Phase 1C authorizes one account. This selector still handles multiple truth
 * records deterministically, but never broadens that authorized account scope. */
export function selectAllocationAccount(context: CapitalAllocationContext): AccountSelectionResult {
  const authorized = context.risk_decision.authorized_envelope?.permitted_account_id ?? null;
  const scoped = new Set(context.permitted_account_ids);
  const rows = context.accounts.map((account) => {
    const inScope = Boolean(authorized && account.account_id === authorized && scoped.has(account.account_id));
    const accountTruthAge = Date.parse(context.evaluated_at) - Date.parse(account.provider_timestamp);
    const fresh = account.freshness === "KNOWN" && Number.isFinite(accountTruthAge) && accountTruthAge >= 0 && accountTruthAge <= context.maximum_truth_age_ms;
    const healthy = account.enabled && account.execution_enabled && account.provider_health === "HEALTHY" && fresh;
    const providerMatch = account.provider === context.provider;
    const sufficient = finitePositive(account.available_capital) && finitePositive(account.available_margin);
    const eligible = inScope && healthy && providerMatch && sufficient;
    const reason = !inScope ? "outside_risk_authorized_account_scope" : !providerMatch ? "provider_mismatch" : !healthy ? "account_unhealthy_or_stale" : !sufficient ? "capital_or_margin_unavailable" : "eligible";
    return { account, eligible, reason, rank: [account.utilization_pct, account.policy_priority, account.account_id, account.provider_timestamp] as const };
  });
  const eligible = rows.filter((row) => row.eligible).sort((a, b) => a.account.utilization_pct - b.account.utilization_pct || a.account.policy_priority - b.account.policy_priority || a.account.account_id.localeCompare(b.account.account_id) || b.account.provider_timestamp.localeCompare(a.account.provider_timestamp));
  const selected = eligible[0]?.account ?? null;
  return {
    selected,
    considered: rows.map(({ account, eligible: ok, reason, rank }) => ({ account_id: account.account_id, eligible: ok, reason, rank })),
    explanation: selected ? `Selected ${selected.account_id}: inside the RiskDecision account scope, healthy, fresh, sufficiently funded, then lowest utilization (${selected.utilization_pct}%), policy priority (${selected.policy_priority}), account ID and newest timestamp.` : "No account satisfied the RiskDecision account scope and deterministic health/capital/margin criteria.",
  };
}

interface CalculationResult {
  raw_quantity: number;
  quantity: number;
  quantity_unit: "BASE_ASSET" | "LOTS";
  contract_quantity: number;
  lot_size: number | null;
  notional: number;
  margin: number;
  leverage: number;
  adjustments: CapitalAllocationPlan["precision_adjustments"] extends readonly (infer T)[] ? T[] : never;
}

function cryptoCalculation(risk: NonNullable<RiskDecision["authorized_envelope"]>, spec: CryptoContractSpecification, entry: number, stop: number): CalculationResult | null {
  const distance = Math.abs(entry - stop);
  if (!finitePositive(distance) || !finitePositive(spec.contract_multiplier)) return null;
  const riskQuantity = risk.maximum_authorized_risk_amount / (distance * spec.contract_multiplier);
  const notionalQuantity = Math.min(spec.maximum_notional, risk.maximum_notional ?? Infinity) / (entry * spec.contract_multiplier);
  const raw = Math.min(riskQuantity, notionalQuantity);
  const quantity = floorToIncrement(Math.min(raw, spec.maximum_quantity), spec.quantity_step, spec.quantity_precision);
  const leverage = spec.product === "SPOT" ? 1 : Math.min(risk.leverage_ceiling, spec.maximum_leverage);
  const notional = quantity * entry * spec.contract_multiplier;
  return { raw_quantity: raw, quantity, quantity_unit: "BASE_ASSET", contract_quantity: quantity, lot_size: null, notional, margin: notional / leverage, leverage, adjustments: [{ field: "quantity", raw, adjusted: quantity, rule: `floor to ${spec.provider} quantity_step ${spec.quantity_step} at precision ${spec.quantity_precision}` }] };
}

function mt5Calculation(risk: NonNullable<RiskDecision["authorized_envelope"]>, spec: Mt5ContractSpecification, entry: number, stop: number): CalculationResult | null {
  const ticks = Math.abs(entry - stop) / spec.tick_size;
  const riskPerLot = ticks * spec.tick_value_account_currency;
  if (!finitePositive(riskPerLot) || !finitePositive(spec.contract_size) || !finitePositive(spec.quote_to_account_conversion)) return null;
  const riskLots = risk.maximum_authorized_risk_amount / riskPerLot;
  const notionalLots = (risk.maximum_notional ?? Infinity) / (spec.contract_size * entry * spec.quote_to_account_conversion);
  const raw = Math.min(riskLots, notionalLots);
  const quantity = floorToIncrement(Math.min(raw, spec.maximum_lot), spec.lot_step, decimalPlaces(spec.lot_step));
  const leverage = Math.min(risk.leverage_ceiling, spec.maximum_leverage);
  const notional = quantity * spec.contract_size * entry * spec.quote_to_account_conversion;
  const margin = spec.margin_rate !== null ? notional * spec.margin_rate : notional / leverage;
  return { raw_quantity: raw, quantity, quantity_unit: "LOTS", contract_quantity: quantity * spec.contract_size, lot_size: quantity, notional, margin, leverage, adjustments: [{ field: "lot_size", raw, adjusted: quantity, rule: `floor to ${spec.provider} lot_step ${spec.lot_step}` }] };
}

export function allocateCapital(context: CapitalAllocationContext): DeepReadonly<CapitalAllocationPlan> {
  const gates: AllocationGate[] = [], rejected: string[] = [], warnings: string[] = [];
  const add = (id: string, order: number, status: AllocationGateStatus, observed: unknown, required: unknown, unit: string, reason: string, explanation: string) => { gates.push({ id, order, status, observed, required, unit, reason_code: reason, explanation }); if (status === "REJECT") rejected.push(reason); };
  const risk = context.risk_decision, envelope = risk.authorized_envelope;

  // 1. Contract integrity
  const immutable = Object.isFrozen(risk) && Object.isFrozen(risk.approved_strategy_plan) && Object.isFrozen(risk.approved_strategy_plan.strategy_plan);
  if (!immutable) add("allocation.contract.immutable", 1, "REJECT", immutable, true, "boolean", "mutable_risk_decision", "RiskDecision and approved strategy references must be deeply frozen."); else add("allocation.contract.immutable", 1, "PASS", true, true, "boolean", "risk_decision_immutable", "RiskDecision is immutable.");
  const tradeable = risk.decision === "ACCEPT" || risk.decision === "REDUCE";
  if (!tradeable || !envelope) add("allocation.contract.tradeable", 1, "REJECT", risk.decision, "ACCEPT|REDUCE", "decision", "risk_decision_not_allocatable", "Only accepted or reduced risk decisions can allocate capital."); else add("allocation.contract.tradeable", 1, "PASS", risk.decision, "ACCEPT|REDUCE", "decision", "risk_decision_allocatable", "RiskDecision is allocatable.");
  const lineage = context.evaluation_id === risk.evaluation_id && context.correlation_id === risk.correlation_id && context.provider === envelope?.permitted_provider;
  if (!lineage) add("allocation.contract.lineage", 1, "REJECT", { evaluation: context.evaluation_id, correlation: context.correlation_id, provider: context.provider }, { evaluation: risk.evaluation_id, correlation: risk.correlation_id, provider: envelope?.permitted_provider }, "identity", "allocation_lineage_mismatch", "Allocation lineage and provider must match the risk authorization."); else add("allocation.contract.lineage", 1, "PASS", context.correlation_id, risk.correlation_id, "identity", "allocation_lineage_match", "Allocation lineage matches risk authorization.");

  // 2. Fresh provider truth
  const truthAge = Date.parse(context.evaluated_at) - Date.parse(context.provider_timestamp);
  if (context.freshness !== "KNOWN" || !Number.isFinite(truthAge) || truthAge < 0 || truthAge > context.maximum_truth_age_ms) add("allocation.truth.freshness", 2, "REJECT", { state: context.freshness, age_ms: truthAge }, { state: "KNOWN", maximum_age_ms: context.maximum_truth_age_ms }, "state/ms", "provider_truth_stale_or_unavailable", "Allocation fails safe without fresh provider/account/contract truth."); else add("allocation.truth.freshness", 2, "PASS", truthAge, context.maximum_truth_age_ms, "ms", "provider_truth_fresh", "Provider truth is fresh.");
  const selection = selectAllocationAccount(context), account = selection.selected;

  // 3-4. Capital and margin
  if (!account || !finitePositive(account.available_capital)) add("allocation.capital.available", 3, "REJECT", account?.available_capital ?? null, "> 0", account?.account_currency ?? "currency", "insufficient_available_capital", "No authorized account has available capital."); else if (envelope && envelope.maximum_authorized_risk_amount > account.available_capital) add("allocation.capital.available", 3, "REJECT", account.available_capital, envelope.maximum_authorized_risk_amount, account.account_currency, "insufficient_available_capital", "Available capital is below authorized risk amount."); else add("allocation.capital.available", 3, "PASS", account?.available_capital ?? null, envelope?.maximum_authorized_risk_amount ?? null, account?.account_currency ?? "currency", "available_capital_sufficient", "Available capital covers authorized risk.");
  if (!account || !finitePositive(account.available_margin)) add("allocation.margin.available", 4, "REJECT", account?.available_margin ?? null, "> 0", account?.account_currency ?? "currency", "insufficient_available_margin", "No authorized account has available margin."); else add("allocation.margin.available", 4, "PASS", account.available_margin, "> 0", account.account_currency, "available_margin_present", "Available margin is present for sizing.");

  // 5-6. Contract and precision
  const spec = context.contract_specification;
  const strategy = risk.approved_strategy_plan.strategy_plan, zone = strategy.entry_plan.zone, stop = strategy.risk_proposal.initial_stop;
  const entry = zone ? (zone.low + zone.high) / 2 : 0;
  const providerMatch = spec.provider === context.provider;
  const contractValid = providerMatch && (spec.kind === "CRYPTO" ? [spec.quantity_step, spec.tick_size, spec.minimum_quantity, spec.maximum_quantity, spec.contract_multiplier, spec.maximum_leverage].every(finitePositive) : [spec.contract_size, spec.tick_size, spec.tick_value_account_currency, spec.minimum_lot, spec.maximum_lot, spec.lot_step, spec.maximum_leverage, spec.quote_to_account_conversion].every(finitePositive));
  if (!contractValid) add("allocation.contract_specification", 5, "REJECT", spec, "complete provider-specific contract", "contract", providerMatch ? "contract_specification_invalid" : "contract_provider_mismatch", "Contract specification must be complete and belong to the authorized provider."); else add("allocation.contract_specification", 5, "PASS", spec.provider, context.provider, "provider", "contract_specification_valid", "Provider contract specification is complete.");
  const tick = spec.tick_size;
  const alignedToTick = (value: number) => finitePositive(tick) && Math.abs((value / tick) - Math.round(value / tick)) <= 1e-7;
  const precisionValid = (spec.kind === "CRYPTO" ? Number.isInteger(spec.quantity_precision) && Number.isInteger(spec.price_precision) : Number.isInteger(spec.price_precision)) && finitePositive(entry) && stop !== null && alignedToTick(entry) && alignedToTick(stop);
  if (!precisionValid) add("allocation.precision", 6, "REJECT", { digits: spec.kind === "CRYPTO" ? [spec.quantity_precision, spec.price_precision] : spec.price_precision, entry, stop, tick }, "explicit digits and strategy prices aligned to tick", "digits/price", "precision_unavailable_or_price_misaligned", "Provider precision must be explicit and strategy sizing references must already align to provider tick; allocation never rewrites prices."); else add("allocation.precision", 6, "PASS", { entry, stop, tick }, "tick aligned", "price", "precision_available", "Provider precision is explicit and sizing references align without mutation.");
  const calculation = envelope && contractValid && finitePositive(entry) && stop !== null ? (spec.kind === "CRYPTO" ? cryptoCalculation(envelope, spec, entry, stop) : mt5Calculation(envelope, spec, entry, stop)) : null;

  // 7-12. Quantity, provider bounds, exposure, leverage, margin and final allocation
  if (!calculation || !finitePositive(calculation.quantity)) add("allocation.quantity.valid", 7, "REJECT", calculation?.quantity ?? null, "> 0", spec.kind === "CRYPTO" ? "base asset" : "lots", "quantity_not_derivable", "Authorized risk and provider contract did not yield a positive executable quantity."); else add("allocation.quantity.valid", 7, "PASS", calculation.quantity, "> 0", calculation.quantity_unit, "quantity_valid", "Quantity is finite and positive after provider rounding.");
  const minimumQuantity = spec.kind === "CRYPTO" ? spec.minimum_quantity : spec.minimum_lot;
  if (!calculation || calculation.quantity < minimumQuantity) add("allocation.quantity.minimum", 8, "REJECT", calculation?.quantity ?? null, minimumQuantity, calculation?.quantity_unit ?? "quantity", "minimum_quantity_not_met", "Rounded quantity is below provider minimum."); else add("allocation.quantity.minimum", 8, "PASS", calculation.quantity, minimumQuantity, calculation.quantity_unit, "minimum_quantity_met", "Provider minimum quantity is met.");
  if (spec.kind === "CRYPTO") {
    if (!calculation || calculation.notional < spec.minimum_notional) add("allocation.notional.minimum", 9, "REJECT", calculation?.notional ?? null, spec.minimum_notional, spec.quote_currency, "minimum_notional_not_met", "Rounded Crypto allocation is below provider minimum notional."); else add("allocation.notional.minimum", 9, "PASS", calculation.notional, spec.minimum_notional, spec.quote_currency, "minimum_notional_met", "Provider minimum notional is met.");
  } else add("allocation.notional.minimum", 9, "NOT_APPLICABLE", null, null, "notional", "mt5_minimum_lot_used", "MT5 uses minimum lot at gate 8.");
  const providerMaximum = spec.kind === "CRYPTO" ? Math.min(spec.maximum_notional, envelope?.maximum_notional ?? Infinity) : envelope?.maximum_notional ?? Infinity;
  if (!calculation || calculation.notional > providerMaximum + 1e-9) add("allocation.exposure.maximum", 10, "REJECT", calculation?.notional ?? null, providerMaximum, account?.account_currency ?? "currency", "maximum_notional_exceeded", "Allocation exceeds provider or RiskDecision maximum notional."); else add("allocation.exposure.maximum", 10, "PASS", calculation?.notional ?? null, providerMaximum, account?.account_currency ?? "currency", "maximum_notional_respected", "Allocation remains within maximum notional.");
  if (!calculation || !envelope || calculation.leverage > envelope.leverage_ceiling + 1e-9) add("allocation.leverage", 11, "REJECT", calculation?.leverage ?? null, envelope?.leverage_ceiling ?? null, "x", "authorized_leverage_exceeded", "Allocation cannot exceed authorized leverage."); else add("allocation.leverage", 11, "PASS", calculation.leverage, envelope.leverage_ceiling, "x", "authorized_leverage_respected", "Allocation leverage respects risk authorization and provider cap.");
  const marginMaximum = Math.min(account?.available_margin ?? 0, envelope?.maximum_margin ?? Infinity);
  if (!calculation || calculation.margin > marginMaximum + 1e-9) add("allocation.margin.final", 12, "REJECT", calculation?.margin ?? null, marginMaximum, account?.account_currency ?? "currency", "insufficient_margin", "Calculated margin exceeds account availability or risk envelope."); else add("allocation.margin.final", 12, "PASS", calculation?.margin ?? null, marginMaximum, account?.account_currency ?? "currency", "margin_within_limit", "Calculated margin is permitted.");

  const status: AllocationStatus = rejected.length ? "REJECTED" : "ALLOCATED";
  add("allocation.final", 12, status === "ALLOCATED" ? "PASS" : "REJECT", status, "ALLOCATED", "state", status === "ALLOCATED" ? "capital_allocated" : "allocation_rejected", status === "ALLOCATED" ? "One deterministic allocation is certified." : "One or more ordered allocation gates rejected sizing.");
  const contractFingerprint = stableFingerprint(spec);
  const contextFingerprint = stableFingerprint({ evaluation_id: context.evaluation_id, correlation_id: context.correlation_id, evaluated_at: context.evaluated_at, provider: context.provider, permitted_account_ids: context.permitted_account_ids, accounts: context.accounts, contract_fingerprint: contractFingerprint, provider_timestamp: context.provider_timestamp, freshness: context.freshness, maximum_truth_age_ms: context.maximum_truth_age_ms, risk_decision_id: risk.decision_id });
  const adjustments = calculation?.adjustments ?? [];
  const result: CapitalAllocationPlan = {
    schema_version: CAPITAL_ALLOCATION_PLAN_VERSION,
    allocation_id: stableFingerprint({ context: contextFingerprint, status, gates: gates.map(({ id, status: gateStatus, reason_code }) => ({ id, status: gateStatus, reason_code })) }),
    status, evaluation_id: context.evaluation_id, correlation_id: context.correlation_id, created_at: context.evaluated_at,
    approved_strategy_plan: risk.approved_strategy_plan, risk_decision: risk, provider: context.provider,
    account: account ? { account_id: account.account_id, customer_id: account.customer_id, account_currency: account.account_currency, selection_policy: "AUTHORIZED_SCOPE_HEALTH_UTILIZATION_PRIORITY_ID_V1", selection_explanation: selection.explanation, considered_accounts: selection.considered } : null,
    authorized_risk: envelope ? { percent: envelope.authorized_risk_percent, amount: envelope.maximum_authorized_risk_amount, leverage_ceiling: envelope.leverage_ceiling, maximum_notional: envelope.maximum_notional, maximum_margin: envelope.maximum_margin } : null,
    allocation: status === "ALLOCATED" && calculation ? { quantity: calculation.quantity, quantity_unit: calculation.quantity_unit, contract_quantity: calculation.contract_quantity, lot_size: calculation.lot_size, notional: calculation.notional, margin: calculation.margin, leverage: calculation.leverage, entry_reference: entry, stop_reference: stop! } : null,
    precision_adjustments: adjustments,
    rounding_explanation: adjustments.length ? adjustments.map((item) => `${item.field}: ${item.raw} → ${item.adjusted}; ${item.rule}`).join(" | ") : "No executable quantity was produced.",
    gate_ledger: gates,
    rejected_constraints: [...new Set(rejected)],
    diagnostics: { calculator: calculation ? spec.kind === "CRYPTO" ? "CRYPTO_V1" : "MT5_V1" : "NONE", contract_fingerprint: contractFingerprint, context_fingerprint: contextFingerprint, warnings, active_runtime_adoption: "PENDING_PHASE_1E", runtime: { canonical: false, duration_ms: null } },
  };
  return deepFreeze(result);
}

/**
 * Capital Manager Sizing Engine
 * SOLE OWNER of financial position sizing, lot/unit calculation,
 * required margin, expected notional, and expected risk calculations.
 */
export function calculateCapitalManagerPositionPlan(params: {
  provider: BrainProvider;
  decision: ExecutionDecision;
  signal: SignalContract;
  context: AccountExecutionContext;
  policy: AccountPolicy;
  contract_spec?: {
    quantity_step?: number;
    quantity_precision?: number;
    tick_size?: number;
    price_precision?: number;
    min_quantity?: number;
    max_quantity?: number;
    min_notional?: number;
    max_notional?: number;
    contract_size?: number;
  };
}): PositionPlan | null {
  const { provider, decision, signal, context, policy, contract_spec } = params;

  if (decision.decision !== "EXECUTE" && decision.decision !== "REDUCE_RISK") {
    return null;
  }

  const slDistance = Math.abs(signal.entry_price - signal.stop_loss);
  if (slDistance <= 0 || !Number.isFinite(slDistance)) {
    return null;
  }

  const authorizedRiskPct = decision.authorized_risk_pct;
  const targetRiskAmount = context.balance * (authorizedRiskPct / 100);
  const effectiveLeverage = Math.min(context.leverage, policy.max_leverage_allowed);

  let quantity = 0;
  let contractSize = 1;
  let expectedNotional = 0;

  if (provider === "MT5_PERSONAL" || provider === "MT5_PROP") {
    contractSize = contract_spec?.contract_size ??
      (signal.symbol.includes("XAU") || signal.symbol.includes("XAG") ? 100 : 100000);
    const rawLots = targetRiskAmount / (slDistance * contractSize);
    quantity = Math.floor(rawLots * 100) / 100;
    const minLot = contract_spec?.min_quantity ?? 0.01;
    const maxLot = contract_spec?.max_quantity ?? 100.0;
    if (quantity < minLot) quantity = minLot;
    if (quantity > maxLot) quantity = maxLot;

    expectedNotional = quantity * signal.entry_price * contractSize;
  } else {
    // BINANCE or BYBIT (Crypto futures)
    contractSize = 1;
    const rawQty = targetRiskAmount / slDistance;
    const step = contract_spec?.quantity_step ?? 0.001;
    const precision = contract_spec?.quantity_precision ?? 3;
    quantity = floorToIncrement(rawQty, step, precision);
    const minQty = contract_spec?.min_quantity ?? 0.001;
    const maxQty = contract_spec?.max_quantity ?? 100000.0;
    if (quantity < minQty) quantity = minQty;
    if (quantity > maxQty) quantity = maxQty;

    expectedNotional = quantity * signal.entry_price;
  }

  const requiredMargin = expectedNotional / effectiveLeverage;
  const actualRiskAmount = quantity * slDistance * contractSize;
  const actualRiskPct = context.balance > 0 ? (actualRiskAmount / context.balance) * 100 : 0;

  const planIdPrefix = provider.toLowerCase().replace("_", "");
  return Object.freeze({
    plan_id: `plan_${planIdPrefix}_${signal.signal_id}`,
    signal_id: signal.signal_id,
    account_id: context.account_id,
    symbol: signal.symbol,
    side: signal.direction,
    order_type: "MARKET",
    entry_price: signal.entry_price,
    stop_loss: signal.stop_loss,
    take_profit_1: signal.tp1,
    take_profit_2: signal.tp2,
    quantity,
    leverage: effectiveLeverage,
    required_margin: Number(requiredMargin.toFixed(2)),
    expected_risk_amount: Number(actualRiskAmount.toFixed(2)),
    expected_risk_pct: Number(actualRiskPct.toFixed(2)),
    expected_notional: Number(expectedNotional.toFixed(2)),
    contract_size: contractSize,
    time_in_force: "GTC",
    reduce_only: false,
    idempotency_key: `idemp_${planIdPrefix}_${signal.signal_id}_${context.account_id}`,
  });
}

