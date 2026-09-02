/**
 * HashiBot Phase 7A-1 Normalized Telegram Event Taxonomy
 * Defines authoritative event taxonomy across 7 primary operational groups.
 */

export type TelegramEventCategory =
  | "INTELLIGENCE"
  | "SIGNALS"
  | "EXECUTION"
  | "PROTECTION"
  | "RECOVERY"
  | "RISK"
  | "RUNTIME"
  | "TELEGRAM";

export type TelegramVisibility =
  | "ADMIN_ONLY"
  | "FREE_PUBLIC"
  | "VIP_SIGNAL"
  | "VIP_EXECUTION"
  | "ALL_MEMBERS"
  | "ANALYTICS"
  | "CUSTOMER_DIRECT"
  | "ADMIN_AND_CUSTOMER"
  | "NO_TELEGRAM";

export type TelegramEventSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const TELEGRAM_EVENT_TAXONOMY = {
  INTELLIGENCE: [
    "MORNING_BRIEF",
    "NEWS_DIGEST",
    "MARKET_WRAP",
    "AI_ANALYSIS",
    "WATCHLIST_PATTERN_UPDATE",
    "MARKET_OUTLOOK",
  ],
  SIGNALS: [
    "SIGNAL_QUALIFIED",
    "SIGNAL_PUBLISHED",
    "SIGNAL_ENTRY_ACTIVE",
    "SIGNAL_EXPIRED",
    "SIGNAL_CANCELLED",
    "SIGNAL_TP1",
    "SIGNAL_TP2",
    "SIGNAL_STOPPED",
    "SIGNAL_CLOSED",
  ],
  EXECUTION: [
    "EXECUTION_QUEUED",
    "EXECUTION_SUBMITTED",
    "EXECUTION_ACKNOWLEDGED",
    "EXECUTION_FILLED",
    "EXECUTION_REJECTED",
    "EXECUTION_FAILED",
    "EXECUTION_SKIPPED",
    "POSITION_PARTIALLY_CLOSED",
    "POSITION_CLOSED",
  ],
  PROTECTION: [
    "PROTECTION_REQUIRED",
    "PROTECTION_REQUESTED",
    "PROTECTION_VERIFIED",
    "PROTECTION_PARTIAL",
    "PROTECTION_FAILED",
    "PROTECTION_REPAIRED",
    "BREAK_EVEN_APPLIED",
    "TRAILING_STOP_APPLIED",
  ],
  RECOVERY: [
    "SUPERVISOR_WARNING",
    "SUPERVISOR_FAILURE",
    "RECOVERY_STARTED",
    "RECOVERY_SUCCEEDED",
    "RECOVERY_FAILED",
    "ORPHAN_POSITION_DETECTED",
    "ORPHAN_ORDER_DETECTED",
    "RECONCILIATION_MISMATCH",
    "RECONCILIATION_RESOLVED",
  ],
  RISK: [
    "RISK_ENTRY_BLOCKED",
    "DAILY_LOSS_LOCK",
    "OVERALL_DRAWDOWN_LOCK",
    "PROP_ACCOUNT_LOCKED",
    "CAPITAL_ALLOCATION_FAILED",
    "EMERGENCY_STOP_ACTIVATED",
    "RUNTIME_RESUMED",
  ],
  RUNTIME: [
    "SCANNER_FAILED",
    "SCANNER_RECOVERED",
    "PROVIDER_DEGRADED",
    "PROVIDER_OFFLINE",
    "PROVIDER_RECOVERED",
    "MT5_HEARTBEAT_STALE",
    "DATABASE_FAILURE",
    "SCHEDULER_FAILURE",
    "OPERATOR_COMMAND_COMPLETED",
    "OPERATOR_COMMAND_FAILED",
  ],
  TELEGRAM: [
    "TELEGRAM_DELIVERY_QUEUED",
    "TELEGRAM_DELIVERY_SENT",
    "TELEGRAM_DELIVERY_FAILED",
    "TELEGRAM_DELIVERY_RETRYING",
    "TELEGRAM_DELIVERY_DEAD_LETTERED",
  ],
} as const;

export function categorizeEvent(eventType: string): { category: TelegramEventCategory; defaultVisibility: TelegramVisibility } {
  const norm = eventType.toUpperCase().trim();

  // Intelligence & Daily News / AI Analysis group -> Both Free & VIP get these
  if (
    norm.startsWith("INTELLIGENCE_") ||
    norm.includes("MORNING_BRIEF") ||
    norm.includes("NEWS_DIGEST") ||
    norm.includes("MARKET_WRAP") ||
    norm.includes("AI_ANALYSIS") ||
    norm.includes("WATCHLIST_PATTERN") ||
    norm.includes("MARKET_OUTLOOK")
  ) {
    return { category: "INTELLIGENCE", defaultVisibility: "ALL_MEMBERS" };
  }

  // Signals group
  if (
    norm.startsWith("SIGNAL_") ||
    norm.includes("SIGNAL_CREATED") ||
    norm.includes("SIGNAL_APPROVED") ||
    norm === "NEW_SIGNAL"
  ) {
    return { category: "SIGNALS", defaultVisibility: "VIP_SIGNAL" };
  }

  // Execution group
  if (
    norm.startsWith("EXECUTION_") ||
    norm.includes("TRADE_") ||
    norm.includes("ORDER_") ||
    norm.includes("POSITION_")
  ) {
    return { category: "EXECUTION", defaultVisibility: "VIP_EXECUTION" };
  }

  // Protection group
  if (
    norm.startsWith("PROTECTION_") ||
    norm.includes("BREAK_EVEN") ||
    norm.includes("TRAILING_STOP") ||
    norm.includes("TP1_HIT") ||
    norm.includes("TP2_HIT") ||
    norm.includes("STOP_HIT")
  ) {
    return { category: "PROTECTION", defaultVisibility: "VIP_EXECUTION" };
  }

  // Recovery group
  if (
    norm.startsWith("RECOVERY_") ||
    norm.startsWith("SUPERVISOR_") ||
    norm.includes("ORPHAN_") ||
    norm.includes("RECONCILIATION_")
  ) {
    return { category: "RECOVERY", defaultVisibility: "ADMIN_ONLY" };
  }

  // Risk group
  if (
    norm.startsWith("RISK_") ||
    norm.includes("DRAWDOWN") ||
    norm.includes("LOCK") ||
    norm.includes("EMERGENCY_STOP")
  ) {
    return { category: "RISK", defaultVisibility: "ADMIN_ONLY" };
  }

  // Runtime group
  if (
    norm.startsWith("SCANNER_") ||
    norm.startsWith("PROVIDER_") ||
    norm.includes("HEARTBEAT") ||
    norm.includes("DATABASE_") ||
    norm.includes("SCHEDULER_") ||
    norm.includes("OPERATOR_") ||
    norm.startsWith("ADMIN_")
  ) {
    return { category: "RUNTIME", defaultVisibility: "ADMIN_ONLY" };
  }

  // Telegram group
  if (norm.startsWith("TELEGRAM_")) {
    return { category: "TELEGRAM", defaultVisibility: "ADMIN_ONLY" };
  }

  // Default fallback
  return { category: "RUNTIME", defaultVisibility: "ADMIN_ONLY" };
}
