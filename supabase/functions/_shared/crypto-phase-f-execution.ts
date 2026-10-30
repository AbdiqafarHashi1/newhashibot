/**
 * Phase-F fail-closed boundary from a Phase-D account intent to the existing
 * certified Binance/Bybit adoption worker. It validates and normalizes only;
 * submission and lifecycle commands remain owned by the existing authorities.
 */
export const CRYPTO_PHASE_F_VERSION = "crypto-phase-f/v1" as const;
export type CryptoProvider = "BINANCE" | "BYBIT";
export type CryptoLifecycleState = "ENTRY_SUBMITTED" | "SUBMISSION_UNCERTAIN" | "RECONCILING" | "REJECTED" | "PARTIALLY_FILLED" | "ENTRY_FILLED" | "PROTECTION_PENDING" | "PROTECTION_VERIFIED" | "PROTECTION_INCIDENT" | "SAFETY_CLOSING" | "TP1_FILLED" | "BREAKEVEN" | "PROFIT_LOCKED" | "TRAILING" | "CLOSED";

export interface CryptoPhaseDLineage {
  decisionId: string; intentId: string; signalId: string; customerId: string;
  executionAccountId: string; immutableAccountIdentity: string; provider: CryptoProvider;
  decision: "ALLOW" | "REDUCE" | "BLOCK" | "LOCK"; policyProfileId: string;
  policyVersion: string; brainVersion: string; authorizedRiskPct: number;
  approvedQuantity: number; evaluatedAt: string;
}
export interface CryptoRouteTruth {
  provider: CryptoProvider; executionAccountId: string; customerId: string;
  immutableAccountIdentity: string; environment: "TESTNET" | "DEMO" | "LIVE";
  liveAuthorized?: boolean; executionEnabled: boolean; operational: boolean; providerHealth: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  symbol: string; symbolStatus: string; symbolObservedAt: string;
  tickSize: number; stepSize: number; minimumQuantity: number; minimumNotional: number;
  permissions: { trading: boolean; withdrawal: boolean | null; verified: boolean };
}
export interface NormalizationFact { field: "quantity" | "price"; requested: number; submitted: number; reason: string; }
export interface CryptoSubmissionEnvelope {
  version: typeof CRYPTO_PHASE_F_VERSION; provider: CryptoProvider; environment: "TESTNET" | "DEMO" | "LIVE";
  deterministicClientOrderId: string; idempotencyKey: string; customerId: string; accountId: string;
  symbol: string; requestedQuantity: number; submittedQuantity: number; requestedPrice: number;
  submittedPrice: number; authorizedRiskPct: number; normalization: readonly NormalizationFact[];
  lineage: Readonly<Record<string, string>>;
}
export class CryptoPhaseFRejection extends Error { constructor(readonly code: string) { super(code); this.name = "CryptoPhaseFRejection"; } }
function requireValue(value: unknown, code: string): asserts value { if (!value) throw new CryptoPhaseFRejection(code); }
function decimals(increment: number): number { const text = increment.toString().toLowerCase(); if (text.includes("e-")) return Number(text.split("e-")[1]); return (text.split(".")[1] ?? "").length; }
function floorTo(value: number, increment: number): number { const scale = 10 ** decimals(increment); return Math.floor((value * scale + 1e-9) / (increment * scale)) * increment; }
function roundTo(value: number, increment: number): number { const scale = 10 ** decimals(increment); return Math.round((value * scale) / (increment * scale)) * increment; }

