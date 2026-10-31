import {CRYPTO_TEAM_ROLES} from './coordinated-crypto-contract.ts';
import type { TelegramChannelKey } from "./telegram-registry.ts";
import { escapeMarkdown, formatEastAfricaTime, formatInstrumentPrice } from "./telegram-templates.ts";

export type ProductAudience = "admin" | "free" | "vip";
export type EvidenceClass = "LIVE" | "FORWARD" | "RESEARCH";
export type EditorialAuthor = "SYSTEM" | "ADMIN" | "EDITORIAL_AGENT" | "NEWS_AGENT" | "GROWTH_AGENT";
export type EditorialContentType = "MORNING_BRIEF" | "NEWS_DIGEST" | "MARKET_WRAP" | "WATCHLIST_UPDATE" | "SESSION_BRIEF" | "EDUCATION" | "PRODUCT_UPDATE" | "FEATURE_ANNOUNCEMENT" | "VIP_INVITATION" | "VERIFIED_RECAP" | "DAILY_RECAP" | "WEEKLY_RECAP" | "OPERATIONS_DIGEST" | "INCIDENT_SUMMARY";

export interface EditorialPublication {
  content_id: string;
  content_type: EditorialContentType;
  audience: ProductAudience;
  title: string;
  sections: ReadonlyArray<{ heading?: string; body: string }>;
  source_type: "CANONICAL_RUNTIME" | "APPROVED_INTELLIGENCE" | "HUMAN_APPROVED";
  source_ids: readonly string[];
  generated_at: string;
  expires_at?: string;
  market_scope?: readonly string[];
  evidence_class: EvidenceClass;
  author_type: EditorialAuthor;
  agent_id?: string;
  requires_approval: boolean;
  approval_state: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  compliance_state: "PENDING" | "APPROVED" | "REJECTED";
  dedupe_key: string;
}

const PROHIBITED_TRADING_FIELDS = /(^|[\s_*])(entry|stop(?: loss)?|sl|tp\d*|take profit|leverage|risk override|qualification result|execution command)([\s_*:]|$)/i;
const ADMIN_CONTENT = new Set<EditorialContentType>(["OPERATIONS_DIGEST", "INCIDENT_SUMMARY"]);
const PROMOTIONAL_CONTENT = new Set<EditorialContentType>(["VIP_INVITATION", "PRODUCT_UPDATE", "FEATURE_ANNOUNCEMENT"]);

/** Market-specific editorial must not leak into the other paid market channel. */
export function editorialDestinations(publication: EditorialPublication): string[] {
  if(publication.audience!=='vip')return [publication.audience];
  if(!publication.market_scope?.length)return ['vip_crypto','vip_forex_gold']; // Existing explicitly general editorials.
  const values=new Set(publication.market_scope.map(x=>x.toLowerCase()));
  if([...values].some(x=>!['crypto','forex','gold','metals','all'].includes(x)))throw Error('EDITORIAL_MARKET_SCOPE_INVALID');
  return [...(values.has('crypto')||values.has('all')?['vip_crypto']:[]),
    ...(values.has('forex')||values.has('gold')||values.has('metals')||values.has('all')?['vip_forex_gold']:[])];
}

