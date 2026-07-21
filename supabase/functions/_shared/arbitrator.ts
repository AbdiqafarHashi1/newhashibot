/** Pure root arbitrator. It has no database, network, Telegram, or execution access. */
export type ArbitrationSide = "buy" | "sell";
export interface ArbitrationCandidate {
  id: string; strategyId: string; strategyVersion: string; market: "crypto" | "forex"; symbol: string; timeframe: string;
  side: ArbitrationSide; confidence: number; grade: string; score: number; entry: number; stop: number; targets: readonly number[];
  riskReward: number; expiry: string; fresh: boolean; lifecycle: "ENABLED" | "DISABLED" | "RESEARCH";
  publicationMode: "LIVE" | "SHADOW"; evidence: Readonly<Record<string, unknown>>; rejectionReasons: readonly string[];
  priority?: number; eligible?: boolean;
}
export interface ArbitrationRejection { candidateId: string; reasons: string[]; evidence: Record<string, unknown>; }
export interface ArbitrationResult {
  decision: "WINNER" | "NO_TRADE"; winner?: ArbitrationCandidate; considered: readonly ArbitrationCandidate[];
  rejected: readonly ArbitrationRejection[]; tieBreakEvidence: readonly string[]; version: string; decisionKey: string;
  evidence: Record<string, unknown>;
}
export interface ArbitrationOptions { now: Date; minimumScore?: number; minimumRiskReward?: number; allowedGrades?: readonly string[]; forceNoTradeReason?: string; noTradePolicy?: (rankedEligible: readonly ArbitrationCandidate[]) => string | undefined; }
export const ARBITRATOR_VERSION = "arbitrator.root-compat-v1";

const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
function hash(input: string): string { let h1 = 0x811c9dc5; for (let i = 0; i < input.length; i++) { h1 ^= input.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); } return `arb_${(h1 >>> 0).toString(16).padStart(8, "0")}`; }

function rejectionReasons(c: ArbitrationCandidate, options: ArbitrationOptions): string[] {
  const reasons: string[] = [];
  if (c.lifecycle !== "ENABLED" || c.publicationMode !== "LIVE") reasons.push("research_or_non_live_excluded");
  if (c.eligible === false) reasons.push("legacy_gate_rejected");
  if (!c.fresh) reasons.push("stale_candidate");
  if (!Number.isFinite(Date.parse(c.expiry)) || Date.parse(c.expiry) <= options.now.getTime()) reasons.push("expired_candidate");
  if (![c.confidence, c.score, c.entry, c.stop, c.riskReward, ...c.targets].every(Number.isFinite)) reasons.push("non_finite_value");
  if (c.entry <= 0 || c.stop <= 0 || c.targets.length === 0 || c.targets.some((v) => v <= 0)) reasons.push("invalid_price_structure");
  if ((c.side === "buy" && !(c.stop < c.entry && c.targets.every((t) => t > c.entry))) || (c.side === "sell" && !(c.stop > c.entry && c.targets.every((t) => t < c.entry)))) reasons.push("invalid_price_structure");
  if (c.riskReward <= 0 || c.riskReward < (options.minimumRiskReward ?? 0)) reasons.push("invalid_risk_reward");
  if (c.score < (options.minimumScore ?? 0)) reasons.push("below_score_threshold");
  if (options.allowedGrades && !options.allowedGrades.includes(c.grade)) reasons.push("grade_filtered");
  return [...new Set(reasons)];
}

