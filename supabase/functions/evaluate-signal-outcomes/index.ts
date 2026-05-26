import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };

const terminal = new Set(["tp2_hit", "sl_hit", "expired", "cancelled"]);

function toTDSymbol(symbol: string): string { return symbol.includes("/") ? symbol : symbol.length === 6 ? `${symbol.slice(0,3)}/${symbol.slice(3)}` : symbol; }

async function latestPrice(symbol: string, market: string): Promise<number | null> {
  try {
    if (market === "crypto") {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) return null; const j = await r.json() as { price: string }; return Number(j.price);
    }
    const provider = Deno.env.get("FOREX_DATA_PROVIDER") ?? "demo";
    if (provider !== "twelvedata") return null;
    const key = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
    if (!key) return null;
    const r = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(toTDSymbol(symbol))}&apikey=${key}`, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null; const j = await r.json() as { price?: string }; return j.price ? Number(j.price) : null;
  } catch { return null; }
}

function nextStatus(sig: any, price: number): string {
  const dir = sig.direction;
  if (dir === "buy") {
    if (price <= sig.stop_loss) return "sl_hit";
    if (price >= sig.tp2) return "tp2_hit";
    if (price >= sig.tp1) return "tp1_hit";
    if (sig.status === "waiting" && price >= sig.entry_low && price <= sig.entry_high) return "active";
    return sig.status;
  }
  if (price >= sig.stop_loss) return "sl_hit";
  if (price <= sig.tp2) return "tp2_hit";
  if (price <= sig.tp1) return "tp1_hit";
  if (sig.status === "waiting" && price <= sig.entry_high && price >= sig.entry_low) return "active";
  return sig.status;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: signals } = await supabase.from("signals").select("*").in("status", ["waiting", "active", "tp1_hit"]);
    const expiryMins = 360;
    const out = { scanned: 0, changed: 0, updates: [] as any[] };

    for (const sig of (signals ?? [])) {
      out.scanned++;
      if (terminal.has(sig.status)) continue;
      const ageMins = (Date.now() - new Date(sig.created_at).getTime()) / 60000;
      let ns = sig.status;
      let price: number | null = await latestPrice(sig.symbol, sig.market_type);
      let reason = "";
      if ((sig.status === "waiting" || sig.status === "active") && ageMins > expiryMins) { ns = "expired"; reason = "max_age_expired"; }
      else if (price !== null) { ns = nextStatus(sig, price); reason = ns === sig.status ? "no_change" : "price_trigger"; }
      if (ns === sig.status) continue;

      const { data: exists } = await supabase.from("signal_updates").select("id").eq("signal_id", sig.id).eq("new_status", ns).maybeSingle();
      if (exists) continue;

      await supabase.from("signals").update({ status: ns, updated_at: new Date().toISOString() }).eq("id", sig.id);
      await supabase.from("signal_updates").insert({ signal_id: sig.id, previous_status: sig.status, new_status: ns, price, reason, created_at: new Date().toISOString() });
      out.changed++;
      out.updates.push({ signal_id: sig.id, from: sig.status, to: ns, price });
    }

    return new Response(JSON.stringify({ success: true, ...out }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
