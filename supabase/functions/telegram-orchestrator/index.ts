import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateIntelligence, storeIntelligenceEvent } from "../_shared/intelligence-engine.ts";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret",
};

type ContentKind = "morning_brief" | "news_digest" | "watchlist_pattern_update" | "market_wrap";

function isContentKind(value: unknown): value is ContentKind {
  return ["morning_brief", "news_digest", "watchlist_pattern_update", "market_wrap"].includes(String(value));
}

async function authorize(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const cronSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? "";
  if (cronSecret && req.headers.get("x-scanner-cron-secret") === cronSecret) return true;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (token && token === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return true;
  if (!token) return false;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return (profile as { role?: string } | null)?.role === "admin";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  if (!(await authorize(req, supabase))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const kind = isContentKind(body.kind) ? body.kind : "morning_brief";
    const output = await generateIntelligence(supabase, kind);
    await storeIntelligenceEvent(supabase, output);

    const deliveries = await routeTelegramEvent(supabase, {
      event_id: output.event_id,
      event_type: output.event_type,
      text: output.summary,
      source: "telegram-orchestrator",
      channels: ["admin", "free", "vip"],
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
