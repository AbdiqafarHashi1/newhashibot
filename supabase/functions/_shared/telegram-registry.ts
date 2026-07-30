/**
 * HashiBot Phase 7A-1 Authoritative Telegram Channel Registry
 * Backend-owned destination registry describing every Telegram destination.
 */

import { TelegramEventCategory, TelegramVisibility } from "./telegram-taxonomy.ts";

export type TelegramChannelKey = "admin" | "free" | "vip" | "vip_execution" | "analytics" | "customer_direct" | "test";

export interface TelegramDestination {
  id: string;
  channelKey: TelegramChannelKey;
  purpose: string;
  chatId: string;
  environment: "sandbox" | "testnet" | "production";
  enabled: boolean;
  supportedCategories: TelegramEventCategory[];
  providerScope: string[];
  marketScope: string[];
  packageScope: string[];
  ratePolicy: {
    maxMessagesPerMinute: number;
    cooldownSeconds: number;
  };
  health: "healthy" | "degraded" | "offline";
  lastSuccess: string | null;
  lastFailure: string | null;
  configSource: "env" | "database";
}

export function getVipChatId(): string {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get("TELEGRAM_CHAT_ID") ?? Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID") ?? "";
  }
  return "";
}

export function vipChatId(): string {
  return getVipChatId();
}

export function getAdminChatId(): string {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") ?? getVipChatId();
  }
  return "";
}

export function getFreeChatId(): string {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get("TELEGRAM_FREE_CHAT_ID") ?? getVipChatId();
  }
  return "";
}

export function getAnalyticsChatId(): string {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get("TELEGRAM_ANALYTICS_CHAT_ID") ?? getAdminChatId();
  }
  return "";
}

export function getBotToken(): string {
  if (typeof Deno !== "undefined" && Deno.env) {
    return Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  }
  return "";
}

export class TelegramChannelRegistry {
  private static instance: TelegramChannelRegistry;
  private destinations: Map<TelegramChannelKey, TelegramDestination> = new Map();

  constructor() {
    this.refreshFromEnv();
  }

  public static getInstance(): TelegramChannelRegistry {
    if (!TelegramChannelRegistry.instance) {
      TelegramChannelRegistry.instance = new TelegramChannelRegistry();
    }
    return TelegramChannelRegistry.instance;
  }

