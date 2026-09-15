import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWhopWebhook } from "../_shared/whop-verification.ts";
import { normalizeWhopEvent, serverPlanMap, supportedWhopEvents } from "../_shared/whop-events.ts";
import { reconcileWhopObject } from "../_shared/whop-reconciliation.ts";

const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const required = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","WHOP_API_KEY","WHOP_WEBHOOK_SECRET","WHOP_PLAN_VIP_SIGNALS","WHOP_PLAN_PERSONAL_AUTO","WHOP_PLAN_FOREX_PROP","WHOP_PLAN_CRYPTO_PROP"];

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });
  const missing = required.filter(name => !Deno.env.get(name));
  if (missing.length) return response(503, { error: "missing_configuration", missing });
  const rawBody = await request.text();
  const verification = verifyWhopWebhook(rawBody, request.headers, Deno.env.get("WHOP_WEBHOOK_SECRET"));
  if (!verification.verified) return response(401, { error: verification.error });
  const event = verification.event;
  if (!event?.id || !event?.type || !event?.timestamp || !event?.data || typeof event.data !== "object") return response(400, { error: "malformed_verified_event" });
  if (!supportedWhopEvents.has(event.type)) return response(202, { state: "unsupported_event_ignored", event_id: event.id });

  let normalized = normalizeWhopEvent(event);
  try { normalized = await reconcileWhopObject(normalized, Deno.env.get("WHOP_API_KEY")); }
  catch { console.error(JSON.stringify({ scope: "whop_webhook", event_id: event.id, error: "authoritative_api_reconciliation_failed" })); return response(503, { error: "authoritative_api_reconciliation_failed", event_id: event.id }); }
  const productSlug = normalized.planId ? serverPlanMap(name => Deno.env.get(name)).get(normalized.planId) ?? null : null;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("process_whop_commerce_event", {
    p_event_id: normalized.eventId, p_event_type: normalized.eventType, p_product_slug: productSlug,
    p_customer_id: normalized.providerCustomerId, p_member_id: normalized.providerMemberId,
    p_membership_id: normalized.membershipId, p_payment_id: normalized.paymentId,
    p_plan_id: normalized.planId, p_product_id: normalized.productId,
    p_customer_email: normalized.customerEmail, p_provider_state: normalized.providerState,
    p_period_start: normalized.periodStart, p_period_end: normalized.periodEnd,
    p_cancel_at_period_end: normalized.cancelAtPeriodEnd, p_occurred_at: normalized.occurredAt,
    p_metadata: normalized.metadata,
  });
  if (error) { console.error(JSON.stringify({ scope: "whop_webhook", event_id: event.id, error: "provider_event_processing_failed" })); return response(500, { error: "provider_event_processing_failed", event_id: event.id }); }
  if (data?.state === "RETRYABLE_CUSTOMER_NOT_LINKED") return response(503, { error: "customer_link_pending", event_id: event.id });
  return response(200, { received: true, event_id: event.id, result: data });
});
