export type PaperLifecycleStatus = "PENDING_ENTRY" | "OPEN" | "PROTECTED" | "TP1_HIT" | "BREAK_EVEN" | "TP2_HIT" | "STOPPED" | "EXPIRED" | "CANCELLED" | "CLOSED";
export type PaperSide = "buy" | "sell";
export type PaperMarket = "crypto" | "forex" | "gold";
export type PaperClosureReason = "TP2" | "STOP_LOSS" | "BREAK_EVEN_STOP" | "EXPIRED" | "CANCELLED" | null;

export interface PaperCandle { open_time: string; close_time?: string; open: number; high: number; low: number; close: number; closed?: boolean; }
export interface PaperTransitionEvidence { key: string; from: PaperLifecycleStatus; to: PaperLifecycleStatus; at: string; candle_time: string | null; reason: string; price: number | null; conservative_ambiguity: boolean; lifecycle_version: number; }
export interface PaperTrade {
  paper_trade_id: string; signal_id: string; strategy_id: string; strategy_version: string; market: PaperMarket; provider: string; symbol: string; timeframe: string; side: PaperSide;
  entry_low: number; entry_high: number; effective_entry: number | null; stop_loss: number; tp1: number; tp2: number; later_targets: readonly number[]; risk_reward: number; normalized_size: number;
  opened_at: string | null; closed_at: string | null; expires_at: string; status: PaperLifecycleStatus; closure_reason: PaperClosureReason; realized_r: number | null; mfe_r: number; mae_r: number;
  latest_evaluated_candle: string | null; transition_evidence: readonly PaperTransitionEvidence[]; transition_keys: readonly string[]; lifecycle_version: number; idempotency_key: string;
}
export interface NewPaperTrade { signal_id: string; strategy_id: string; strategy_version: string; market: PaperMarket; provider: string; symbol: string; timeframe: string; side: PaperSide; entry_low: number; entry_high: number; stop_loss: number; tp1: number; tp2: number; later_targets?: readonly number[]; risk_reward: number; normalized_size?: number; expires_at: string; }
export interface PaperEvaluationDiagnostics { candles_received: number; candles_processed: number; candles_skipped: number; duplicate_candles: number; future_candles: number; unclosed_candles: number; malformed_candles: number; invalid_transitions: number; duplicate_events_suppressed: number; gaps_detected: number; }
export interface PaperEvaluation { trade: PaperTrade; events: readonly PaperTransitionEvidence[]; diagnostics: PaperEvaluationDiagnostics; }

export const PAPER_TRANSITIONS: Readonly<Record<PaperLifecycleStatus, readonly PaperLifecycleStatus[]>> = {
  PENDING_ENTRY: ["OPEN", "EXPIRED", "CANCELLED"], OPEN: ["PROTECTED", "TP1_HIT", "TP2_HIT", "STOPPED", "EXPIRED", "CANCELLED"], PROTECTED: ["TP1_HIT", "TP2_HIT", "STOPPED", "EXPIRED", "CANCELLED"],
  TP1_HIT: ["BREAK_EVEN", "TP2_HIT", "STOPPED", "EXPIRED", "CANCELLED"], BREAK_EVEN: ["TP2_HIT", "STOPPED", "EXPIRED", "CANCELLED"], TP2_HIT: ["CLOSED"], STOPPED: ["CLOSED"], EXPIRED: ["CLOSED"], CANCELLED: ["CLOSED"], CLOSED: [],
};

