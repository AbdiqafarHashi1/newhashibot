export type Audience = "FREE" | "VIP" | "EXECUTION" | "ADMIN" | "OWNER";
export type FulfillmentAction = "ADD" | "RESTORE" | "SUSPEND" | "REMOVE";
export type EntitlementState = "ACTIVE" | "TRIAL" | "GRACE" | "PENDING" | "SUSPENDED" | "EXPIRED" | "REVOKED";

export const PRODUCT_AUDIENCE: Readonly<Record<string, Audience>> = Object.freeze({
  FREE_SIGNALS: "FREE",
  VIP_SIGNALS: "VIP",
  FOUNDING_AUTO_EXECUTION: "EXECUTION",
});

export function audienceForProduct(productCode: string): Audience | null {
  return PRODUCT_AUDIENCE[productCode] ?? null;
}

export function desiredMembership(state: EntitlementState): "ACTIVE" | "SUSPENDED" | "REMOVED" {
  if (["ACTIVE", "TRIAL", "GRACE"].includes(state)) return "ACTIVE";
  if (["PENDING", "SUSPENDED"].includes(state)) return "SUSPENDED";
  return "REMOVED";
}

export function actionStillValid(action: FulfillmentAction, state: EntitlementState): boolean {
  const desired = desiredMembership(state);
  return action === "ADD" || action === "RESTORE" ? desired === "ACTIVE"
    : action === "SUSPEND" ? desired === "SUSPENDED"
    : desired === "REMOVED";
}

export function classifyTelegramError(status: number, description = "") {
  const message = description.toLowerCase();
  if (status === 429) return { classification: "RATE_LIMITED", retryable: true } as const;
  if (status >= 500 || status === 0) return { classification: "UNCERTAIN", retryable: true } as const;
  if (message.includes("not enough rights") || message.includes("administrator")) return { classification: "PERMISSION_MISSING", retryable: true } as const;
  if (status === 401) return { classification: "CONFIGURATION_INVALID", retryable: true } as const;
  return { classification: "PROVIDER_REJECTED", retryable: false } as const;
}

export const boundedBackoffSeconds = (attempt: number) => Math.min(900, 5 * (2 ** Math.max(0, attempt - 1)));
