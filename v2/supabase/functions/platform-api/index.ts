import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, x-hashibot-cron-token" };
type Json = Record<string, unknown>;
function json(body: Json, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function text(v: unknown) { return typeof v === "string" ? v : ""; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  let body: Json;
  try { body = await req.json(); } catch { return json({ success: false, error: "Invalid JSON" }, 400); }
  const action = text(body.action);
  try {
    if (action === "customer_registration") {
      const { data, error } = await supabase.rpc("register_platform_customer", { p_email: text(body.email), p_full_name: text(body.full_name), p_timezone: text(body.timezone) || "UTC" });
      if (error) throw error;
      return json({ success: true, customer_id: data });
    }
    if (action === "subscription_activation" || action === "manual_mpesa_review") {
      const { data, error } = await supabase.rpc("review_manual_mpesa_subscription", { p_subscription_id: text(body.subscription_id), p_decision: text(body.decision), p_note: text(body.note) });
      if (error) throw error;
      return json({ success: true, status: data });
    }
    if (action === "executor_heartbeat") {
      const { data, error } = await supabase.rpc("record_executor_heartbeat", { p_executor_key: text(body.executor_key), p_status: text(body.status) || "running", p_payload: body.payload ?? {} });
      if (error) throw error;
      return json({ success: true, executor_id: data });
    }
    if (action === "engine_event_ingestion") {
      const { data, error } = await supabase.from("engine_events").insert({ customer_id: body.customer_id || null, executor_id: body.executor_id || null, event_type: text(body.event_type), severity: text(body.severity) || "info", payload: body.payload ?? {} }).select("id").maybeSingle();
      if (error) throw error;
      return json({ success: true, engine_event_id: data?.id });
    }
    if (action === "notification_generation") {
      const { data, error } = await supabase.from("notifications").insert({ customer_id: body.customer_id || null, channel: text(body.channel) || "in_app", title: text(body.title), body: text(body.body), metadata: body.metadata ?? {} }).select("id").maybeSingle();
      if (error) throw error;
      return json({ success: true, notification_id: data?.id });
    }
    if (action === "audit_logging") {
      const { data, error } = await supabase.rpc("platform_audit", { p_action: text(body.audit_action), p_entity_type: text(body.entity_type), p_entity_id: body.entity_id || null, p_customer_id: body.customer_id || null, p_after: body.after_state ?? {} });
      if (error) throw error;
      return json({ success: true, audit_id: data });
    }
    return json({ success: false, error: "Unsupported platform action" }, 400);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
