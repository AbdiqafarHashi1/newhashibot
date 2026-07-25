import assert from "node:assert/strict";
import {
  categorizeEvent,
  TELEGRAM_EVENT_TAXONOMY,
} from "../../supabase/functions/_shared/telegram-taxonomy.ts";
import {
  channelRegistry,
  TelegramChannelRegistry,
} from "../../supabase/functions/_shared/telegram-registry.ts";
import {
  formatEastAfricaTime,
  formatInstrumentPrice,
  escapeMarkdown,
  safeSanitize,
  maskCustomerRef,
  renderTelegramTemplate,
  splitMessageSafely,
} from "../../supabase/functions/_shared/telegram-templates.ts";
import {
  buildIdempotencyKey,
  classifyDeliveryError,
} from "../../supabase/functions/_shared/telegram-router.ts";

console.log("=== Running Phase 7A-1 Telegram Core Infrastructure Tests ===");

// 1. Event Taxonomy & Categorization Verification
console.log("1. Verifying Event Taxonomy & Categorization...");
assert.equal(categorizeEvent("SIGNAL_QUALIFIED").category, "SIGNALS");
assert.equal(categorizeEvent("SIGNAL_QUALIFIED").defaultVisibility, "VIP_SIGNAL");

assert.equal(categorizeEvent("EXECUTION_FILLED").category, "EXECUTION");
assert.equal(categorizeEvent("EXECUTION_FILLED").defaultVisibility, "VIP_EXECUTION");

assert.equal(categorizeEvent("PROTECTION_VERIFIED").category, "PROTECTION");
assert.equal(categorizeEvent("PROTECTION_VERIFIED").defaultVisibility, "VIP_EXECUTION");

assert.equal(categorizeEvent("SUPERVISOR_WARNING").category, "RECOVERY");
assert.equal(categorizeEvent("SUPERVISOR_WARNING").defaultVisibility, "ADMIN_ONLY");

assert.equal(categorizeEvent("RISK_ENTRY_BLOCKED").category, "RISK");
assert.equal(categorizeEvent("RISK_ENTRY_BLOCKED").defaultVisibility, "ADMIN_ONLY");

assert.equal(categorizeEvent("SCANNER_FAILED").category, "RUNTIME");
assert.equal(categorizeEvent("SCANNER_FAILED").defaultVisibility, "ADMIN_ONLY");

assert.equal(categorizeEvent("TELEGRAM_DELIVERY_QUEUED").category, "TELEGRAM");
assert.equal(categorizeEvent("TELEGRAM_DELIVERY_QUEUED").defaultVisibility, "ADMIN_ONLY");

// Verify taxonomy constants
assert.ok(TELEGRAM_EVENT_TAXONOMY.SIGNALS.includes("SIGNAL_QUALIFIED"));
assert.ok(TELEGRAM_EVENT_TAXONOMY.EXECUTION.includes("EXECUTION_FILLED"));
assert.ok(TELEGRAM_EVENT_TAXONOMY.PROTECTION.includes("PROTECTION_VERIFIED"));
assert.ok(TELEGRAM_EVENT_TAXONOMY.RECOVERY.includes("SUPERVISOR_WARNING"));
assert.ok(TELEGRAM_EVENT_TAXONOMY.RISK.includes("DAILY_LOSS_LOCK"));
assert.ok(TELEGRAM_EVENT_TAXONOMY.RUNTIME.includes("SCANNER_FAILED"));
assert.ok(TELEGRAM_EVENT_TAXONOMY.TELEGRAM.includes("TELEGRAM_DELIVERY_SENT"));

// 2. Authoritative Channel Registry Verification
console.log("2. Verifying Authoritative Channel Registry...");
const registry = TelegramChannelRegistry.getInstance();
const destinations = registry.getAllDestinations();
assert.ok(destinations.length >= 6, "Registry should contain all required channel destinations");

const adminDest = registry.getDestination("admin");
assert.ok(adminDest, "Admin destination must exist");
assert.equal(adminDest.channelKey, "admin");

const freeDest = registry.getDestination("free");
assert.ok(freeDest, "Free destination must exist");
assert.equal(freeDest.channelKey, "free");

const vipDest = registry.getDestination("vip");
assert.ok(vipDest, "VIP destination must exist");
assert.equal(vipDest.channelKey, "vip");

// Visibility mapping verification
assert.deepEqual(registry.getChannelsForVisibility("ADMIN_ONLY"), ["admin"]);
assert.deepEqual(registry.getChannelsForVisibility("FREE_PUBLIC"), ["free"]);
assert.deepEqual(registry.getChannelsForVisibility("VIP_SIGNAL"), ["vip"]);
assert.deepEqual(registry.getChannelsForVisibility("VIP_EXECUTION"), ["vip_execution"]);
assert.deepEqual(registry.getChannelsForVisibility("ANALYTICS"), ["analytics"]);
assert.deepEqual(registry.getChannelsForVisibility("NO_TELEGRAM"), []);

