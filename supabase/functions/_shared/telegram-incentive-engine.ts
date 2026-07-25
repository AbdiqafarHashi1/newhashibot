/**
 * HashiBot Phase 7A-2A Incentive & Upgrade Engine & Anti-Spam Manager
 * Manages promotional campaigns, contextual upgrade invitations, and enforces rate limits:
 * - Max 1 promo message per day
 * - Max 3 promo messages per week
 * - Anti-repetition & strict regulatory compliance (NO guaranteed returns / win rates)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export type CampaignType =
  | "VIP_INVITATION"
  | "TRIAL"
  | "PRODUCT_UPDATE"
  | "FEATURE_ANNOUNCEMENT"
  | "EDUCATION";

export type CtaTrigger =
  | "after_tp1"
  | "after_tp2"
  | "after_stop_loss"
  | "after_expiry"
  | "quiet_market"
  | "weekly_summary";

export interface CampaignRequest {
  campaignId: string;
  campaignType: CampaignType;
  channel?: string;
  trigger?: CtaTrigger;
  content: string;
}

export interface AntiSpamCheckResult {
  allowed: boolean;
  reason: string;
}

/**
 * Compliance check: Ensures promotional copy does NOT violate financial regulatory standards.
 */
export function validateCampaignCompliance(content: string): { compliant: boolean; violation?: string } {
  const BANNED_PATTERNS = [
    { pattern: /guaranteed profit/i, reason: "Guaranteed profits prohibited" },
    { pattern: /guaranteed return/i, reason: "Guaranteed returns prohibited" },
    { pattern: /guaranteed win\s*rate/i, reason: "Guaranteed win rate prohibited" },
    { pattern: /100%\s*win/i, reason: "Unrealistic win rate claim prohibited" },
    { pattern: /passive income/i, reason: "Passive income claims prohibited" },
    { pattern: /risk-free/i, reason: "Risk-free claims prohibited" },
    { pattern: /get rich/i, reason: "Get rich claims prohibited" },
    { pattern: /only \d+ spots left/i, reason: "Fake scarcity prohibited" },
  ];

  for (const { pattern, reason } of BANNED_PATTERNS) {
    if (pattern.test(content)) {
      return { compliant: false, violation: reason };
    }
  }

  return { compliant: true };
}

/**
 * Check rate limits:
 * Max 1 promo / 24 hours
 * Max 3 promo / 7 days
 */
export async function checkAntiSpamLimits(
  supabase: SupabaseClient,
  channel: string = "free"
): Promise<AntiSpamCheckResult> {
  try {
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Check 24-hour limit (max 1)
    const { count: dailyCount } = await supabase
      .from("telegram_campaign_logs")
      .select("id", { count: "exact", head: true })
      .eq("channel", channel)
      .gte("delivered_at", twentyFourHoursAgo);

    if ((dailyCount ?? 0) >= 1) {
      return { allowed: false, reason: "DAILY_PROMO_LIMIT_REACHED (Max 1 promo / 24h)" };
    }

    // Check 7-day limit (max 3)
    const { count: weeklyCount } = await supabase
      .from("telegram_campaign_logs")
      .select("id", { count: "exact", head: true })
      .eq("channel", channel)
      .gte("delivered_at", sevenDaysAgo);

    if ((weeklyCount ?? 0) >= 3) {
      return { allowed: false, reason: "WEEKLY_PROMO_LIMIT_REACHED (Max 3 promos / 7d)" };
    }

    return { allowed: true, reason: "WITHIN_RATE_LIMITS" };
  } catch {
    // Fail safe to prevent promo spam if database query fails
    return { allowed: false, reason: "ANTI_SPAM_QUERY_FAILED" };
  }
}

/**
 * Record a delivered campaign to campaign logs
 */
export async function recordCampaignDelivery(
  supabase: SupabaseClient,
  request: CampaignRequest
): Promise<void> {
  try {
    await supabase.from("telegram_campaign_logs").insert({
      campaign_id: request.campaignId,
      campaign_type: request.campaignType,
      channel: request.channel ?? "free",
      cta_trigger: request.trigger,
      delivered_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Contextual CTA generator for Free Channel posts
 */
export function getContextualCTA(trigger: CtaTrigger): string {
  switch (trigger) {
    case "after_tp1":
      return `\n\n🎯 *Want real-time updates for all market setups?*\nUpgrade to HashiBot VIP Signals for full entry ranges, TP1–TP3 guidance, and instant alerts.`;
    case "after_tp2":
      return `\n\n🔥 *TP2 Hit!* Never miss a high-probability setup.\nJoin the HashiBot VIP Signal Room today for complete coverage.`;
    case "after_stop_loss":
      return `\n\n🛡️ *Risk Management in Action.* Consistent trading is built on strict risk control.\nExplore our strategy playbooks in the VIP Room.`;
    case "after_expiry":
      return `\n\n⌛ *Patience & Discipline.* We only take setups that meet strict institutional criteria.`;
    case "quiet_market":
      return `\n\n💡 *Quiet Market Phase:* HashiBot algorithms are scanning 24/7 across Crypto and Forex. Quality setups only.`;
    case "weekly_summary":
      return `\n\n📊 *Ready for the week ahead?*\nGet full access to all A/A+ institutional signals with HashiBot VIP.`;
    default:
      return `\n\n🚀 *Upgrade to HashiBot VIP* for real-time institutional signal alerts.`;
  }
}
