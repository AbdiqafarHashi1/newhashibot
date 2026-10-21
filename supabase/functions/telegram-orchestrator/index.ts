import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateIntelligence, storeIntelligenceEvent } from "../_shared/intelligence-engine.ts";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { authJsonResponse, authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { fulfillVipAccess, revokeVipAccess } from "../_shared/telegram-vip-fulfillment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

type ContentKind = "morning_brief" | "news_digest" | "watchlist_pattern_update" | "watchlist_pattern" | "market_wrap";

function isContentKind(value: unknown): value is ContentKind {
  return ["morning_brief", "news_digest", "watchlist_pattern_update", "watchlist_pattern", "market_wrap"].includes(String(value));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const telegramSecretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (telegramSecretHeader !== null) {
    const configuredSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (!configuredSecret || telegramSecretHeader !== configuredSecret) return new Response(JSON.stringify({ error: "invalid_telegram_webhook_secret" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const update = await req.json().catch(() => null) as { message?: { text?: string; from?: { id?: number; username?: string; first_name?: string; last_name?: string } } } | null;
    const message = update?.message, match = message?.text?.match(/^\/start\s+([a-f0-9]{48})$/i), telegramUserId = message?.from?.id;
    if (!match || !telegramUserId || !Number.isSafeInteger(telegramUserId)) return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const bytes = new TextEncoder().encode(match[1]);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
    const { data: consumed, error: consumeError } = await supabase.rpc("consume_vip_telegram_onboarding", { p_token_hash: digest, p_telegram_user_id: telegramUserId, p_username: message?.from?.username ?? "", p_display_name: [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ") });
    if (consumeError || !consumed) return new Response(JSON.stringify({ error: "onboarding_rejected" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    try {
      const result = await fulfillVipAccess(supabase, consumed.user_id, telegramUserId, consumed.telegram_link_id);
      return new Response(JSON.stringify({ ok: true, state: result.state }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ error: "vip_fulfillment_failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return authJsonResponse(auth, corsHeaders);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "reconcile_vip_access") {
      const { data: links } = await supabase.from("telegram_links").select("id,user_id,telegram_user_id,access_state").eq("product_slug", "crypto_signal_room").not("telegram_user_id", "is", null).limit(50);
      const results = [];
      for (const link of links ?? []) {
        try {
          const { data: entitled } = await supabase.rpc("has_product_entitlement", { p_user_id: link.user_id, p_product_slug: "crypto_signal_room", p_at: new Date().toISOString() });
          results.push({ id: link.id, ...(entitled === true ? await fulfillVipAccess(supabase, link.user_id, Number(link.telegram_user_id), link.id) : await revokeVipAccess(supabase, link.user_id, Number(link.telegram_user_id), link.id)) });
        } catch (error) { results.push({ id: link.id, state: "FAILED", error: String(error instanceof Error ? error.message : error).slice(0, 160) }); }
      }
      return new Response(JSON.stringify({ success: true, bounded: true, processed: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const requestedKind = isContentKind(body.kind) ? body.kind : "morning_brief";
    const kind = requestedKind === "watchlist_pattern" ? "watchlist_pattern_update" : requestedKind;
    const output = await generateIntelligence(supabase, kind);
    await storeIntelligenceEvent(supabase, output);

    // Do not publish degraded, source-unverified or empty market intelligence as a briefing.
    // A persisted partial/failed output remains available for admin investigation.
    if (output.status !== "generated" || !output.summary?.trim() || !output.data_sources || Object.keys(output.data_sources).length === 0) {
      return new Response(JSON.stringify({ success: false, state: "EDITORIAL_HELD_FOR_REVIEW", event_id: output.event_id, kind, reason: "INTELLIGENCE_EVIDENCE_INSUFFICIENT" }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const deliveries = await routeTelegramEvent(supabase, {
      event_id: output.event_id,
      event_type: output.event_type,
      text: output.summary,
      source: "telegram-orchestrator",
      channels: ["free", "vip"],
      dedupe: false,
    });

    return new Response(JSON.stringify({ success: true, event_id: output.event_id, kind, output, deliveries }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    await routeTelegramEvent(supabase, {
      event_id: `telegram-orchestrator-error:${Date.now()}`,
      event_type: "admin_intelligence_engine_failure",
      text: `HashiBot intelligence delivery failure\nData source: unavailable\nFreshness: ${new Date().toISOString()}\nError: ${error}`,
      source: "telegram-orchestrator",
      channels: ["admin"],
      dedupe: false,
    });
    return new Response(JSON.stringify({ success: false, error }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
