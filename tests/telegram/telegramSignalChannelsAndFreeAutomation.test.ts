/**
 * HashiBot Phase 7A-2A Comprehensive Test Suite
 * Telegram Signal Channels & Free Channel Automation
 */

import { verifyChannelEligibility } from "../../supabase/functions/_shared/telegram-eligibility.ts";
import {
  evaluateFreeChannelCandidate,
  FreePublisherConfig,
  FreeSignalCandidate,
} from "../../supabase/functions/_shared/telegram-free-publisher.ts";
import {
  checkAntiSpamLimits,
  getContextualCTA,
  validateCampaignCompliance,
} from "../../supabase/functions/_shared/telegram-incentive-engine.ts";
import {
  createDailyMarketOutlookContract,
  createEducationalContract,
  createMonthlySummaryContract,
  createNoTradeExplanationContract,
  createWeeklyRecapContract,
} from "../../supabase/functions/_shared/telegram-content-contracts.ts";
import {
  renderFreeChannelSignalTemplate,
  renderMarketOutlookTemplate,
  renderNoTradeTemplate,
  renderTelegramTemplate,
} from "../../supabase/functions/_shared/telegram-templates.ts";
import { categorizeEvent } from "../../supabase/functions/_shared/telegram-taxonomy.ts";
import { buildIdempotencyKey } from "../../supabase/functions/_shared/telegram-router.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
}