  public refreshFromEnv(): void {
    const adminChatId = getAdminChatId();
    const freeChatId = getFreeChatId();
    const vipChatId = getVipChatId();
    const analyticsChatId = getAnalyticsChatId();

    this.destinations.set("admin", {
      id: "dest_admin_ops",
      channelKey: "admin",
      purpose: "HashiBot Core Operations, Supervisor, Recovery & Risk Alerts",
      chatId: adminChatId,
      environment: "testnet",
      enabled: !!adminChatId,
      supportedCategories: ["RECOVERY", "RISK", "RUNTIME", "TELEGRAM", "PROTECTION", "EXECUTION"],
      providerScope: ["all"],
      marketScope: ["all"],
      packageScope: ["all"],
      ratePolicy: { maxMessagesPerMinute: 60, cooldownSeconds: 0 },
      health: adminChatId ? "healthy" : "degraded",
      lastSuccess: null,
      lastFailure: null,
      configSource: "env",
    });

    this.destinations.set("free", {
      id: "dest_free_public",
      channelKey: "free",
      purpose: "Free Public Channel - Educational Teasers & Delayed Market Previews",
      chatId: freeChatId,
      environment: "testnet",
      enabled: !!freeChatId,
      supportedCategories: ["SIGNALS"],
      providerScope: ["all"],
      marketScope: ["all"],
      packageScope: ["free_preview"],
      ratePolicy: { maxMessagesPerMinute: 10, cooldownSeconds: 300 },
      health: freeChatId ? "healthy" : "degraded",
      lastSuccess: null,
      lastFailure: null,
      configSource: "env",
    });

    this.destinations.set("vip", {
      id: "dest_vip_signals",
      channelKey: "vip",
      purpose: "VIP Signal Room - High-Grade Qualified Trading Signals & Lifecycle Updates",
      chatId: vipChatId,
      environment: "testnet",
      enabled: !!vipChatId,
      supportedCategories: ["SIGNALS", "PROTECTION"],
      providerScope: ["all"],
      marketScope: ["crypto", "forex", "metals"],
      packageScope: ["crypto_signal_room", "crypto_personal_bot", "forex_mt5_personal_bot", "forex_mt5_prop_bot"],
      ratePolicy: { maxMessagesPerMinute: 30, cooldownSeconds: 0 },
      health: vipChatId ? "healthy" : "degraded",
      lastSuccess: null,
      lastFailure: null,
      configSource: "env",
    });

    this.destinations.set("vip_execution", {
      id: "dest_vip_execution",
      channelKey: "vip_execution",
      purpose: "VIP Automated Execution Channel - Real-time Execution & Fill Notifications",
      chatId: vipChatId, // Fallback to VIP chat ID if dedicated execution chat ID is missing
      environment: "testnet",
      enabled: !!vipChatId,
      supportedCategories: ["EXECUTION", "PROTECTION"],
      providerScope: ["binance", "bybit", "mt5_personal", "mt5_prop"],
      marketScope: ["crypto", "forex", "metals"],
      packageScope: ["crypto_personal_bot", "forex_mt5_personal_bot", "forex_mt5_prop_bot"],
      ratePolicy: { maxMessagesPerMinute: 60, cooldownSeconds: 0 },
      health: vipChatId ? "healthy" : "degraded",
      lastSuccess: null,
      lastFailure: null,
      configSource: "env",
    });

    this.destinations.set("analytics", {
      id: "dest_analytics",
      channelKey: "analytics",
      purpose: "Market Analytics, Watchlists & Macro Market Digests",
      chatId: analyticsChatId,
      environment: "testnet",
      enabled: !!analyticsChatId,
      supportedCategories: ["RUNTIME", "SIGNALS"],
      providerScope: ["all"],
      marketScope: ["all"],
      packageScope: ["all"],
      ratePolicy: { maxMessagesPerMinute: 20, cooldownSeconds: 60 },
      health: analyticsChatId ? "healthy" : "degraded",
      lastSuccess: null,
      lastFailure: null,
      configSource: "env",
    });

    this.destinations.set("customer_direct", {
      id: "dest_customer_direct",
      channelKey: "customer_direct",
      purpose: "Direct Customer Notification Channel for Account-Specific Events",
      chatId: "",
      environment: "testnet",
      enabled: false, // Deferred to Phase 7A-2
      supportedCategories: ["EXECUTION", "PROTECTION", "RISK"],
      providerScope: ["all"],
      marketScope: ["all"],
      packageScope: ["all"],
      ratePolicy: { maxMessagesPerMinute: 10, cooldownSeconds: 0 },
      health: "degraded",
      lastSuccess: null,
      lastFailure: null,
      configSource: "database",
    });

    this.destinations.set("test", {
      id: "dest_test_sandbox",
      channelKey: "test",
      purpose: "Operator Sandbox & Diagnostic Verification Channel",
      chatId: adminChatId || vipChatId,
      environment: "sandbox",
      enabled: true,
      supportedCategories: ["SIGNALS", "EXECUTION", "PROTECTION", "RECOVERY", "RISK", "RUNTIME", "TELEGRAM"],
      providerScope: ["all"],
      marketScope: ["all"],
      packageScope: ["all"],
      ratePolicy: { maxMessagesPerMinute: 120, cooldownSeconds: 0 },
      health: "healthy",
      lastSuccess: null,
      lastFailure: null,
      configSource: "env",
    });
  }

  public getDestination(channelKey: TelegramChannelKey): TelegramDestination | undefined {
    return this.destinations.get(channelKey);
  }

  public getAllDestinations(): TelegramDestination[] {
    return Array.from(this.destinations.values());
  }

  public getChannelsForVisibility(visibility: TelegramVisibility): TelegramChannelKey[] {
    switch (visibility) {
      case "ADMIN_ONLY":
        return ["admin"];
      case "FREE_PUBLIC":
        return ["free"];
      case "VIP_SIGNAL":
        return ["vip"];
      case "VIP_EXECUTION":
        return ["vip_execution"];
      case "ANALYTICS":
        return ["analytics"];
      case "CUSTOMER_DIRECT":
        return ["customer_direct"];
      case "ADMIN_AND_CUSTOMER":
        return ["admin", "customer_direct"];
      case "NO_TELEGRAM":
        return [];
      default:
        return ["admin"];
    }
  }

  public markHealth(channelKey: TelegramChannelKey, success: boolean, timestamp = new Date().toISOString(), error = ""): void {
    const dest = this.destinations.get(channelKey);
    if (!dest) return;

    if (success) {
      dest.lastSuccess = timestamp;
      dest.health = "healthy";
    } else {
      dest.lastFailure = timestamp;
      dest.health = "degraded";
    }
  }
}

export const channelRegistry = TelegramChannelRegistry.getInstance();
