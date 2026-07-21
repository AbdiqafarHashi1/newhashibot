import type { PaperLifecycleStatus, PaperSide, PaperTransitionEvidence } from "./paper-trade-lifecycle.ts";

export type ProfessionalTelegramMessageType = "NEW_SIGNAL" | "ENTRY_TRIGGERED" | "TP1_HIT" | "BREAK_EVEN_SET" | "TP2_HIT" | "STOP_HIT" | "SIGNAL_EXPIRED" | "SIGNAL_CANCELLED" | "TRADE_CLOSED" | "OPERATIONAL_WARNING";
export type ProfessionalTelegramChannel = "free" | "vip" | "admin";
export interface ProfessionalTelegramMessage {
  type: ProfessionalTelegramMessageType; signal_reference: string; trade_reference?: string; market: string; symbol: string; side: PaperSide; strategy_display_name: string; strategy_version?: string; timeframe: string;
  grade?: string; confidence?: number; entry_low?: number; entry_high?: number; stop_loss?: number; tp1?: number; tp2?: number; risk_reward?: number; expires_at?: string; session_context?: string; evidence?: readonly string[];
  event_price?: number | null; realized_r?: number | null; closure_reason?: string | null; occurred_at: string; warning?: string;
}
export interface TelegramDeliveryIntent { idempotency_key: string; message: ProfessionalTelegramMessage; channel: ProfessionalTelegramChannel; text: string; status: "QUEUED" | "SENT" | "RETRY_PENDING" | "FAILED"; attempts: number; max_attempts: number; next_attempt_at: string | null; last_error: string | null; }