// Health tracking test
registry.markHealth("admin", true);
assert.equal(registry.getDestination("admin")?.health, "healthy");

registry.markHealth("free", false, new Date().toISOString(), "Rate limited");
assert.equal(registry.getDestination("free")?.health, "degraded");

// 3. Central Template Engine & Precision Formatting Verification
console.log("3. Verifying Template Engine & Formatting...");

// Time formatting (East Africa Time - UTC+3)
const testDate = new Date("2026-07-23T10:45:00Z"); // 10:45 UTC = 13:45 EAT (1:45 PM EAT)
const eatStr = formatEastAfricaTime(testDate);
assert.match(eatStr, /EAT$/, "Formatted timestamp must end with EAT suffix");
assert.match(eatStr, /1:45 PM EAT/, "10:45 UTC must convert to 1:45 PM EAT");

// Instrument precision tests
assert.equal(formatInstrumentPrice(1.08542, "forex", "EURUSD"), "1.08542", "Standard Forex must have 5 decimals");
assert.equal(formatInstrumentPrice(155.123, "forex", "USDJPY"), "155.123", "JPY Forex pairs must have 3 decimals");
assert.equal(formatInstrumentPrice(2385.5, "metals", "XAUUSD"), "2385.50", "Gold (XAUUSD) must have 2 decimals");
assert.equal(formatInstrumentPrice(64521.1, "crypto", "BTCUSDT"), "64521.10", "BTC crypto price must have 2 decimals");

// Sanitization & Security Redaction
assert.equal(safeSanitize("token=sk_live_123456789 secret value"), "[REDACTED] secret value");
assert.equal(escapeMarkdown("BUY *BTC* _NOW_ [LINK]"), "BUY \\*BTC\\* \\_NOW\\_ \\[LINK]");
assert.equal(maskCustomerRef("usr_abcdefgh12345678"), "usr_...5678");

// Template Rendering Test
const renderedSignal = renderTelegramTemplate({
  eventType: "SIGNAL_QUALIFIED",
  market: "forex",
  symbol: "EURUSD",
  direction: "buy",
  grade: "A+",
  entryLow: 1.08500,
  entryHigh: 1.08520,
  stopLoss: 1.08200,
  tp1: 1.08800,
  tp2: 1.09200,
  riskReward: 2.3,
  strategyName: "ForexMicroScalper",
  timestamp: "2026-07-23T10:00:00Z",
}, "vip");

assert.match(renderedSignal, /HASHIBOT A\+ SIGNAL/);
assert.match(renderedSignal, /EURUSD/);
assert.match(renderedSignal, /1\.08500/);
assert.match(renderedSignal, /1\.08200/);
assert.match(renderedSignal, /EAT/);

// Safe Message Splitting Test
const longText = "Line of log text\n".repeat(300); // ~5100 characters
const chunks = splitMessageSafely(longText, 4000);
assert.equal(chunks.length, 2, "Long message should be split into 2 chunks");
assert.match(chunks[0], /Part 1\/2/);
assert.match(chunks[1], /Part 2\/2/);

// 4. Idempotency Key & Error Classification Verification
console.log("4. Verifying Idempotency Key & Delivery Error Classification...");

const key1 = buildIdempotencyKey({
  event_type: "SIGNAL_QUALIFIED",
  signal_id: "sig-1234",
  reason: "entry_triggered",
}, "vip");

assert.equal(key1, "signal_qualified:vip:sig-1234:entry_triggered");

// Test permanent errors (HTTP 400, 401, 403, 404, blocked)
const permErr1 = classifyDeliveryError(403, "Forbidden: bot was blocked by the user");
assert.equal(permErr1.permanent, true, "HTTP 403 / Bot blocked must be classified as permanent");

const permErr2 = classifyDeliveryError(400, "Bad Request: chat not found");
assert.equal(permErr2.permanent, true, "HTTP 400 / Chat not found must be classified as permanent");

// Test transient errors (HTTP 429 rate limit, 500, timeout)
const transientErr1 = classifyDeliveryError(429, "Too Many Requests: retry after 25");
assert.equal(transientErr1.permanent, false, "HTTP 429 must be classified as transient");
assert.equal(transientErr1.retryAfterSeconds, 25, "Must parse retryAfterSeconds from Telegram response");

const transientErr2 = classifyDeliveryError(502, "Bad Gateway");
assert.equal(transientErr2.permanent, false, "HTTP 502 must be classified as transient");

console.log("=== Phase 7A-1 Telegram Core Infrastructure Tests Passed Successfully! ===");