export function validateEditorialPublication(publication: EditorialPublication, now = new Date()): { valid: boolean; reason?: string; stale?: boolean } {
  if (!publication.content_id || !publication.dedupe_key || publication.source_ids.length === 0) return { valid: false, reason: "SOURCE_EVIDENCE_REQUIRED" };
  try{editorialDestinations(publication)}catch{return {valid:false,reason:'EDITORIAL_MARKET_SCOPE_INVALID'}}
  if (publication.compliance_state !== "APPROVED") return { valid: false, reason: "COMPLIANCE_NOT_APPROVED" };
  if (publication.requires_approval && publication.approval_state !== "APPROVED") return { valid: false, reason: "EDITORIAL_APPROVAL_REQUIRED" };
  if (publication.audience === "admin" && !ADMIN_CONTENT.has(publication.content_type)) return { valid: false, reason: "ADMIN_OPERATIONS_ONLY" };
  if (publication.audience === "vip" && PROMOTIONAL_CONTENT.has(publication.content_type)) return { valid: false, reason: "VIP_SALES_CONTENT_BLOCKED" };
  if (publication.author_type.endsWith("AGENT") && publication.sections.some((s) => PROHIBITED_TRADING_FIELDS.test(`${s.heading ?? ""} ${s.body}`))) {
    return { valid: false, reason: "EDITORIAL_TRADING_AUTHORITY_VIOLATION" };
  }
  if (!Number.isFinite(Date.parse(publication.generated_at)) || publication.expires_at && !Number.isFinite(Date.parse(publication.expires_at))) return { valid: false, reason: "INVALID_CONTENT_TIMESTAMP" };
  if (publication.expires_at && new Date(publication.expires_at).getTime() <= now.getTime()) return { valid: false, reason: "CONTENT_STALE", stale: true };
  if (!publication.expires_at && !["EDUCATION", "PRODUCT_UPDATE", "FEATURE_ANNOUNCEMENT", "VIP_INVITATION"].includes(publication.content_type)) return { valid: false, reason: "CONTENT_EXPIRY_REQUIRED" };
  if (new Date(publication.generated_at).getTime() > now.getTime() + 60_000) return { valid: false, reason: "INVALID_GENERATED_AT" };
  return { valid: true };
}

export function renderEditorialPublication(publication: EditorialPublication): string {
  const validation = validateEditorialPublication(publication);
  if (!validation.valid) throw new Error(validation.reason);
  return [`*${escapeMarkdown(publication.title)}*`, "", ...publication.sections.flatMap((s) => [s.heading ? `*${escapeMarkdown(s.heading)}*` : "", escapeMarkdown(s.body), ""]), `Source: ${escapeMarkdown(publication.source_type)} · ${escapeMarkdown(publication.evidence_class)}`, `Time: ${formatEastAfricaTime(publication.generated_at, false)}`].filter(Boolean).join("\n");
}

export interface CanonicalSignalPresentation {
  signal_id: string; market: string; symbol: string; direction: string; occurred_at: string;
  entry_low?: number; entry_high?: number; stop_loss?: number; targets?: readonly number[];
  risk_reward?: number; strategy?: string; grade?: string; confidence?: number; session?: string; exchange?: string;
}

export function marketLabel(market: string, symbol = ""): string {
  const value = market.toLowerCase();
  if (value === "metals" || /^(XAU|XAG)/i.test(symbol)) return "GOLD / METALS";
  if (value === "forex" || value === "fx") return "FOREX";
  if (value === "crypto") return "CRYPTO";
  return market.toUpperCase();
}

