export const supportedWhopEvents = new Set(["member.created","member.updated","membership.activated","membership.cancel_at_period_end_changed","membership.deactivated","payment.succeeded","payment.failed","payment.pending","refund.created","refund.updated","dispute.created","dispute.updated"]);
const text = (value: unknown) => typeof value === "string" && value ? value : null;
const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

export function normalizeWhopEvent(event: { id: string; type: string; timestamp: string; data: Record<string, unknown> }) {
  const data = record(event.data), user = record(data.user), payment = record(data.payment), nestedUser = record(payment.user), membership = record(data.membership ?? payment.membership), plan = record(data.plan ?? payment.plan), product = record(data.product ?? payment.product);
  const kind = event.type.split(".")[0];
  return {
    eventId: text(event.id), eventType: text(event.type), occurredAt: text(event.timestamp),
    providerCustomerId: text(kind === "member" ? user.id : data.user_id ?? user.id ?? nestedUser.id),
    providerMemberId: text(kind === "member" ? data.id : data.member_id ?? record(data.member).id ?? record(payment.member).id),
    membershipId: text(kind === "membership" ? data.id : data.membership_id ?? membership.id),
    paymentId: text(kind === "payment" ? data.id : payment.id),
    planId: text(data.plan_id ?? plan.id), productId: text(data.product_id ?? product.id),
    customerEmail: text(data.customer_email ?? nestedUser.email), providerState: text(data.status),
    periodStart: text(data.created_at), periodEnd: text(data.current_period_end),
    cancelAtPeriodEnd: typeof data.cancel_at_period_end === "boolean" ? data.cancel_at_period_end : null,
    metadata: { object_id: text(data.id), billing_reason: text(data.billing_reason), substatus: text(data.substatus), refund_or_dispute_status: kind === "refund" || kind === "dispute" ? text(data.status) : null },
  };
}

export function serverPlanMap(env: (name: string) => string | undefined) {
  return new Map([
    [env("WHOP_PLAN_VIP_SIGNALS"), "crypto_signal_room"],
    [env("WHOP_PLAN_PERSONAL_AUTO"), "forex_mt5_personal_bot"],
    [env("WHOP_PLAN_FOREX_PROP"), "forex_mt5_prop_bot"],
    [env("WHOP_PLAN_CRYPTO_PROP"), "crypto_prop_bot"],
  ].filter((entry): entry is [string,string] => Boolean(entry[0])));
}
