import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: cfg } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();

    if (!cfg?.is_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "scanner_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!cfg?.schedule_enabled) {
      await supabase.from("scanner_config").update({ heartbeat_status: "inactive", heartbeat_updated_at: new Date().toISOString() }).eq("id", 1);
      return new Response(JSON.stringify({ skipped: true, reason: "schedule_disabled", heartbeat_status: "inactive" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/market-scanner`;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const proxy = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${srk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ run_type_override: "scheduled", scheduled_invocation: true }),
    });
    const txt = await proxy.text();
    if (!proxy.ok) {
      return new Response(JSON.stringify({
        success: false,
        wrapper: "scheduled-market-scanner",
        proxied_status: proxy.status,
        proxied_body: txt,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(txt, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