export function renderCanonicalVipSignal(signal: CanonicalSignalPresentation): string {
  const direction = /^(buy|long)$/i.test(signal.direction) ? (marketLabel(signal.market, signal.symbol) === "CRYPTO" ? "LONG" : "BUY") : (marketLabel(signal.market, signal.symbol) === "CRYPTO" ? "SHORT" : "SELL");
  const entry = signal.entry_low != null && signal.entry_high != null
    ? `${formatInstrumentPrice(signal.entry_low, signal.market, signal.symbol)} – ${formatInstrumentPrice(signal.entry_high, signal.market, signal.symbol)}`
    : signal.entry_low != null || signal.entry_high != null ? formatInstrumentPrice(signal.entry_low ?? signal.entry_high, signal.market, signal.symbol) : undefined;
  const rows = [`*HASHIBOT VIP • ${escapeMarkdown(marketLabel(signal.market, signal.symbol))}*`, "", `*${escapeMarkdown(signal.symbol.toUpperCase())} — ${direction}*`];
  const add = (label: string, value: string | number | undefined) => { if (value !== undefined && value !== "") rows.push("", `*${label}*`, escapeMarkdown(value)); };
  add("Entry", entry); add("Stop Loss", signal.stop_loss == null ? undefined : formatInstrumentPrice(signal.stop_loss, signal.market, signal.symbol));
  [...new Set(signal.targets??[])].forEach((target, index) => add(`TP${index + 1}`, formatInstrumentPrice(target, signal.market, signal.symbol)));
  add("Risk / Reward", signal.risk_reward == null ? undefined : `1 : ${signal.risk_reward}`); add("Strategy", signal.strategy); add("Grade", signal.grade);
  add("Scanner score (not win probability)", signal.confidence == null ? undefined : `${signal.confidence}/100`); add("Session", signal.session); add("Exchange", signal.exchange);
  if(CRYPTO_TEAM_ROLES.some(r=>r.name===signal.strategy)){add('Tracking','Signal-only alert; virtual outcomes are not provider fills.');add('Management','Full target or protective stop; no partial exits, break-even or trailing. Maximum 24 hours; unresolved fills/results remain unknown.');}
  add("Time", formatEastAfricaTime(signal.occurred_at, false)); rows.push("", `Reference: ${escapeMarkdown(signal.signal_id)}`, "HashiBot Qualified Signal · Manage risk independently.");
  return rows.join("\n");
}

export interface AuthoritativeOutcome { signal_id: string; market: string; strategy?: string; status: "OPEN" | "WIN" | "LOSS" | "BREAK_EVEN" | "CANCELLED"; realized_r?: number; evidence_class: EvidenceClass; symbol?: string; }
export interface Recap { evidence_class: EvidenceClass; signals: number; closed: number; open: number; wins: number; losses: number; break_even: number; net_closed_r: number; market_breakdown: Record<string, number>; strategy_breakdown: Record<string, number>; best?: AuthoritativeOutcome; worst?: AuthoritativeOutcome; profit_factor?: number; }

export function calculateRecap(records: readonly AuthoritativeOutcome[], evidenceClass: EvidenceClass): Recap {
  const scoped = records.filter((r) => r.evidence_class === evidenceClass);
  const closed = scoped.filter((r) => r.status === "WIN" || r.status === "LOSS" || r.status === "BREAK_EVEN");
  const withR = closed.filter((r) => Number.isFinite(r.realized_r));
  const sum = (xs: AuthoritativeOutcome[]) => xs.reduce((n, r) => n + (r.realized_r ?? 0), 0);
  const gains = sum(withR.filter((r) => (r.realized_r ?? 0) > 0)); const lossesR = Math.abs(sum(withR.filter((r) => (r.realized_r ?? 0) < 0)));
  const breakdown = (key: "market" | "strategy") => Object.fromEntries([...new Set(scoped.map((r) => r[key] || "Unclassified"))].map((v) => [v, sum(withR.filter((r) => (r[key] || "Unclassified") === v))]));
  const ordered = [...withR].sort((a, b) => (a.realized_r ?? 0) - (b.realized_r ?? 0));
  return { evidence_class: evidenceClass, signals: scoped.length, closed: closed.length, open: scoped.filter((r) => r.status === "OPEN").length, wins: scoped.filter((r) => r.status === "WIN").length, losses: scoped.filter((r) => r.status === "LOSS").length, break_even: scoped.filter((r) => r.status === "BREAK_EVEN").length, net_closed_r: sum(withR), market_breakdown: breakdown("market"), strategy_breakdown: breakdown("strategy"), best: ordered.at(-1), worst: ordered.at(0), profit_factor: lossesR > 0 ? gains / lossesR : undefined };
}

export function isAudienceChannel(channel: TelegramChannelKey): channel is ProductAudience { return channel === "admin" || channel === "free" || channel === "vip"; }