export function arbitrate(candidates: readonly ArbitrationCandidate[], options: ArbitrationOptions): ArbitrationResult {
  const snapshot = candidates.map((candidate) => ({ ...candidate, targets: [...candidate.targets], evidence: { ...candidate.evidence }, rejectionReasons: [...candidate.rejectionReasons] }));
  const rejected: ArbitrationRejection[] = [];
  const eligible = snapshot.filter((candidate) => { const reasons = rejectionReasons(candidate, options); if (reasons.length) rejected.push({ candidateId: candidate.id, reasons, evidence: { lifecycle: candidate.lifecycle, publication_mode: candidate.publicationMode } }); return reasons.length === 0; });
  eligible.sort((a, b) => { const delta = b.score - a.score; return Math.abs(delta) > 0.0001 ? delta : (b.priority ?? 0) - (a.priority ?? 0) || b.riskReward - a.riskReward; });
  const ties = eligible.length > 1 && Math.abs(eligible[0].score - eligible[1].score) <= 0.0001;
  const forced = options.forceNoTradeReason || options.noTradePolicy?.(eligible) || undefined;
  const winner = !forced ? eligible[0] : undefined;
  for (const loser of eligible.slice(winner ? 1 : 0)) rejected.push({ candidateId: loser.id, reasons: [forced ? "arbitration_no_trade" : "arbitration_blocked"], evidence: { selected_candidate: winner?.id ?? null, force_no_trade_reason: forced ?? null } });
  const decision = winner ? "WINNER" : "NO_TRADE";
  const keyPayload = { version: ARBITRATOR_VERSION, decision, winner: winner?.id ?? null, candidates: snapshot.map((c) => ({ id: c.id, score: c.score, priority: c.priority ?? 0, rr: c.riskReward })), rejected: rejected.map((r) => ({ id: r.candidateId, reasons: r.reasons })), forced: forced ?? null };
  return { decision, winner, considered: [...eligible, ...snapshot.filter((candidate) => !eligible.some((item) => item.id === candidate.id))], rejected, tieBreakEvidence: ties ? ["score_tie", "identity_fit_priority", "risk_reward"] : [], version: ARBITRATOR_VERSION, decisionKey: hash(canonical(keyPayload)), evidence: { policy: "legacy_arbitration_score_then_identity_fit_then_rr", forced_no_trade_reason: forced ?? null, immutable_snapshot: true } };
}

export class ArbitrationDiagnostics {
  private values = { candidates_received: 0, candidates_eligible: 0, candidates_rejected: 0, rejection_reasons: {} as Record<string, number>, winners: 0, no_trade_decisions: 0, ties: 0, stale_candidates: 0, expired_candidates: 0, invalid_price_structures: 0, invalid_risk_reward: 0, conflicting_sides: 0, research_candidates_excluded: 0, arbitrator_failures: 0, decision_duration_ms: 0, last_decision_key: null as string | null, arbitrator_version: ARBITRATOR_VERSION };
  record(result: ArbitrationResult, durationMs = 0) { const gateRejected = new Set(result.rejected.filter((r) => r.reasons.some((reason) => !["arbitration_blocked", "arbitration_no_trade"].includes(reason))).map((r) => r.candidateId)); this.values.candidates_received += result.considered.length; this.values.candidates_eligible += result.considered.length - gateRejected.size; this.values.candidates_rejected += result.rejected.length; this.values.winners += result.decision === "WINNER" ? 1 : 0; this.values.no_trade_decisions += result.decision === "NO_TRADE" ? 1 : 0; this.values.ties += result.tieBreakEvidence.length ? 1 : 0; this.values.conflicting_sides += new Set(result.considered.map((c) => c.side)).size > 1 ? 1 : 0; this.values.decision_duration_ms += durationMs; this.values.last_decision_key = result.decisionKey; for (const r of result.rejected) for (const reason of r.reasons) { this.values.rejection_reasons[reason] = (this.values.rejection_reasons[reason] ?? 0) + 1; if (reason === "stale_candidate") this.values.stale_candidates++; if (reason === "expired_candidate") this.values.expired_candidates++; if (reason === "invalid_price_structure") this.values.invalid_price_structures++; if (reason === "invalid_risk_reward") this.values.invalid_risk_reward++; if (reason === "research_or_non_live_excluded") this.values.research_candidates_excluded++; } }
  failure() { this.values.arbitrator_failures++; }
  researchExcluded(count = 1) { this.values.research_candidates_excluded += count; }
  snapshot() { return structuredClone(this.values); }
}
