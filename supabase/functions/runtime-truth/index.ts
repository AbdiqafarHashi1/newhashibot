import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Cache-Control",
  "Cache-Control": "no-store, max-age=0",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return jsonResponse({ success: false, error: "SUPABASE_URL/SERVICE_ROLE missing" }, 500);
  const supabase = createClient(supabaseUrl, serviceRole, { global: { headers: { "Cache-Control": "no-store" } } });
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

  const { data, error } = await supabase.rpc("runtime_truth_function");
  if (error) return jsonResponse({ success: false, error: error.message, source: "runtime_truth_function" }, 500);
  const truth = Array.isArray(data) ? data[0] : data;
  return jsonResponse({ success: true, truth, fetched_at: new Date().toISOString(), cache: "bypassed" });
});
