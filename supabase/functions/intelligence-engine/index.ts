import {dueIntelligenceKinds} from "../_shared/intelligence-schedule.ts";
import {deliverIntelligenceOutput} from "../_shared/intelligence-delivery.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateIntelligence,generateForexIntelligence, storeIntelligenceEvent } from "../_shared/intelligence-engine.ts";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { authJsonResponse, authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

type ContentKind = "morning_brief" | "news_digest" | "watchlist_pattern_update" | "market_wrap";

function isContentKind(value: unknown): value is ContentKind {
  return ["morning_brief", "news_digest", "watchlist_pattern_update", "market_wrap"].includes(String(value));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return authJsonResponse(auth, corsHeaders);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "scheduled") {
      const results=[];
      for(const kind of dueIntelligenceKinds()) for(const market of ['crypto','forex'] as const){
        const output=market==='forex'?await generateForexIntelligence(supabase,kind):await generateIntelligence(supabase,kind);await storeIntelligenceEvent(supabase,output);
        results.push({kind,market,...await deliverIntelligenceOutput(output,{route:event=>routeTelegramEvent(supabase,event)})});
      }
      return new Response(JSON.stringify({success:true,timezone:"Africa/Nairobi",results}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
    }
    const kind = isContentKind(body.kind) ? body.kind : "morning_brief";
    const output = body.market==='forex'?await generateForexIntelligence(supabase,kind):await generateIntelligence(supabase, kind);
    await storeIntelligenceEvent(supabase, output);
    const delivery = await deliverIntelligenceOutput(output,{route:event=>routeTelegramEvent(supabase,event)});
    return new Response(JSON.stringify({ success: true, output, ...delivery }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    await routeTelegramEvent(supabase, {
      event_id: `intelligence-engine-failure:${Date.now()}`,
      event_type: "admin_intelligence_engine_failure",
      text: `HashiBot Intelligence Engine failure\nData source: unavailable\nFreshness: ${new Date().toISOString()}\nError: ${error}`,
      source: "intelligence-engine",
      channels: ["admin"],
      dedupe: false,
    });
    return new Response(JSON.stringify({ success: false, error }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
