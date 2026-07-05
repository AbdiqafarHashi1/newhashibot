import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, x-hashibot-cron-token" };
type Json = Record<string, unknown>;
type PlatformAction =
  | "login" | "register_customer" | "submit_mpesa_payment" | "request_account_setup" | "save_customer_preferences" | "request_executor_action" | "request_account_sync" | "request_telegram_test"
  | "review_mpesa_payment" | "approve_customer" | "reject_customer" | "suspend_customer" | "activate_subscription" | "update_package" | "approve_account_setup" | "pause_account" | "request_account_clarification" | "assign_executor" | "approve_executor" | "disable_executor" | "create_notification" | "update_system_settings"
  | "executor_heartbeat" | "ingest_engine_event" | "audit_log" | "monitoring_summary" | "dev_reset" | "retention_cleanup";

function json(body: Json, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function text(v: unknown) { return typeof v === "string" ? v : ""; }
function num(v: unknown, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function obj(v: unknown): Json { return v && typeof v === "object" && !Array.isArray(v) ? v as Json : {}; }
function required(body: Json, key: string) { const value = text(body[key]); if (!value) throw new Error(`${key} is required`); return value; }
function sanitizePayload(payload: Json) { const blocked = new Set(["apiKey","apiSecret","secret","password","privateKey","api_key","api_secret"]); return Object.fromEntries(Object.entries(payload).filter(([key]) => !blocked.has(key))); }
async function audit(supabase: ReturnType<typeof createClient>, action: string, entity_type: string, entity_id: unknown, customer_id: unknown, after_state: Json = {}) {
  await supabase.rpc("platform_audit", { p_action: action, p_entity_type: entity_type, p_entity_id: entity_id || null, p_customer_id: customer_id || null, p_after: sanitizePayload(after_state) });
}
async function insertRuntimeAction(supabase: ReturnType<typeof createClient>, body: Json, action: string) {
  const executorKey = text(body.executor_key);
  let runtime: Json | null = null;
  if (executorKey) {
    const found = await supabase.from("executor_runtime").select("id,customer_id").eq("executor_key", executorKey).maybeSingle();
    if (found.error) throw found.error;
    runtime = found.data as Json | null;
  }
  const { data, error } = await supabase.from("runtime_actions").insert({ executor_id: runtime?.id ?? body.executor_id ?? null, customer_id: runtime?.customer_id ?? body.customer_id ?? null, actor_role: text(body.actor_role) || "system", actor_id: body.actor_id ?? null, action, status: "queued", payload: sanitizePayload(body) }).select("id").maybeSingle();
  if (error) throw error;
  await audit(supabase, `runtime.${action}_requested`, "runtime_actions", data?.id, runtime?.customer_id ?? body.customer_id ?? null, { action });
  return data?.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, success: false, error: "Method not allowed" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  let body: Json;
  try { body = await req.json(); } catch { return json({ ok: false, success: false, error: "Invalid JSON" }, 400); }
  const action = text(body.action) as PlatformAction;
  const payload = { ...obj(body.payload), ...body };
  delete payload.payload;
  try {
    if (action === "login") return json({ ok: false, success: false, action, error: "login is handled by frontend Supabase Auth, not platform-api" }, 400);

    if (action === "register_customer") {
      const { data, error } = await supabase.rpc("register_platform_customer", { p_email: required(payload, "email"), p_full_name: text(payload.full_name) || text(payload.display_name), p_timezone: text(payload.timezone) || "UTC" });
      if (error) throw error;
      return json({ ok: true, success: true, action, customer_id: data });
    }
    if (action === "submit_mpesa_payment") {
      const { data, error } = await supabase.rpc("submit_manual_mpesa_payment", { p_package_id: payload.package_id || null, p_transaction_code: required(payload, "transaction_code"), p_amount: num(payload.amount), p_reference: text(payload.reference_or_screenshot) || text(payload.reference) });
      if (error) throw error;
      return json({ ok: true, success: true, action, subscription_id: data, status: "pending_review" });
    }
    if (action === "request_account_setup") {
      const { data, error } = await supabase.rpc("request_customer_account_setup", { p_provider: required(payload, "provider"), p_environment: text(payload.environment) || "testnet", p_label: text(payload.account_label) || text(payload.label), p_credential_ref: text(payload.credential_reference), p_metadata: sanitizePayload(obj(payload.metadata)) });
      if (error) throw error;
      return json({ ok: true, success: true, action, account_id: data, status: "setup_requested" });
    }
    if (action === "save_customer_preferences") {
      const { data, error } = await supabase.rpc("save_customer_preferences", { p_preferences: sanitizePayload(payload) });
      if (error) throw error;
      return json({ ok: true, success: true, action, customer_id: data });
    }
    if (action === "request_executor_action" || action === "request_account_sync" || action === "request_telegram_test") {
      const requested = action === "request_account_sync" ? "account_sync" : action === "request_telegram_test" ? "telegram_test" : text(payload.executor_action) || text(payload.action_kind) || text(payload.requested_action) || text(payload.action) || "recovery";
      const id = await insertRuntimeAction(supabase, payload, requested);
      return json({ ok: true, success: true, action, runtime_action_id: id, requested_action: requested });
    }
    if (action === "review_mpesa_payment" || action === "activate_subscription") {
      const decision = action === "activate_subscription" ? "approved" : text(payload.decision) || "submitted";
      const { data, error } = await supabase.rpc("review_manual_mpesa_subscription", { p_subscription_id: required(payload, "subscription_id"), p_decision: decision, p_note: text(payload.note) });
      if (error) throw error;
      return json({ ok: true, success: true, action, status: data });
    }
    if (["approve_customer","reject_customer","suspend_customer"].includes(action)) {
      const status = action === "approve_customer" ? "active" : action === "reject_customer" ? "rejected" : "suspended";
      const { data, error } = await supabase.from("customers").update({ status, status_reason: text(payload.reason), updated_at: new Date().toISOString() }).eq("id", required(payload, "customer_id")).select("id,status").maybeSingle();
      if (error) throw error;
      await audit(supabase, `customer.${status}`, "customers", data?.id, data?.id, { status, reason: text(payload.reason) });
      return json({ ok: true, success: true, action, customer_id: data?.id, status: data?.status });
    }
    if (action === "update_package") {
      const row = sanitizePayload({ package_code: required(payload, "package_code"), name: text(payload.name) || text(payload.package_name), description: text(payload.description), price: num(payload.price), currency: text(payload.currency) || "KES", billing_period: text(payload.billing_period) || "monthly", signal_access: payload.signal_access ?? true, execution_access: payload.execution_access ?? false, telegram_access: payload.telegram_access ?? false, account_limit: num(payload.account_limit, 1), executor_limit: num(payload.executor_limit, 0), provider_permissions: payload.provider_permissions ?? ["binance","bybit"], active: payload.active ?? true, sort_order: num(payload.sort_order, 100), metadata: obj(payload.metadata) });
      const { data, error } = await supabase.from("packages").upsert(row, { onConflict: "package_code" }).select("id,package_code").maybeSingle();
      if (error) throw error;
      await audit(supabase, "package.updated", "packages", data?.id, null, row);
      return json({ ok: true, success: true, action, package_id: data?.id, package_code: data?.package_code });
    }
    if (["approve_account_setup","pause_account","request_account_clarification"].includes(action)) {
      const patch = action === "approve_account_setup" ? { status: "approved", approved_at: new Date().toISOString(), setup_note: text(payload.note) } : action === "pause_account" ? { status: "paused", paused_at: new Date().toISOString(), setup_note: text(payload.note) } : { status: "clarification_requested", clarification_note: text(payload.note) };
      const { data, error } = await supabase.from("customer_accounts").update(patch).eq("id", required(payload, "account_id")).select("id,customer_id,status").maybeSingle();
      if (error) throw error;
      await audit(supabase, `account.${patch.status}`, "customer_accounts", data?.id, data?.customer_id, patch);
      return json({ ok: true, success: true, action, account_id: data?.id, status: data?.status });
    }
    if (["assign_executor","approve_executor","disable_executor"].includes(action)) {
      const requested = action === "assign_executor" ? "assign_executor" : action === "approve_executor" ? "approve_executor" : "disable_executor";
      const id = await insertRuntimeAction(supabase, payload, requested);
      return json({ ok: true, success: true, action, runtime_action_id: id });
    }
    if (action === "create_notification") {
      const { data, error } = await supabase.from("notifications").insert({ customer_id: payload.customer_id || null, channel: text(payload.channel) || "in_app", title: required(payload, "title"), body: text(payload.body), metadata: sanitizePayload(obj(payload.metadata)) }).select("id").maybeSingle();
      if (error) throw error;
      await audit(supabase, "notification.created", "notifications", data?.id, payload.customer_id || null, { title: text(payload.title) });
      return json({ ok: true, success: true, action, notification_id: data?.id });
    }
    if (action === "update_system_settings") {
      const key = required(payload, "key");
      const { data, error } = await supabase.from("system_settings").upsert({ key, value: sanitizePayload(obj(payload.value)), is_public: Boolean(payload.is_public), updated_at: new Date().toISOString() }).select("key").maybeSingle();
      if (error) throw error;
      await audit(supabase, "settings.updated", "system_settings", null, null, { key });
      return json({ ok: true, success: true, action, key: data?.key });
    }
    if (action === "executor_heartbeat") {
      const { data, error } = await supabase.rpc("record_executor_heartbeat", { p_executor_key: required(payload, "executor_key"), p_status: text(payload.status) || "running", p_payload: sanitizePayload(obj(payload.payload)) });
      if (error) throw error;
      return json({ ok: true, success: true, action, executor_id: data });
    }
    if (action === "ingest_engine_event") {
      const { data, error } = await supabase.from("engine_events").insert({ customer_id: payload.customer_id || null, executor_id: payload.executor_id || null, event_type: required(payload, "event_type"), severity: text(payload.severity) || "info", payload: sanitizePayload(obj(payload.event_payload ?? payload.payload)) }).select("id").maybeSingle();
      if (error) throw error;
      return json({ ok: true, success: true, action, engine_event_id: data?.id });
    }
    if (action === "monitoring_summary") {
      const { data, error } = await supabase.rpc("v2_compact_monitoring_summary");
      if (error) throw error;
      return json({ ok: true, success: true, action, summary: data });
    }
    if (action === "retention_cleanup") {
      const { data, error } = await supabase.rpc("v2_cleanup_retained_data", { p_dry_run: payload.dry_run !== false, p_archive: payload.archive !== false });
      if (error) throw error;
      return json({ ok: true, success: true, action, cleanup: data });
    }
    if (action === "dev_reset") {
      if (!["owner","admin"].includes(text(payload.actor_role))) return json({ ok: false, success: false, action, error: "dev reset requires admin/owner role" }, 403);
      const { data, error } = await supabase.rpc("v2_dev_reset", { p_confirmation: required(payload, "confirmation"), p_scopes: Array.isArray(payload.scopes) ? payload.scopes : undefined, p_dry_run: payload.dry_run !== false, p_force_live: payload.force_live === true });
      if (error) throw error;
      return json({ ok: true, success: true, action, reset: data });
    }
    if (action === "audit_log") {
      const { data, error } = await supabase.rpc("platform_audit", { p_action: required(payload, "audit_action"), p_entity_type: required(payload, "entity_type"), p_entity_id: payload.entity_id || null, p_customer_id: payload.customer_id || null, p_after: sanitizePayload(obj(payload.after_state)) });
      if (error) throw error;
      return json({ ok: true, success: true, action, audit_id: data });
    }
    return json({ ok: false, success: false, action, error: "Unsupported platform action" }, 400);
  } catch (error) {
    return json({ ok: false, success: false, action, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
