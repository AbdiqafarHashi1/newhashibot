import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Outcome evaluation helpers ───────────────────────────────────────────────
// TODO (Phase 3): Wire a real price feed to auto-update signal statuses.
//
// Required price feeds:
//   - Crypto: Binance REST /api/v3/ticker/price (free, no key)
//   - Forex:  FOREX_DATA_PROVIDER / FOREX_DATA_API_KEY (same as scanner)
//
// Logic per signal:
//   if currentPrice <= stop_loss  → status = "sl_hit"
//   if currentPrice >= tp1        → status = "tp1_hit"  (for buy)
//   if currentPrice >= tp2        → status = "tp2_hit"  (for buy)
//   Mirror for sell signals.
//
// This function is a STUB. It returns a plan but does not modify signals yet.

interface SignalEvalResult {
  signal_id: string;
  symbol: string;
  direction: string;
  current_price: number | null;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  would_be_status: string;
  note: string;
}

async function fetchLatestPrice(symbol: string, market_type: string): Promise<number | null> {
  if (market_type === "crypto") {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const data = await res.json() as { price: string };
      return parseFloat(data.price);
    } catch {
      return null;
    }
  }
  // TODO: wire forex price feed here
  return null;
}

function evaluateOutcome(signal: {
  direction: string;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  status: string;
}, price: number): string {
  const { direction, stop_loss, tp1, tp2 } = signal;

  if (direction === "buy") {
    if (price <= stop_loss) return "sl_hit";
    if (price >= tp2) return "tp2_hit";
    if (price >= tp1) return "tp1_hit";
    if (price >= signal.entry_low) return "active";
    return "waiting";
  } else {
    if (price >= stop_loss) return "sl_hit";
    if (price <= tp2) return "tp2_hit";
    if (price <= tp1) return "tp1_hit";
    if (price <= signal.entry_high) return "active";
    return "waiting";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STUB: return evaluation preview without writing any changes
    const { data: signals } = await supabase
      .from("signals")
      .select("id, symbol, market_type, direction, entry_low, entry_high, stop_loss, tp1, tp2, status")
      .in("status", ["waiting", "active"]);

    if (!signals || signals.length === 0) {
      return new Response(JSON.stringify({
        stub: true,
        message: "Outcome tracking is not active. This is a preview-only stub.",
        active_signals: 0,
        results: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: SignalEvalResult[] = [];

    for (const sig of signals) {
      const price = await fetchLatestPrice(sig.symbol, sig.market_type);
      const wouldBe = price !== null
        ? evaluateOutcome(sig, price)
        : "price_unavailable";

      results.push({
        signal_id: sig.id,
        symbol: sig.symbol,
        direction: sig.direction,
        current_price: price,
        entry_low: sig.entry_low,
        entry_high: sig.entry_high,
        stop_loss: sig.stop_loss,
        tp1: sig.tp1,
        tp2: sig.tp2,
        would_be_status: wouldBe,
        note: price === null
          ? "Price unavailable — forex outcome tracking requires a real provider"
          : wouldBe !== sig.status
            ? `Status would change from '${sig.status}' to '${wouldBe}'`
            : "No change",
      });
    }

    return new Response(JSON.stringify({
      stub: true,
      message: "STUB: Outcome tracking is not active. Signals are NOT automatically updated. This preview shows what would happen if tracking were live.",
      active_signals: signals.length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
