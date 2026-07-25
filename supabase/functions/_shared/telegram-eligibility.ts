/**
 * HashiBot Phase 7A-2A Customer Eligibility Engine
 * Verifies channel access and subscription status for Admin, Free, and VIP Signals.
 * Execution customers and execution channels are explicitly excluded in this phase.
 */

import { TelegramChannelKey } from "./telegram-registry.ts";

export type CustomerRole = "admin" | "vip_subscriber" | "free_user" | "guest";

export interface CustomerEligibilityContext {
  userId?: string;
  role?: CustomerRole;
  subscriptionPackage?: string;
  subscriptionStatus?: "active" | "trial" | "expired" | "cancelled" | "disabled";
  expiresAt?: string;
}

export interface EligibilityResult {
  allowed: boolean;
  channel: TelegramChannelKey;
  reason: string;
}

/**
 * VIP Signals Package Types
 */
export const VIP_SIGNALS_PACKAGES = [
  "vip_signals_only",
  "crypto_signal_room",
  "crypto_personal_bot",
  "forex_mt5_personal_bot",
  "forex_mt5_prop_bot",
  "all_access_pass",
];

/**
 * Check if a customer/context is eligible to receive content for a target channel
 */
export function verifyChannelEligibility(
  channel: TelegramChannelKey,
  context?: CustomerEligibilityContext
): EligibilityResult {
  // 1. Admin Channel — System operators / Admins only
  if (channel === "admin") {
    if (context?.role === "admin") {
      return { allowed: true, channel, reason: "ADMIN_GRANTED" };
    }
    // If no context provided, system routing to admin channel is allowed internally
    if (!context || !context.userId) {
      return { allowed: true, channel, reason: "INTERNAL_SYSTEM_DISPATCH" };
    }
    return { allowed: false, channel, reason: "NOT_ADMIN" };
  }

  // 2. Free Channel — Public channel, open to all active/trial/free users and guests
  if (channel === "free") {
    if (context?.subscriptionStatus === "disabled") {
      return { allowed: false, channel, reason: "USER_DISABLED" };
    }
    return { allowed: true, channel, reason: "FREE_CHANNEL_PUBLIC_ACCESS" };
  }

  // 3. VIP Signals Channel — Requires active VIP subscription or trial
  if (channel === "vip") {
    if (!context) {
      // System broadcast to public VIP channel
      return { allowed: true, channel, reason: "VIP_CHANNEL_BROADCAST" };
    }

    if (context.role === "admin") {
      return { allowed: true, channel, reason: "ADMIN_OVERRIDE" };
    }

    if (context.subscriptionStatus === "disabled") {
      return { allowed: false, channel, reason: "USER_DISABLED" };
    }

    if (context.subscriptionStatus === "expired") {
      return { allowed: false, channel, reason: "SUBSCRIPTION_EXPIRED" };
    }

    if (context.subscriptionStatus === "cancelled") {
      return { allowed: false, channel, reason: "SUBSCRIPTION_CANCELLED" };
    }

    if (context.expiresAt && new Date(context.expiresAt).getTime() < Date.now()) {
      return { allowed: false, channel, reason: "SUBSCRIPTION_EXPIRED_DATE" };
    }

    const pkg = context.subscriptionPackage?.toLowerCase() ?? "";
    const hasValidPackage = VIP_SIGNALS_PACKAGES.some((p) => pkg.includes(p)) || context.role === "vip_subscriber";

    if ((context.subscriptionStatus === "active" || context.subscriptionStatus === "trial") && hasValidPackage) {
      return { allowed: true, channel, reason: "VIP_SUBSCRIPTION_ACTIVE" };
    }

    return { allowed: false, channel, reason: "INSUFFICIENT_SUBSCRIPTION" };
  }

  // 4. Excluded / Unsupported Channels in Phase 7A-2A
  if (channel === "vip_execution" || channel === "customer_direct") {
    return {
      allowed: false,
      channel,
      reason: "EXECUTION_CUSTOMER_NOTIFICATIONS_EXCLUDED_IN_PHASE_7A2A",
    };
  }

  return { allowed: true, channel, reason: "DEFAULT_CHANNEL_ALLOW" };
}
