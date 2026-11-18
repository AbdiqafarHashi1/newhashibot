import {assertVipStrategy,vipSetupTag,VIP_RISK_FOOTER} from './vip-signal-policy.ts';
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
  assertVipStrategy(signal.strategy);
  const buy=/^(buy|long)$/i.test(signal.direction);
  const entry=buy?signal.entry_high??signal.entry_low:signal.entry_low??signal.entry_high;
  const stop=signal.stop_loss,targets=signal.targets??[];
  if(entry==null||stop==null||!targets.length||![entry,stop,...targets].every(Number.isFinite))throw Error('VIP_PLAN_GEOMETRY_REQUIRED');
  const risk=(entry-stop)*(buy?1:-1),last=targets.at(-1)!;
  if(risk<=0||targets.some(t=>(t-entry)*(buy?1:-1)<=0))throw Error('VIP_PLAN_GEOMETRY_REQUIRED');
  const rr=(last-entry)*(buy?1:-1)/risk;
  const price=(n:number)=>formatInstrumentPrice(n,signal.market,signal.symbol);
  const checkpoint=entry+(buy?1:-1)*1.5*risk;
  const rows=[`HASHIBOT VIP · ${marketLabel(signal.market,signal.symbol)}`,vipSetupTag(signal.strategy!),`${signal.symbol.toUpperCase()} · ${buy?'BUY / LONG':'SELL / SHORT'}`,
   `Entry Zone: ${price(signal.entry_low??entry)} – ${price(signal.entry_high??entry)}`,
   `Stop Loss (-1R): ${price(stop)}`,
   rr>=1.5?`TP1 subscriber checkpoint (1.5R — Move SL to Breakeven): ${price(checkpoint)}`:`TP1: ${price(targets[0])} · target is below the 1.5R checkpoint`,
   `TP2 canonical target (${rr.toFixed(2)}R): ${price(last)}`,
   `Target R:R ratio: 1:${rr.toFixed(2)}`,
   rr<3?'Canonical target is below 3.0R; do not extend it to match the runner label.':'TP2: 3.0R+ target',
   'Setup tags describe subscriber objectives, not guaranteed holding times. The 1.5R checkpoint is subscriber guidance; automated execution retains its assigned plan.',
   `Time: ${formatEastAfricaTime(signal.occurred_at,false)}`,`Reference: ${signal.signal_id}`,'',VIP_RISK_FOOTER];
  return rows.join('\n');
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
