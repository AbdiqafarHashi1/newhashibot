import assert from "node:assert/strict";
import { getAdminChatId, getFreeChatId, getVipChatId, TelegramChannelRegistry } from "../../supabase/functions/_shared/telegram-registry.ts";
import { buildIdempotencyKey, classifyDeliveryError } from "../../supabase/functions/_shared/telegram-router.ts";
import { calculateRecap, renderCanonicalVipSignal, validateEditorialPublication, type EditorialPublication } from "../../supabase/functions/_shared/telegram-product.ts";

const originalDeno = (globalThis as any).Deno;
const values = new Map<string, string>();
(globalThis as any).Deno = { env: { get: (key: string) => values.get(key) } };

assert.equal(getAdminChatId(), "", "Admin must fail closed without its own ID");
assert.equal(getFreeChatId(), "", "Free must fail closed without its own ID");
assert.equal(getVipChatId(), "", "VIP must fail closed without its own ID");
values.set("TELEGRAM_CHAT_ID", "vip-id");
assert.equal(getVipChatId(), "vip-id");
assert.equal(getAdminChatId(), "", "Admin must never fall back to VIP");
assert.equal(getFreeChatId(), "", "Free must never fall back to VIP");
values.set("TELEGRAM_ADMIN_CHAT_ID", "admin-id"); values.set("TELEGRAM_FREE_CHAT_ID", "free-id");
assert.equal(getAdminChatId(), "admin-id"); assert.equal(getFreeChatId(), "free-id");
const registry = new TelegramChannelRegistry();
assert.deepEqual(registry.getChannelsForVisibility("ADMIN_ONLY"), ["admin"]);
assert.deepEqual(registry.getChannelsForVisibility("FREE_PUBLIC"), ["free"]);
assert.deepEqual(registry.getChannelsForVisibility("VIP_SIGNAL"), ["vip"]);
assert.equal(registry.getDestination("test")?.chatId, "", "Tests require an explicit test destination");

const signal = renderCanonicalVipSignal({ signal_id: "SIG-1", market: "forex", symbol: "EURUSD", direction: "buy", occurred_at: "2026-09-12T07:35:00Z", entry_low: 1.1842, entry_high: 1.1845, stop_loss: 1.1818, targets: [1.1866, 1.1892], risk_reward: 2.1, strategy: "ForexTrendPullback", grade: "A", confidence: 82, session: "London" });
assert.match(signal, /HASHIBOT VIP • FOREX/); assert.match(signal, /10:35 AM EAT/); assert.match(signal, /1\.18420 – 1\.18450/);
const omitted = renderCanonicalVipSignal({ signal_id: "SIG-2", market: "crypto", symbol: "BTCUSDT", direction: "long", occurred_at: "2026-09-12T07:35:00Z" });
assert.match(omitted, /BTCUSDT — LONG/); assert.doesNotMatch(omitted, /Confidence|Grade|Risk \/ Reward|Leverage/);

const outcomes = [
  { signal_id: "1", market: "forex", strategy: "Trend", status: "WIN" as const, realized_r: 2, evidence_class: "LIVE" as const },
  { signal_id: "2", market: "crypto", strategy: "Breakout", status: "LOSS" as const, realized_r: -1, evidence_class: "LIVE" as const },
  { signal_id: "3", market: "forex", status: "OPEN" as const, evidence_class: "LIVE" as const },
  { signal_id: "4", market: "forex", status: "WIN" as const, realized_r: 10, evidence_class: "RESEARCH" as const },
];
const recap = calculateRecap(outcomes, "LIVE");
assert.deepEqual({ signals: recap.signals, closed: recap.closed, open: recap.open, wins: recap.wins, losses: recap.losses, net: recap.net_closed_r }, { signals: 3, closed: 2, open: 1, wins: 1, losses: 1, net: 1 });
assert.equal(recap.profit_factor, 2); assert.equal(recap.market_breakdown.forex, 2); assert.equal(recap.market_breakdown.crypto, -1);
assert.equal(calculateRecap(outcomes, "RESEARCH").net_closed_r, 10, "Research evidence stays separate from live evidence");

const editorial: EditorialPublication = { content_id: "brief-1", content_type: "MORNING_BRIEF", audience: "free", title: "Morning brief", sections: [{ body: "Volatility risk is elevated." }], source_type: "APPROVED_INTELLIGENCE", source_ids: ["news-1"], generated_at: "2026-09-12T06:00:00Z", expires_at: "2026-09-12T12:00:00Z", evidence_class: "LIVE", author_type: "NEWS_AGENT", agent_id: "news-v1", requires_approval: true, approval_state: "APPROVED", compliance_state: "APPROVED", dedupe_key: "brief:2026-09-12" };
assert.equal(validateEditorialPublication(editorial, new Date("2026-09-12T07:00:00Z")).valid, true);
assert.equal(validateEditorialPublication({ ...editorial, sections: [{ body: "Entry: 1.2, SL: 1.1, TP1: 1.3" }] }, new Date("2026-09-12T07:00:00Z")).reason, "EDITORIAL_TRADING_AUTHORITY_VIOLATION");
assert.equal(validateEditorialPublication(editorial, new Date("2026-09-13T07:00:00Z")).reason, "CONTENT_STALE");
assert.equal(validateEditorialPublication({ ...editorial, audience: "admin", content_type: "VIP_INVITATION" }, new Date("2026-09-12T07:00:00Z")).reason, "ADMIN_OPERATIONS_ONLY");

assert.notEqual(buildIdempotencyKey({ event_type: "NEW_SIGNAL", signal_id: "1" }, "free"), buildIdempotencyKey({ event_type: "NEW_SIGNAL", signal_id: "1" }, "vip"));
assert.notEqual(buildIdempotencyKey({ event_type: "TP1_HIT", signal_id: "1" }, "vip"), buildIdempotencyKey({ event_type: "TP2_HIT", signal_id: "1" }, "vip"));
assert.equal(classifyDeliveryError(403, "Forbidden").permanent, true); assert.equal(classifyDeliveryError(500, "upstream").permanent, false);

(globalThis as any).Deno = originalDeno;
console.log("Telegram product ecosystem tests passed");