const TERMINAL = new Set<PaperLifecycleStatus>(["CLOSED"]);
function hash(value: string): string { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
export function paperTradeCreationKey(signalId: string, strategyId: string): string { return `paper:create:${hash(`${signalId}:${strategyId}`)}`; }
export function lifecycleEventKey(tradeId: string, to: PaperLifecycleStatus, version: number, candleTime: string | null): string { return `paper:${tradeId}:${to}:${version}:${candleTime ?? "none"}`; }

export function createPaperTrade(input: NewPaperTrade): PaperTrade {
  if (!input.signal_id || !input.strategy_id) throw new Error("paper_identity_required");
  if (!input.side || !["buy", "sell"].includes(input.side)) throw new Error("invalid_side");
  if (![input.entry_low, input.entry_high, input.stop_loss, input.tp1, input.tp2, input.risk_reward].every(Number.isFinite)) throw new Error("invalid_trade_prices");
  if (input.entry_low > input.entry_high) throw new Error("invalid_entry_range");
  const key = paperTradeCreationKey(input.signal_id, input.strategy_id);
  return { paper_trade_id: `pt_${hash(key)}`, ...input, later_targets: [...(input.later_targets ?? [])], normalized_size: input.normalized_size ?? 1, effective_entry: null, opened_at: null, closed_at: null, status: "PENDING_ENTRY", closure_reason: null, realized_r: null, mfe_r: 0, mae_r: 0, latest_evaluated_candle: null, transition_evidence: [], transition_keys: [], lifecycle_version: 1, idempotency_key: key };
}

function transition(trade: PaperTrade, to: PaperLifecycleStatus, at: string, candleTime: string | null, reason: string, price: number | null, ambiguity = false): { trade: PaperTrade; event: PaperTransitionEvidence | null; invalid: boolean; duplicate: boolean } {
  if (trade.status === to || trade.transition_keys.includes(lifecycleEventKey(trade.paper_trade_id, to, trade.lifecycle_version + 1, candleTime))) return { trade, event: null, invalid: false, duplicate: true };
  if (!PAPER_TRANSITIONS[trade.status].includes(to)) return { trade, event: null, invalid: true, duplicate: false };
  const version = trade.lifecycle_version + 1, key = lifecycleEventKey(trade.paper_trade_id, to, version, candleTime);
  const event: PaperTransitionEvidence = { key, from: trade.status, to, at, candle_time: candleTime, reason, price, conservative_ambiguity: ambiguity, lifecycle_version: version };
  return { trade: { ...trade, status: to, lifecycle_version: version, transition_keys: [...trade.transition_keys, key], transition_evidence: [...trade.transition_evidence, event] }, event, invalid: false, duplicate: false };
}

function closeAfter(trade: PaperTrade, at: string, candleTime: string | null, reason: Exclude<PaperClosureReason, null>, realizedR: number, events: PaperTransitionEvidence[], diagnostics: PaperEvaluationDiagnostics): PaperTrade {
  const result = transition(trade, "CLOSED", at, candleTime, `closed:${reason.toLowerCase()}`, null);
  if (result.invalid) diagnostics.invalid_transitions++; if (result.duplicate) diagnostics.duplicate_events_suppressed++; if (result.event) events.push(result.event);
  return { ...result.trade, closure_reason: reason, realized_r: Number(realizedR.toFixed(4)), closed_at: at };
}

function intervalMs(timeframe: string): number | null { const m = /^(\d+)(m|h|d)$/.exec(timeframe); return m ? Number(m[1]) * (m[2] === "m" ? 60_000 : m[2] === "h" ? 3_600_000 : 86_400_000) : null; }
function precision(trade: PaperTrade): number { if (trade.market === "gold" || trade.symbol.toUpperCase() === "XAUUSD") return 2; if (trade.market === "forex") return trade.symbol.toUpperCase().endsWith("JPY") ? 3 : 5; return Math.abs(trade.entry_high) >= 100 ? 2 : 5; }
function round(trade: PaperTrade, value: number): number { return Number(value.toFixed(precision(trade))); }

export function evaluatePaperTrade(original: PaperTrade, inputCandles: readonly PaperCandle[], evaluatedAt: string): PaperEvaluation {
  let trade: PaperTrade = { ...original, transition_evidence: [...original.transition_evidence], transition_keys: [...original.transition_keys] };
  const diagnostics: PaperEvaluationDiagnostics = { candles_received: inputCandles.length, candles_processed: 0, candles_skipped: 0, duplicate_candles: 0, future_candles: 0, unclosed_candles: 0, malformed_candles: 0, invalid_transitions: 0, duplicate_events_suppressed: 0, gaps_detected: 0 };
  const events: PaperTransitionEvidence[] = [], interval = intervalMs(trade.timeframe), now = Date.parse(evaluatedAt), seen = new Set<string>();
  const candles = [...inputCandles].sort((a, b) => Date.parse(a.open_time) - Date.parse(b.open_time));
  let previousTime: number | null = null;
  for (const candle of candles) {
    const openTime = Date.parse(candle.open_time), closeTime = candle.close_time ? Date.parse(candle.close_time) : interval ? openTime + interval : NaN;
    if (!Number.isFinite(openTime) || !Number.isFinite(closeTime) || ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.high < candle.low) { diagnostics.malformed_candles++; diagnostics.candles_skipped++; continue; }
    if (seen.has(candle.open_time) || (trade.latest_evaluated_candle && openTime <= Date.parse(trade.latest_evaluated_candle))) { diagnostics.duplicate_candles++; diagnostics.candles_skipped++; continue; }
    seen.add(candle.open_time);
    if (closeTime > now) { diagnostics.future_candles++; diagnostics.candles_skipped++; continue; }
    if (candle.closed === false) { diagnostics.unclosed_candles++; diagnostics.candles_skipped++; continue; }
    if (previousTime !== null && interval && openTime - previousTime > interval) diagnostics.gaps_detected++;
    previousTime = openTime; diagnostics.candles_processed++; trade = { ...trade, latest_evaluated_candle: candle.open_time };
    if (TERMINAL.has(trade.status)) continue;
    if (Date.parse(trade.expires_at) <= closeTime && trade.status === "PENDING_ENTRY") {
      const expired = transition(trade, "EXPIRED", new Date(closeTime).toISOString(), candle.open_time, "expired_before_entry", null); if (expired.event) events.push(expired.event); trade = closeAfter(expired.trade, new Date(closeTime).toISOString(), candle.open_time, "EXPIRED", 0, events, diagnostics); continue;
    }
    const entryTouched = candle.high >= trade.entry_low && candle.low <= trade.entry_high;
    if (trade.status === "PENDING_ENTRY") {
      if (!entryTouched) continue;
      const effective = round(trade, Math.min(Math.max(candle.open, trade.entry_low), trade.entry_high));
      const opened = transition({ ...trade, effective_entry: effective, opened_at: new Date(closeTime).toISOString() }, "OPEN", new Date(closeTime).toISOString(), candle.open_time, "entry_range_touched", effective); if (opened.event) events.push(opened.event); trade = opened.trade;
      const protectedResult = transition(trade, "PROTECTED", new Date(closeTime).toISOString(), candle.open_time, "paper_stop_defined", trade.stop_loss); if (protectedResult.event) events.push(protectedResult.event); trade = protectedResult.trade;
    }
    const entry = trade.effective_entry ?? (trade.entry_low + trade.entry_high) / 2, risk = Math.abs(entry - trade.stop_loss); if (!risk) continue;
    const favorable = trade.side === "buy" ? candle.high - entry : entry - candle.low, adverse = trade.side === "buy" ? entry - candle.low : candle.high - entry;
    trade = { ...trade, mfe_r: Math.max(trade.mfe_r, Number((favorable / risk).toFixed(4))), mae_r: Math.max(trade.mae_r, Number((adverse / risk).toFixed(4))) };
    const stopPrice = trade.status === "BREAK_EVEN" ? entry : trade.stop_loss;
    const stopHit = trade.side === "buy" ? candle.low <= stopPrice : candle.high >= stopPrice;
    const tp1Hit = trade.side === "buy" ? candle.high >= trade.tp1 : candle.low <= trade.tp1;
    const tp2Hit = trade.side === "buy" ? candle.high >= trade.tp2 : candle.low <= trade.tp2;
    const ambiguous = stopHit && (tp1Hit || tp2Hit);
    if (stopHit) {
      const stopped = transition(trade, "STOPPED", new Date(closeTime).toISOString(), candle.open_time, ambiguous ? "stop_wins_same_candle_ambiguity" : trade.status === "BREAK_EVEN" ? "break_even_stop_hit" : "stop_loss_hit", round(trade, stopPrice), ambiguous); if (stopped.event) events.push(stopped.event);
      trade = closeAfter(stopped.trade, new Date(closeTime).toISOString(), candle.open_time, trade.status === "BREAK_EVEN" ? "BREAK_EVEN_STOP" : "STOP_LOSS", trade.status === "BREAK_EVEN" ? 0 : -1, events, diagnostics); continue;
    }
    if (tp2Hit) {
      const tp2 = transition(trade, "TP2_HIT", new Date(closeTime).toISOString(), candle.open_time, "tp2_hit", trade.tp2); if (tp2.event) events.push(tp2.event); trade = closeAfter(tp2.trade, new Date(closeTime).toISOString(), candle.open_time, "TP2", Math.abs(trade.tp2 - entry) / risk, events, diagnostics); continue;
    }
    if (tp1Hit && ["OPEN", "PROTECTED"].includes(trade.status)) {
      const tp1 = transition(trade, "TP1_HIT", new Date(closeTime).toISOString(), candle.open_time, "tp1_hit", trade.tp1); if (tp1.event) events.push(tp1.event); trade = tp1.trade;
      const be = transition(trade, "BREAK_EVEN", new Date(closeTime).toISOString(), candle.open_time, "stop_moved_to_effective_entry", round(trade, entry)); if (be.event) events.push(be.event); trade = be.trade;
    }
  }
  if (!TERMINAL.has(trade.status) && Date.parse(trade.expires_at) <= now) {
    const expired = transition(trade, "EXPIRED", evaluatedAt, trade.latest_evaluated_candle, trade.status === "PENDING_ENTRY" ? "expired_before_entry" : "expired_after_entry", null); if (expired.event) events.push(expired.event); if (!expired.invalid) trade = closeAfter(expired.trade, evaluatedAt, trade.latest_evaluated_candle, "EXPIRED", 0, events, diagnostics); else diagnostics.invalid_transitions++;
  }
  return { trade, events, diagnostics };
}

export function cancelPaperTrade(trade: PaperTrade, at: string, reason: string): PaperEvaluation {
  const diagnostics: PaperEvaluationDiagnostics = { candles_received: 0, candles_processed: 0, candles_skipped: 0, duplicate_candles: 0, future_candles: 0, unclosed_candles: 0, malformed_candles: 0, invalid_transitions: 0, duplicate_events_suppressed: 0, gaps_detected: 0 }, events: PaperTransitionEvidence[] = [];
  const cancelled = transition(trade, "CANCELLED", at, trade.latest_evaluated_candle, reason, null); if (cancelled.invalid) diagnostics.invalid_transitions++; if (cancelled.duplicate) diagnostics.duplicate_events_suppressed++; if (cancelled.event) events.push(cancelled.event);
  const result = cancelled.invalid ? trade : closeAfter(cancelled.trade, at, trade.latest_evaluated_candle, "CANCELLED", 0, events, diagnostics); return { trade: result, events, diagnostics };
}

export const PERSISTED_PAPER_STATUS: Readonly<Record<PaperLifecycleStatus, string>> = { PENDING_ENTRY: "simulated", OPEN: "active", PROTECTED: "active", TP1_HIT: "tp1_hit", BREAK_EVEN: "active", TP2_HIT: "completed", STOPPED: "stopped", EXPIRED: "expired", CANCELLED: "cancelled", CLOSED: "completed" };
export function persistedPaperIntentUpdate(trade: PaperTrade): { status: string; direction: PaperSide; entry_price: number | null; stop_loss: number; tp1: number; tp2: number; block_reason: string; updated_at: string } {
  return { status: PERSISTED_PAPER_STATUS[trade.status], direction: trade.side, entry_price: trade.effective_entry, stop_loss: trade.stop_loss, tp1: trade.tp1, tp2: trade.tp2, block_reason: trade.closure_reason ?? "", updated_at: trade.closed_at ?? trade.opened_at ?? new Date(0).toISOString() };
}
export function paperIntentStatusForSignalStatus(status: string): { status: string; block_reason: string } | null {
  const map: Record<string, { status: string; block_reason: string }> = { waiting: { status: "simulated", block_reason: "" }, active: { status: "active", block_reason: "" }, tp1_hit: { status: "tp1_hit", block_reason: "" }, tp2_hit: { status: "completed", block_reason: "TP2" }, sl_hit: { status: "stopped", block_reason: "STOP_LOSS" }, expired: { status: "expired", block_reason: "EXPIRED" }, cancelled: { status: "cancelled", block_reason: "CANCELLED" } };
  return map[status] ?? null;
}

export interface PaperCertification { passed: boolean; failures: string[]; fingerprint: string; }
export function certifyPaperTrade(trade: PaperTrade, telegramKeys: readonly string[] = []): PaperCertification {
  const failures: string[] = [];
  if (!trade.status) failures.push("null_status"); if (!(trade.status in PAPER_TRANSITIONS)) failures.push("invalid_status");
  if (![trade.stop_loss, trade.tp1, trade.tp2].every(Number.isFinite)) failures.push("missing_stop_or_targets");
  if (new Set(trade.transition_keys).size !== trade.transition_keys.length) failures.push("duplicate_lifecycle_event");
  if (new Set(telegramKeys).size !== telegramKeys.length) failures.push("duplicate_telegram_publication");
  for (const event of trade.transition_evidence) if (!PAPER_TRANSITIONS[event.from].includes(event.to)) failures.push(`impossible_transition:${event.from}:${event.to}`);
  if (trade.latest_evaluated_candle && Date.parse(trade.latest_evaluated_candle) > Date.now()) failures.push("future_candle_used");
  if (trade.status === "CLOSED" && (!trade.closure_reason || trade.realized_r === null || !trade.closed_at)) failures.push("incomplete_closure");
  if (trade.realized_r !== null && !Number.isFinite(trade.realized_r)) failures.push("invalid_realized_r");
  if (trade.transition_evidence.some((event) => !event.key || !event.reason || !event.at)) failures.push("incomplete_transition_evidence");
  return { passed: failures.length === 0, failures: [...new Set(failures)], fingerprint: hash(JSON.stringify({ id: trade.paper_trade_id, status: trade.status, version: trade.lifecycle_version, keys: trade.transition_keys, realized: trade.realized_r })) };
}