async function runPhase7A2ATests() {
  console.log("--- Starting HashiBot Phase 7A-2A Signal Channels & Free Automation Tests ---\n");

  // 1. Customer Eligibility Tests
  console.log("1. Testing Customer Eligibility Engine...");
  
  // Admin channel
  const adminRes = verifyChannelEligibility("admin", { role: "admin", userId: "usr-admin-1" });
  assert(adminRes.allowed, "Admin user should have access to Admin channel");
  const nonAdminRes = verifyChannelEligibility("admin", { role: "free_user", userId: "usr-free-1" });
  assert(!nonAdminRes.allowed, "Free user should be blocked from Admin channel");

  // Free channel
  const freeRes = verifyChannelEligibility("free", { subscriptionStatus: "active" });
  assert(freeRes.allowed, "Active user should have access to Free channel");
  const disabledRes = verifyChannelEligibility("free", { subscriptionStatus: "disabled" });
  assert(!disabledRes.allowed, "Disabled user should be blocked from Free channel");

  // VIP Signals channel
  const vipActive = verifyChannelEligibility("vip", {
    role: "vip_subscriber",
    subscriptionPackage: "vip_signals_only",
    subscriptionStatus: "active",
  });
  assert(vipActive.allowed, "Active VIP subscriber should have access to VIP channel");

  const vipExpired = verifyChannelEligibility("vip", {
    role: "vip_subscriber",
    subscriptionPackage: "vip_signals_only",
    subscriptionStatus: "expired",
  });
  assert(!vipExpired.allowed, "Expired VIP subscriber should be blocked from VIP channel");

  // Excluded channels in 7A-2A
  const execChannel = verifyChannelEligibility("vip_execution", { role: "admin" });
  assert(!execChannel.allowed, "Execution channels must be excluded in Phase 7A-2A");

  console.log("   ✅ Customer Eligibility Engine passed.");

  // 2. Free Channel Publisher Engine Tests
  console.log("2. Testing Free Channel Publisher Engine...");

  const mockSupabase = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          gte: async () => ({ count: 0, data: [] }),
          maybeSingle: async () => ({ data: null }),
        }),
        in: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      }),
      insert: async () => ({ data: { id: "pub-123" }, error: null }),
    }),
  } as any;

  const validCandidate: FreeSignalCandidate = {
    id: "sig-7a2a-001",
    symbol: "BTCUSDT",
    market_type: "crypto",
    direction: "buy",
    grade: "A+",
    confidence_score: 88,
    risk_reward: 2.5,
    timeframe: "15m",
    strategy_name: "CompressionBreakout",
    entry_low: 67000,
    entry_high: 67200,
    stop_loss: 66500,
    tp1: 68000,
    tp2: 69000,
    status: "active",
    arbitrator_decision: { final_decision: "approved" },
    data_source: "REAL DATA",
    created_at: new Date().toISOString(),
  };

  const eval1 = await evaluateFreeChannelCandidate(mockSupabase, validCandidate);
  assert(eval1.eligible && eval1.decision === "SELECTED", "Valid A+ signal should be SELECTED for Free Channel");

  // Test Grade filter
  const lowGradeCandidate: FreeSignalCandidate = { ...validCandidate, grade: "B" };
  const eval2 = await evaluateFreeChannelCandidate(mockSupabase, lowGradeCandidate);
  assert(!eval2.eligible && eval2.decision === "LOW_PRIORITY", "Grade B signal should be LOW_PRIORITY");

  // Test Non-Real Data filter
  const mockDataCandidate: FreeSignalCandidate = { ...validCandidate, data_source: "MOCK DATA" };
  const eval3 = await evaluateFreeChannelCandidate(mockSupabase, mockDataCandidate);
  assert(!eval3.eligible && eval3.decision === "INVALID", "Non-real data signal should be INVALID");

  // Test Daily Cap
  const capMockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => ({ count: 2 }), // 2 already published
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  } as any;

  const evalCap = await evaluateFreeChannelCandidate(capMockSupabase, validCandidate);
  assert(!evalCap.eligible && evalCap.decision === "DAILY_CAP", "Daily cap of 2 should block further publication");

  console.log("   ✅ Free Channel Publisher Engine passed.");

  // 3. Incentive Engine & Anti-Spam Compliance Tests
  console.log("3. Testing Incentive Engine & Anti-Spam Compliance...");

  const compliantText = "Join HashiBot VIP Signals for real-time institutional setups and complete risk profiles.";
  const nonCompliantText = "Join now for 100% win rate and guaranteed profits!";

  assert(validateCampaignCompliance(compliantText).compliant, "Compliant text should pass compliance check");
  const compViolation = validateCampaignCompliance(nonCompliantText);
  assert(!compViolation.compliant && compViolation.violation !== undefined, "Non-compliant text should be caught");

  const cta1 = getContextualCTA("after_tp1");
  assert(cta1.includes("VIP Signals"), "Contextual CTA for TP1 should contain VIP invitation");

  const antiSpamAllowed = await checkAntiSpamLimits(mockSupabase, "free");
  assert(antiSpamAllowed.allowed, "Fresh channel should pass anti-spam check");

  console.log("   ✅ Incentive Engine & Anti-Spam Compliance passed.");

  // 4. Scheduled Content Contracts Tests
  console.log("4. Testing Scheduled Content Contracts...");

  const outlook = createDailyMarketOutlookContract("London", "Crypto", "Bullish Trend", ["$67,000", "$68,500"], "Elevated volatility");
  assert(outlook.cadence === "daily" && outlook.contractType === "MARKET_OUTLOOK", "Market outlook contract should be valid");

  const noTrade = createNoTradeExplanationContract("Forex", "High-impact CPI news pending", "Fed interest rate decision buffer");
  assert(noTrade.contractType === "NO_TRADE_EXPLANATION", "No-trade contract should be valid");

  const edu = createEducationalContract("Risk Management", "Never risk more than 1% per trade", "Account with $10,000 capital");
  assert(edu.contractType === "EDUCATIONAL_POST", "Educational contract should be valid");

  const weekly = createWeeklyRecapContract(12, 4, 75, "CompressionBreakout", "Crypto", ["Clean TP1/TP2 hits on BTC"]);
  assert(weekly.cadence === "weekly" && weekly.contractType === "WEEKLY_RECAP", "Weekly recap contract should be valid");

  const monthly = createMonthlySummaryContract("July 2026", 48, ["Upgraded Telegram Router v2.0"], ["Risk discipline guide released"]);
  assert(monthly.cadence === "monthly" && monthly.contractType === "MONTHLY_SUMMARY", "Monthly summary contract should be valid");

  console.log("   ✅ Scheduled Content Contracts passed.");

  // 5. Template Engine Rendering Tests
  console.log("5. Testing Template Engine Rendering...");

  const previewRender = renderFreeChannelSignalTemplate({
    eventType: "FREE_SELECTED_SIGNAL",
    publicationMode: "preview",
    symbol: "EURUSD",
    market: "forex",
    direction: "buy",
    strategyName: "LondonBreakout",
    timestamp: new Date().toISOString(),
  });
  assert(previewRender.includes("HASHIBOT FREE SETUP PREVIEW"), "Preview mode header rendered correctly");
  assert(previewRender.includes("locked in Preview Mode"), "Preview mode lock note rendered correctly");

  const fullFreeRender = renderFreeChannelSignalTemplate({
    eventType: "FREE_SELECTED_SIGNAL",
    publicationMode: "full",
    symbol: "EURUSD",
    market: "forex",
    direction: "buy",
    entryLow: 1.08500,
    entryHigh: 1.08550,
    stopLoss: 1.08200,
    tp1: 1.09000,
    tp2: 1.09500,
    riskReward: 2.5,
    grade: "A+",
    strategyName: "LondonBreakout",
    timestamp: new Date().toISOString(),
  });
  assert(fullFreeRender.includes("1.08500 – 1.08550"), "Forex 5-decimal entry range rendered correctly");
  assert(fullFreeRender.includes("1.08200"), "Forex 5-decimal Stop Loss rendered correctly");

  const outlookRender = renderMarketOutlookTemplate({
    eventType: "MARKET_OUTLOOK",
    market: "Crypto & Forex",
    session: "London Session",
    regime: "Trending Bullish",
    keyLevels: ["$67,000", "$68,500"],
    timestamp: new Date().toISOString(),
  });
  assert(outlookRender.includes("HASHIBOT MARKET OUTLOOK"), "Market outlook header rendered correctly");

  const noTradeRender = renderNoTradeTemplate({
    eventType: "NO_TRADE_EXPLANATION",
    market: "Forex Majors",
    details: "Low liquidity before FOMC announcement.",
    timestamp: new Date().toISOString(),
  });
  assert(noTradeRender.includes("HASHIBOT NO-TRADE GUIDANCE"), "No-trade header rendered correctly");

  console.log("   ✅ Template Engine Rendering passed.");

  // 6. Router & Idempotency Key Tests
  console.log("6. Testing Router & Idempotency...");

  const key1 = buildIdempotencyKey(
    {
      event_type: "SIGNAL_PUBLISHED",
      signal_id: "sig-888",
      reason: "approved",
    },
    "vip"
  );
  assert(key1 === "signal_published:vip:sig-888:approved", `Idempotency key generated correctly: ${key1}`);

  const catExec = categorizeEvent("EXECUTION_FILLED");
  assert(catExec.category === "EXECUTION", "Execution filled event category must be EXECUTION");

  console.log("   ✅ Router & Idempotency passed.");

  console.log("\n--- All HashiBot Phase 7A-2A Signal Channels & Free Automation Tests Passed Successfully! ---\n");
}

runPhase7A2ATests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