export function createCryptoSubmissionEnvelope(input: { lineage: CryptoPhaseDLineage; route: CryptoRouteTruth; deterministicClientOrderId: string; requestedPrice: number; now: string; maximumIntentAgeMs: number; maximumSymbolAgeMs: number }): Readonly<CryptoSubmissionEnvelope> {
  const { lineage, route } = input;
  requireValue(lineage.decision === "ALLOW" || lineage.decision === "REDUCE", "PHASE_D_DECISION_NOT_EXECUTABLE");
  requireValue(Boolean(lineage.decisionId && lineage.intentId && lineage.signalId), "PHASE_D_LINEAGE_MISSING");
  requireValue(lineage.customerId === route.customerId, "CUSTOMER_SCOPE_MISMATCH");
  requireValue(lineage.executionAccountId === route.executionAccountId, "ACCOUNT_SCOPE_MISMATCH");
  requireValue(lineage.immutableAccountIdentity === route.immutableAccountIdentity, "ACCOUNT_IDENTITY_MISMATCH");
  requireValue(lineage.provider === route.provider, "PROVIDER_SCOPE_MISMATCH");
  requireValue((route.provider === "BINANCE" && route.environment === "TESTNET") || (route.provider === "BYBIT" && route.environment === "DEMO") || (route.environment === "LIVE" && route.liveAuthorized === true), "LIVE_EXECUTION_FORBIDDEN");
  requireValue(route.executionEnabled && route.operational && route.providerHealth === "HEALTHY", "PROVIDER_ROUTE_NOT_READY");
  requireValue(route.permissions.verified && route.permissions.trading, "TRADING_PERMISSION_NOT_VERIFIED");
  requireValue(route.permissions.withdrawal !== true, "UNSAFE_WITHDRAWAL_PERMISSION");
  requireValue(route.symbol.length > 0 && ["TRADING", "AVAILABLE"].includes(route.symbolStatus.toUpperCase()), "SYMBOL_NOT_AVAILABLE");
  requireValue([route.tickSize, route.stepSize, route.minimumQuantity].every((n) => Number.isFinite(n) && n > 0) && Number.isFinite(route.minimumNotional) && route.minimumNotional >= 0, "SYMBOL_RULES_INVALID");
  const intentAge = Date.parse(input.now) - Date.parse(lineage.evaluatedAt);
  requireValue(Number.isFinite(intentAge) && intentAge >= 0 && intentAge <= input.maximumIntentAgeMs, "CRYPTO_INTENT_STALE");
  const symbolAge = Date.parse(input.now) - Date.parse(route.symbolObservedAt);
  requireValue(Number.isFinite(symbolAge) && symbolAge >= 0 && symbolAge <= input.maximumSymbolAgeMs, "SYMBOL_RULES_STALE");
  requireValue(Number.isFinite(lineage.approvedQuantity) && lineage.approvedQuantity > 0, "APPROVED_QUANTITY_INVALID");
  requireValue(Number.isFinite(lineage.authorizedRiskPct) && lineage.authorizedRiskPct > 0, "AUTHORIZED_RISK_INVALID");
  requireValue(Number.isFinite(input.requestedPrice) && input.requestedPrice > 0, "REQUESTED_PRICE_INVALID");
  const quantity = floorTo(lineage.approvedQuantity, route.stepSize);
  const price = roundTo(input.requestedPrice, route.tickSize);
  requireValue(quantity > 0 && quantity >= route.minimumQuantity, "MINIMUM_QUANTITY_NOT_MET");
  requireValue(quantity * price >= route.minimumNotional, "MINIMUM_NOTIONAL_NOT_MET");
  const normalization: NormalizationFact[] = [];
  if (quantity !== lineage.approvedQuantity) normalization.push({ field:"quantity", requested:lineage.approvedQuantity, submitted:quantity, reason:`${route.provider}_STEP_SIZE:${route.stepSize}` });
  if (price !== input.requestedPrice) normalization.push({ field:"price", requested:input.requestedPrice, submitted:price, reason:`${route.provider}_TICK_SIZE:${route.tickSize}` });
  return Object.freeze({ version:CRYPTO_PHASE_F_VERSION, provider:route.provider, environment:route.environment as "TESTNET"|"DEMO"|"LIVE", deterministicClientOrderId:input.deterministicClientOrderId, idempotencyKey:`${route.executionAccountId}:${lineage.intentId}:${input.deterministicClientOrderId}`, customerId:lineage.customerId, accountId:lineage.executionAccountId, symbol:route.symbol, requestedQuantity:lineage.approvedQuantity, submittedQuantity:quantity, requestedPrice:input.requestedPrice, submittedPrice:price, authorizedRiskPct:lineage.authorizedRiskPct, normalization:Object.freeze(normalization.map(Object.freeze)), lineage:Object.freeze({ signalId:lineage.signalId, decisionId:lineage.decisionId, intentId:lineage.intentId, policyProfileId:lineage.policyProfileId, policyVersion:lineage.policyVersion, brainVersion:lineage.brainVersion, immutableAccountIdentity:lineage.immutableAccountIdentity }) });
}

export type CryptoLifecycleEvent = "ORDER_REJECTED"|"SUBMISSION_UNCERTAIN"|"RECONCILIATION_STARTED"|"PARTIAL_FILL"|"ENTRY_FILLED"|"PROTECTION_REQUESTED"|"PROTECTION_VERIFIED"|"PROTECTION_MISSING"|"PROTECTION_FAILED"|"SAFETY_CLOSE_REQUESTED"|"TP1_FILLED"|"BREAKEVEN_CONFIRMED"|"PROFIT_LOCK_CONFIRMED"|"TRAILING_ACTIVE"|"TP2_FILLED"|"TERMINAL_EXIT";
export function projectCryptoLifecycle(current: CryptoLifecycleState, event: CryptoLifecycleEvent): CryptoLifecycleState {
  const next: Record<CryptoLifecycleEvent,CryptoLifecycleState> = { ORDER_REJECTED:"REJECTED", SUBMISSION_UNCERTAIN:"SUBMISSION_UNCERTAIN", RECONCILIATION_STARTED:"RECONCILING", PARTIAL_FILL:"PARTIALLY_FILLED", ENTRY_FILLED:"ENTRY_FILLED", PROTECTION_REQUESTED:"PROTECTION_PENDING", PROTECTION_VERIFIED:"PROTECTION_VERIFIED", PROTECTION_MISSING:"PROTECTION_INCIDENT", PROTECTION_FAILED:"PROTECTION_INCIDENT", SAFETY_CLOSE_REQUESTED:"SAFETY_CLOSING", TP1_FILLED:"TP1_FILLED", BREAKEVEN_CONFIRMED:"BREAKEVEN", PROFIT_LOCK_CONFIRMED:"PROFIT_LOCKED", TRAILING_ACTIVE:"TRAILING", TP2_FILLED:"CLOSED", TERMINAL_EXIT:"CLOSED" };
  if (event === "PROTECTION_VERIFIED" && !["PROTECTION_PENDING","PROTECTION_INCIDENT","RECONCILING"].includes(current)) throw new CryptoPhaseFRejection("PROTECTION_VERIFICATION_OUT_OF_SEQUENCE");
  if (event === "PROTECTION_REQUESTED" && !["ENTRY_FILLED","PARTIALLY_FILLED","PROTECTION_INCIDENT","RECONCILING"].includes(current)) throw new CryptoPhaseFRejection("PROTECTION_REQUEST_OUT_OF_SEQUENCE");
  return next[event];
}

export function safeCryptoExecutionProjection(envelope: CryptoSubmissionEnvelope) { return Object.freeze({ ...envelope, lineage:envelope.lineage }); }
