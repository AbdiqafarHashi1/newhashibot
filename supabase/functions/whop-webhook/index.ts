import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifyWhopWebhook } from "../_shared/whop-verification.ts";

const supportedEvents = new Set([
  "member.created", "member.updated", "membership.activated",
  "membership.cancel_at_period_end_changed", "membership.deactivated",
  "payment.succeeded", "payment.failed", "payment.pending",
  "refund.created", "refund.updated", "dispute.created", "dispute.updated",
]);

const response = (status: number, error: string) => new Response(JSON.stringify({ error }), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return response(405, "method_not_allowed");
  const rawBody = await request.text();
  const verification = await verifyWhopWebhook(request, rawBody, Deno.env.get("WHOP_WEBHOOK_SECRET"));
  if (!verification.verified) return response(503, verification.error);

  // Parsing and persistence can only be reached after official authenticity verification.
  const event = JSON.parse(rawBody) as { type?: string };
  if (!event.type || !supportedEvents.has(event.type)) return response(202, "unsupported_event_ignored");
  return response(503, "verified_event_processor_not_enabled");
});
