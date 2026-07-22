import { instrumentFor, roundInstrumentPrice, type ForexSessionName } from "./forex-domain.ts";

export interface ForexSignalDraft { symbol: string; direction: "BUY" | "SELL"; entry: number; stopLoss: number; tp1: number; tp2: number; tp3?: number; confidence: number; evidence: readonly string[]; session: ForexSessionName; strategy: string; expiresAt: string; marketRegime: string; qualityScore: number; invalidation: string; }
export interface ForexSignal extends ForexSignalDraft { riskReward: number; }
export function qualifyForexSignal(draft: ForexSignalDraft, now = new Date()): { ok: true; signal: ForexSignal } | { ok: false; reasons: string[] } {
  const instrument = instrumentFor(draft.symbol), prices = [draft.entry, draft.stopLoss, draft.tp1, draft.tp2, ...(draft.tp3 ? [draft.tp3] : [])], reasons: string[] = [];
  if (!instrument?.productionEnabled) reasons.push("instrument_not_enabled");
  if (!prices.every((value) => Number.isFinite(value) && value > 0)) reasons.push("invalid_price");
  const long = draft.direction === "BUY", ordered = long ? draft.stopLoss < draft.entry && draft.tp1 > draft.entry && draft.tp2 > draft.tp1 : draft.stopLoss > draft.entry && draft.tp1 < draft.entry && draft.tp2 < draft.tp1;
  if (!ordered) reasons.push("invalid_price_structure");
  if (draft.confidence < 70 || draft.qualityScore < 70) reasons.push("insufficient_quality");
  if (draft.evidence.length < 3) reasons.push("insufficient_evidence");
  if (!draft.strategy || !draft.marketRegime || !draft.invalidation) reasons.push("missing_explanation");
  if (draft.session === "CLOSED") reasons.push("market_closed");
  if (!Number.isFinite(Date.parse(draft.expiresAt)) || Date.parse(draft.expiresAt) <= now.getTime()) reasons.push("expired");
  const risk = Math.abs(draft.entry - draft.stopLoss), riskReward = risk ? Math.abs(draft.tp2 - draft.entry) / risk : 0;
  if (riskReward < 1.5) reasons.push("risk_reward_below_minimum");
  if (reasons.length) return { ok: false, reasons: [...new Set(reasons)] };
  return { ok: true, signal: { ...draft, symbol: instrument!.id, entry: roundInstrumentPrice(instrument!.id, draft.entry), stopLoss: roundInstrumentPrice(instrument!.id, draft.stopLoss), tp1: roundInstrumentPrice(instrument!.id, draft.tp1), tp2: roundInstrumentPrice(instrument!.id, draft.tp2), ...(draft.tp3 ? { tp3: roundInstrumentPrice(instrument!.id, draft.tp3) } : {}), riskReward: Number(riskReward.toFixed(2)) } };
}

export interface ForexPositionSizingInput { symbol: string; equity: number; riskPercent: number; entry: number; stopLoss: number; quoteToAccountRate?: number; profile: "personal" | "prop"; availableExposure: number; }
/** Forex adapter only converts pip/value mechanics. Portfolio and limit approval stays in ROOT risk/capital. */
export function forexRiskAdapter(input: ForexPositionSizingInput): { lots: number; riskAmount: number; stopPips: number; notional: number; leverageGuidance: number } | null {
  const instrument = instrumentFor(input.symbol); if (!instrument || input.equity <= 0 || input.riskPercent <= 0 || input.availableExposure <= 0) return null;
  const stopPips = Math.abs(input.entry - input.stopLoss) / instrument.pipSize; if (!Number.isFinite(stopPips) || stopPips <= 0) return null;
  const cappedRisk = Math.min(input.riskPercent, input.profile === "prop" ? .5 : 1), riskAmount = input.equity * cappedRisk / 100;
  const pipValuePerLot = instrument.quoteCurrency === "JPY" ? (100000 * instrument.pipSize / input.entry) * (input.quoteToAccountRate ?? 1) : 100000 * instrument.pipSize * (input.quoteToAccountRate ?? 1);
  const lots = Math.floor(Math.min(riskAmount / (stopPips * pipValuePerLot), input.availableExposure / (input.entry * 100000)) * 100) / 100;
  const notional = lots * 100000 * input.entry;
  return lots > 0 ? { lots, riskAmount: Number((stopPips * pipValuePerLot * lots).toFixed(2)), stopPips: Number(stopPips.toFixed(1)), notional: Number(notional.toFixed(2)), leverageGuidance: Math.max(1, Math.ceil(notional / input.equity)) } : null;
}
