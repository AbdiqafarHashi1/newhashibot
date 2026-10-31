import {intelligencePublication} from "../_shared/intelligence-publication.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateIntelligence, storeIntelligenceEvent } from "../_shared/intelligence-engine.ts";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { authJsonResponse, authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";


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
  // Preserve an existing webhook URL while converging on the canonical membership handler.
  if (req.headers.has("X-Telegram-Bot-Api-Secret-Token")) {
    const configured = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (!configured || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== configured) return new Response(JSON.stringify({error:"invalid_telegram_webhook_secret"}),{status:401,headers:{"Content-Type":"application/json"}});
    try { return await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-membership`, {method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":configured},body:await req.text(),signal:AbortSignal.timeout(15000)}); }
    catch { return new Response(JSON.stringify({error:"membership_handler_unavailable"}),{status:503}); }
  }
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return authJsonResponse(auth, corsHeaders);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "reconcile_vip_access") {
      const {error} = await supabase.rpc("reconcile_release1_vip_memberships");
      return new Response(JSON.stringify(error?{success:false,error:"membership_sweep_failed"}:{success:true,state:"CANONICAL_FULFILLMENT_QUEUED"}),{status:error?503:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
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

    const deliveries = [];
    for (const audience of ["free", "vip"] as const) {
      const editorial = intelligencePublication(output, audience);
      deliveries.push(...await routeTelegramEvent(supabase, {event_id:editorial.content_id,event_type:output.event_type,source:"intelligence-engine",channels:[audience],editorial,dedupe:true}));
    }

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
