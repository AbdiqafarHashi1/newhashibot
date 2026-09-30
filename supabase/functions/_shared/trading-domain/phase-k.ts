import { arbitrateCanonical } from "./arbitrator.ts";
import type { ArbitrationDecision, CanonicalSignal, DomainCandle, DomainTimeframe, PriceObservation } from "./contracts.ts";
import { runCanonicalScanner, type CanonicalScannerInput, type CanonicalScannerResult } from "./scanner-runtime.ts";

export const PHASE_K_EXECUTION_ENABLED = false as const;
export const PHASE_K_LIMITS = Object.freeze({ symbols: 31, cryptoSymbols: 25, forexSymbols: 6, timeframes: 4, requests: 124, retries: 2, concurrency: 4 });
export const PHASE_K_FOREX_UNIVERSE = Object.freeze(["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"] as const);

export type FeedRejection = "MISSING_CANDLES" | "MALFORMED_CANDLE" | "DUPLICATE_CANDLE" | "STALE_CANDLE" | "MUTABLE_CANDLE";
export type SafeState = "COMPLETE" | "NO_TRADE" | "BLOCKED";
export interface CycleAudit {
  version: "phase-k-cycle/v1"; runId: string; cycleKey: string; adapter: "CRYPTO" | "FOREX"; symbol: string; timeframe: DomainTimeframe;
  source: string; candleCloseTime: string | null; strategyIdentities: CanonicalScannerResult["identities"]; candidateIds: readonly string[];
  qualification: readonly { strategyId: string; decision: "CANDIDATE" | "NO_TRADE"; reasons: readonly string[] }[];
  arbitration: ArbitrationDecision; publication: { decision: "PUBLISH" | "SUPPRESS"; reason: string; workId: string | null };
  signalId: string | null; safeState: SafeState; errors: readonly string[]; executionSideEffects: 0;
}