function hash(value: string): string { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
export function publicSignalReference(signalId: string): string { return `HS-${hash(signalId).toUpperCase()}`; }
export function telegramLifecycleKey(signalReference: string, type: ProfessionalTelegramMessageType, lifecycleVersion: number, channel: ProfessionalTelegramChannel): string { return `telegram:${signalReference}:${type}:${lifecycleVersion}:${channel}`; }

export function telegramTypeForPaperStatus(status: PaperLifecycleStatus, closureReason?: string | null): ProfessionalTelegramMessageType {
  if (status === "OPEN" || status === "PROTECTED") return "ENTRY_TRIGGERED"; if (status === "TP1_HIT") return "TP1_HIT"; if (status === "BREAK_EVEN") return "BREAK_EVEN_SET"; if (status === "TP2_HIT") return "TP2_HIT";
  if (status === "STOPPED") return "STOP_HIT"; if (status === "EXPIRED") return "SIGNAL_EXPIRED"; if (status === "CANCELLED") return "SIGNAL_CANCELLED"; if (status === "CLOSED") return closureReason === "EXPIRED" ? "SIGNAL_EXPIRED" : closureReason === "CANCELLED" ? "SIGNAL_CANCELLED" : "TRADE_CLOSED";
  return "OPERATIONAL_WARNING";
}

export function telegramTypeForSignalStatus(status: string): ProfessionalTelegramMessageType {
  const map: Record<string, ProfessionalTelegramMessageType> = { active: "ENTRY_TRIGGERED", tp1_hit: "TP1_HIT", break_even: "BREAK_EVEN_SET", tp2_hit: "TP2_HIT", sl_hit: "STOP_HIT", expired: "SIGNAL_EXPIRED", cancelled: "SIGNAL_CANCELLED", closed: "TRADE_CLOSED" };
  return map[status] ?? "OPERATIONAL_WARNING";
}

export function channelsForProfessionalMessage(type: ProfessionalTelegramMessageType): ProfessionalTelegramChannel[] {
  if (type === "OPERATIONAL_WARNING") return ["admin"];
  if (type === "NEW_SIGNAL" || ["ENTRY_TRIGGERED", "TP1_HIT", "BREAK_EVEN_SET", "TP2_HIT", "STOP_HIT", "SIGNAL_EXPIRED", "SIGNAL_CANCELLED", "TRADE_CLOSED"].includes(type)) return ["vip"];
  return ["vip"];
}

function safe(value: string): string { return value.replace(/(?:sk_live|service_role|apikey|token|secret|password)[=:]\S+/gi, "[redacted]").replace(/[\u0000-\u001f]/g, " ").trim(); }
function price(value: number | undefined | null, market: string, symbol: string): string { if (value === undefined || value === null || !Number.isFinite(value)) return "—"; const decimals = symbol.toUpperCase() === "XAUUSD" ? 2 : market.toLowerCase() === "forex" ? symbol.toUpperCase().endsWith("JPY") ? 3 : 5 : Math.abs(value) >= 100 ? 2 : 5; return value.toFixed(decimals); }
function label(type: ProfessionalTelegramMessageType): string { return ({ NEW_SIGNAL: "🚀 NEW SIGNAL", ENTRY_TRIGGERED: "⚡ ENTRY TRIGGERED", TP1_HIT: "🎯 TP1 HIT", BREAK_EVEN_SET: "🛡️ BREAK EVEN SET", TP2_HIT: "🏁 TP2 HIT", STOP_HIT: "🛑 STOP HIT", SIGNAL_EXPIRED: "⌛ SIGNAL EXPIRED", SIGNAL_CANCELLED: "🚫 SIGNAL CANCELLED", TRADE_CLOSED: "🏁 TRADE CLOSED", OPERATIONAL_WARNING: "⚠️ OPERATIONAL WARNING" } as const)[type]; }

export function renderProfessionalTelegramMessage(message: ProfessionalTelegramMessage): string {
  const rows = [label(message.type), "", `Reference: ${safe(message.signal_reference)}`, `Market: ${safe(message.market.toUpperCase())}`, `Symbol: ${safe(message.symbol.toUpperCase())}`, `Direction: ${message.side.toUpperCase()}`];
  if (message.type === "NEW_SIGNAL") rows.push(`Strategy: ${safe(message.strategy_display_name)}${message.strategy_version ? ` v${safe(message.strategy_version)}` : ""}`, `Timeframe: ${safe(message.timeframe)}`, `Grade / Confidence: ${safe(message.grade ?? "—")} / ${message.confidence ?? "—"}`, `Entry: ${price(message.entry_low, message.market, message.symbol)} – ${price(message.entry_high, message.market, message.symbol)}`, `Stop Loss: ${price(message.stop_loss, message.market, message.symbol)}`, `TP1: ${price(message.tp1, message.market, message.symbol)}`, `TP2: ${price(message.tp2, message.market, message.symbol)}`, `Risk / Reward: ${message.risk_reward?.toFixed(2) ?? "—"}R`, `Expiry: ${message.expires_at ?? "—"}`);
  else rows.push(`Event Price: ${price(message.event_price, message.market, message.symbol)}`, `Result: ${message.realized_r === undefined || message.realized_r === null ? "—" : `${message.realized_r >= 0 ? "+" : ""}${message.realized_r.toFixed(2)}R`}`);
  if (message.session_context) rows.push(`Session: ${safe(message.session_context)}`);
  if (message.evidence?.length) rows.push(`Evidence: ${message.evidence.slice(0, 3).map(safe).join("; ")}`);
  if (message.closure_reason) rows.push(`Closure: ${safe(message.closure_reason)}`);
  if (message.warning) rows.push(`Warning: ${safe(message.warning)}`);
  rows.push(`Time: ${new Date(message.occurred_at).toISOString()}`, "", "Educational signal only. Size risk independently. Not financial advice.");
  return rows.join("\n").slice(0, 4096);
}

export function messageFromPaperTransition(input: { signalId: string; tradeId: string; market: string; symbol: string; side: PaperSide; strategyName: string; strategyVersion: string; timeframe: string; event: PaperTransitionEvidence; closureReason?: string | null; realizedR?: number | null }): ProfessionalTelegramMessage {
  return { type: telegramTypeForPaperStatus(input.event.to, input.closureReason), signal_reference: publicSignalReference(input.signalId), trade_reference: `PT-${hash(input.tradeId).toUpperCase()}`, market: input.market, symbol: input.symbol, side: input.side, strategy_display_name: input.strategyName, strategy_version: input.strategyVersion, timeframe: input.timeframe, event_price: input.event.price, realized_r: input.realizedR, closure_reason: input.closureReason, evidence: [input.event.reason, input.event.conservative_ambiguity ? "Conservative same-candle rule applied" : "Closed-candle evidence"], occurred_at: input.event.at };
}

export class TelegramDeliveryLedger {
  private readonly intents = new Map<string, TelegramDeliveryIntent>();
  enqueue(message: ProfessionalTelegramMessage, lifecycleVersion: number, channel: ProfessionalTelegramChannel, maxAttempts = 5): TelegramDeliveryIntent {
    const key = telegramLifecycleKey(message.signal_reference, message.type, lifecycleVersion, channel), existing = this.intents.get(key); if (existing) return existing;
    const intent: TelegramDeliveryIntent = { idempotency_key: key, message, channel, text: renderProfessionalTelegramMessage(message), status: "QUEUED", attempts: 0, max_attempts: maxAttempts, next_attempt_at: null, last_error: null }; this.intents.set(key, intent); return intent;
  }
  recordSuccess(key: string): TelegramDeliveryIntent { const item = this.required(key); item.status = "SENT"; item.attempts++; item.next_attempt_at = null; item.last_error = null; return item; }
  recordFailure(key: string, error: string, at: string): TelegramDeliveryIntent { const item = this.required(key); if (item.status === "SENT") return item; item.attempts++; item.last_error = safe(error); const permanent = /blocked|forbidden|chat not found|bad request/i.test(error); if (permanent || item.attempts >= item.max_attempts) { item.status = "FAILED"; item.next_attempt_at = null; } else { item.status = "RETRY_PENDING"; item.next_attempt_at = new Date(Date.parse(at) + Math.min(60_000, 1000 * 2 ** item.attempts)).toISOString(); } return item; }
  snapshot(): TelegramDeliveryIntent[] { return [...this.intents.values()].map((item) => ({ ...item, message: { ...item.message }, text: item.text })); }
  private required(key: string): TelegramDeliveryIntent { const item = this.intents.get(key); if (!item) throw new Error("telegram_intent_not_found"); return item; }
}

export function publicationAllowed(input: { research?: boolean; shadow?: boolean; publicationAllowed?: boolean }): boolean { return input.research !== true && input.shadow !== true && input.publicationAllowed !== false; }
