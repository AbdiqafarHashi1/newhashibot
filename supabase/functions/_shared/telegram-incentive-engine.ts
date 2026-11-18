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
  | "EDUCATION"
  | "VERIFIED_RECAP";

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

export const VIP_UPGRADE_LINK = "https://hashibot.app/vip";
export const VIP_CONTACT_HANDLE = "@Abdihashi1";

export function getUpgradeIncentiveBlock(customCta?: string): string {
  if (customCta) return `\n\n${customCta}`;
  return [
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💎 *UPGRADE TO HASHIBOT VIP*`,
    `Unlock real-time institutional Crypto & Forex setups, complete entry zones, dynamic SL/TPs, and automatic break-even trailing management.`,
    ``,
    `🔗 *Direct Upgrade:* [hashibot.trade/vip](${VIP_UPGRADE_LINK})`,
    `💬 *Manual Access & Inquiries:* Text ${VIP_CONTACT_HANDLE} on Telegram`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");
}

/**
 * Contextual CTA generator for Free Channel posts
 */
export function getContextualCTA(trigger: CtaTrigger): string {
  switch (trigger) {
    case "after_tp1":
      return [
        `🎯 *Target 1 Smashed!* (Real-Time Trade Management)`,
        `VIP members had SL moved to Breakeven automatically. Never miss live execution alerts.`,
        getUpgradeIncentiveBlock(),
      ].join("\n");
    case "after_tp2":
      return [
        `🔥 *Target 2 Captured!* (Maximum Profit Lock)`,
        `Join our VIP Signal Room to get all Crypto & Forex setups with zero delay.`,
        getUpgradeIncentiveBlock(),
      ].join("\n");
    case "after_stop_loss":
      return [
        `🛡️ *Institutional Capital Preservation in Action.*`,
        `Consistent profitability is built on rigorous 0.5%–1.0% risk sizing and automated protection.`,
        getUpgradeIncentiveBlock(),
      ].join("\n");
    case "after_expiry":
      return [
        `⌛ *Patience & Discipline:* We only trade A/A+ institutional market structures.`,
        getUpgradeIncentiveBlock(),
      ].join("\n");
    case "quiet_market":
      return [
        `💡 *Active Scanning:* HashiBot algorithms are scanning 24/7 across Crypto, Forex Majors, and Gold.`,
        getUpgradeIncentiveBlock(),
      ].join("\n");
    case "weekly_summary":
      return [
        `📊 *Ready for the trading week ahead?*`,
        `Get complete real-time access to all high-grade trade signals and lifecycle management.`,
        getUpgradeIncentiveBlock(),
      ].join("\n");
    default:
      return getUpgradeIncentiveBlock();
  }
}