function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`; }
export function phaseKHash(prefix: string, value: unknown): string { let h = 2166136261; for (const c of stable(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return `${prefix}_${(h >>> 0).toString(16).padStart(8, "0")}`; }
const width: Record<DomainTimeframe, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

export function validateClosedCandles(candles: readonly DomainCandle[] | undefined, asOf: string, maxAgeBars = 2): { candles: readonly DomainCandle[]; rejection: FeedRejection | null; closeTime: string | null } {
  if (!candles?.length) return { candles: [], rejection: "MISSING_CANDLES", closeTime: null };
  const now = Date.parse(asOf), seen = new Set<string>();
  if (!Number.isFinite(now)) throw new Error("INVALID_AS_OF");
  for (const candle of candles) {
    const open = Date.parse(candle.openTime), key = `${candle.symbol}|${candle.timeframe}|${candle.openTime}`;
    if (!Number.isFinite(open) || ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) || candle.low > candle.high || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high) return { candles: [], rejection: "MALFORMED_CANDLE", closeTime: null };
    if (seen.has(key)) return { candles: [], rejection: "DUPLICATE_CANDLE", closeTime: null }; seen.add(key);
    if (open + width[candle.timeframe] > now) return { candles: [], rejection: "MUTABLE_CANDLE", closeTime: null };
  }
  const ordered = [...candles].sort((a, b) => a.openTime.localeCompare(b.openTime)), last = ordered[ordered.length - 1], close = Date.parse(last.openTime) + width[last.timeframe];
  if (now - close > width[last.timeframe] * maxAgeBars) return { candles: [], rejection: "STALE_CANDLE", closeTime: new Date(close).toISOString() };
  return { candles: Object.freeze(ordered), rejection: null, closeTime: new Date(close).toISOString() };
}

export class PhaseKTruthStore {
  readonly cycles = new Map<string, CycleAudit>(); readonly signals = new Map<string, CanonicalSignal>(); readonly publication = new Map<string, { id: string; signalId: string; status: "PENDING" }>();
  claim(key: string): boolean { if (this.cycles.has(key)) return false; return true; }
  commit(cycle: CycleAudit, signal: CanonicalSignal | null): CycleAudit {
    if (this.cycles.has(cycle.cycleKey)) return this.cycles.get(cycle.cycleKey)!;
    if (signal && this.signals.has(signal.id) && stable(this.signals.get(signal.id)) !== stable(signal)) throw new Error("IMMUTABLE_SIGNAL_CONFLICT");
    if (signal) this.signals.set(signal.id, signal);
    if (cycle.publication.workId && signal) this.publication.set(cycle.publication.workId, { id: cycle.publication.workId, signalId: signal.id, status: "PENDING" });
    const frozen = Object.freeze(cycle); this.cycles.set(cycle.cycleKey, frozen); return frozen;
  }
}

export function runPhaseKCycle(input: { adapter: "CRYPTO" | "FOREX"; source: string; scanner: CanonicalScannerInput; store: PhaseKTruthStore; activeSignalSymbols?: readonly string[]; cooldownSymbols?: readonly string[] }): CycleAudit {
  if (input.scanner.datasets && Object.keys(input.scanner.datasets).length > PHASE_K_LIMITS.timeframes) throw new Error("UNSAFE_TIMEFRAME_COUNT");
  const primary = input.scanner.strategies[0] ? input.scanner.datasets[Object.keys(input.scanner.datasets)[0]] : undefined;
  const validations = Object.values(input.scanner.datasets).map(candles => validateClosedCandles(candles, input.scanner.asOf));
  const checked = validations.find(result => result.rejection) ?? validateClosedCandles(primary, input.scanner.asOf);
  const configuration = input.scanner.strategies.map(s => ({ id: s.strategyId, configurationVersion: s.configurationVersion, parameters: s.parameters ?? {} }));
  const cycleKey = phaseKHash("cycle", { adapter: input.adapter, symbol: input.scanner.symbol, interval: input.scanner.asOf, configuration });
  const runId = phaseKHash("run", cycleKey);
  const blocked = checked.rejection ?? (input.activeSignalSymbols?.includes(input.scanner.symbol) ? "ACTIVE_SIGNAL" : input.cooldownSymbols?.includes(input.scanner.symbol) ? "COOLDOWN" : null);
  if (blocked) {
    const arbitration = arbitrateCanonical([], { minimumScore: input.scanner.minimumScore, blockedSymbols: [] });
    return input.store.commit({ version: "phase-k-cycle/v1", runId, cycleKey, adapter: input.adapter, symbol: input.scanner.symbol, timeframe: primary?.[0]?.timeframe ?? "15m", source: input.source, candleCloseTime: checked.closeTime, strategyIdentities: [], candidateIds: [], qualification: [], arbitration, publication: { decision: "SUPPRESS", reason: blocked, workId: null }, signalId: null, safeState: "BLOCKED", errors: [blocked], executionSideEffects: 0 }, null);
  }
  if (!input.store.claim(cycleKey)) return input.store.cycles.get(cycleKey)!;
  const result = runCanonicalScanner(input.scanner), publishable = result.signal !== null && result.signal.evidence && result.arbitration.chosen!.score >= 75;
  const workId = publishable ? phaseKHash("publish", { signalId: result.signal!.id, audience: "SIGNAL_TRUTH" }) : null;
  return input.store.commit({ version: "phase-k-cycle/v1", runId, cycleKey, adapter: input.adapter, symbol: input.scanner.symbol, timeframe: primary![0].timeframe, source: input.source, candleCloseTime: checked.closeTime, strategyIdentities: result.identities, candidateIds: result.candidates.map(c => c.id), qualification: result.evaluations.map(e => ({ strategyId: e.strategyId, decision: e.decision, reasons: e.decision === "NO_TRADE" ? e.reasonCodes : e.evidence.reasonCodes })), arbitration: result.arbitration, publication: { decision: publishable ? "PUBLISH" : "SUPPRESS", reason: publishable ? "GRADE_A_OR_A_PLUS" : "NO_QUALIFIED_WINNER", workId }, signalId: result.signal?.id ?? null, safeState: result.signal ? "COMPLETE" : "NO_TRADE", errors: [], executionSideEffects: 0 }, result.signal);
}

export interface CalibrationEvidence { datasetIds: readonly string[]; range: { from: string; to: string }; symbol: string; timeframe: DomainTimeframe; costs: { spread: number; slippage: number; commission: number }; strategy: { id: string; codeVersion: string; parameterVersion: string }; selectionTimes: readonly string[]; holdoutTimes: readonly string[]; outputHash: string; verdict: "CERTIFIED_FOR_SIGNAL_MODE" | "MONITOR" | "RESEARCH" | "FAILED" | "BLOCKED"; flags: readonly string[]; }
export function calibrationEvidence(input: Omit<CalibrationEvidence, "outputHash" | "verdict" | "flags"> & { liveProviderVerified: boolean; sampleSize: number }): CalibrationEvidence {
  const overlap = input.selectionTimes.some(t => input.holdoutTimes.includes(t)), flags = [...(overlap ? ["TRAIN_HOLDOUT_OVERLAP"] : []), ...(input.sampleSize < 100 ? ["THIN_SAMPLE"] : []), ...(!input.liveProviderVerified ? ["NO_LIVE_PROVIDER_EVIDENCE"] : [])];
  const verdict = overlap ? "FAILED" : !input.liveProviderVerified ? "BLOCKED" : input.sampleSize < 100 ? "MONITOR" : "CERTIFIED_FOR_SIGNAL_MODE";
  const core = { datasetIds: input.datasetIds, range: input.range, symbol: input.symbol, timeframe: input.timeframe, costs: input.costs, strategy: input.strategy, selectionTimes: input.selectionTimes, holdoutTimes: input.holdoutTimes };
  return Object.freeze({ ...core, outputHash: phaseKHash("calibration", core), verdict, flags });
}

export function projectSignal(signal: CanonicalSignal, audience: "FREE" | "VIP" | "OWNER_RESEARCH" | "ADMIN_DIAGNOSTIC") { return Object.freeze({ eventId: phaseKHash("projection", { signalId: signal.id, audience }), signalId: signal.id, audience, deliveryAttempted: false, content: audience === "FREE" ? { symbol: signal.symbol, side: signal.side, delayed: true } : audience === "VIP" ? { symbol: signal.symbol, side: signal.side, entry: signal.entry, stop: signal.stop, targets: signal.targets } : { signal } }); }
export function evaluateSignalOutcome(signal: CanonicalSignal, observations: readonly PriceObservation[], expiry: string) {
  const ordered = [...observations].filter(o => o.timestamp >= signal.decisionTimestamp).sort((a, b) => a.timestamp.localeCompare(b.timestamp)); let state: "TP" | "SL" | "EXPIRY" | "UNRESOLVED" = "UNRESOLVED", at: string | null = null;
  for (const o of ordered) { const stop = signal.side === "BUY" ? o.low <= signal.stop : o.high >= signal.stop, tp = signal.side === "BUY" ? o.high >= signal.targets[0] : o.low <= signal.targets[0]; if (stop || tp) { state = stop ? "SL" : "TP"; at = o.timestamp; break; } if (o.timestamp >= expiry) { state = "EXPIRY"; at = o.timestamp; break; } }
  return Object.freeze({ id: phaseKHash("outcome", { signalId: signal.id, state, at, expiry }), signalId: signal.id, state, at, immutableSignal: true });
}
