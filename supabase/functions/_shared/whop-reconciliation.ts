import { WhopClient } from "npm:@whop/sdk@1.1.4";

export async function reconcileWhopObject<T extends Record<string, any>>(normalized: T, apiKey: string | undefined): Promise<T> {
  if (!apiKey) throw new Error("missing_configuration:WHOP_API_KEY");
  const client = new WhopClient({ token: apiKey, apiVersionDate: "2026-09-11" });
  if (normalized.membershipId) {
    const membership = await client.memberships.retrieve({ id: normalized.membershipId });
    normalized.providerCustomerId = membership.user_id ?? normalized.providerCustomerId;
    normalized.planId = membership.plan_id;
    normalized.productId = membership.product_id;
    normalized.providerState = membership.status;
    normalized.periodStart = membership.created_at;
    normalized.periodEnd = membership.current_period_end;
    normalized.cancelAtPeriodEnd = membership.cancel_at_period_end;
  }
  if (normalized.paymentId) {
    const payment = await client.payments.retrieve({ id: normalized.paymentId });
    normalized.providerCustomerId = payment.user?.id ?? normalized.providerCustomerId;
    normalized.providerMemberId = payment.member_id ?? normalized.providerMemberId;
    normalized.membershipId = payment.membership_id ?? normalized.membershipId;
    normalized.planId = payment.plan_id ?? normalized.planId;
    normalized.productId = payment.product_id ?? normalized.productId;
    normalized.customerEmail = payment.customer_email ?? normalized.customerEmail;
    normalized.providerState = payment.status;
    normalized.periodStart = payment.created_at;
  }
  return normalized;
}
