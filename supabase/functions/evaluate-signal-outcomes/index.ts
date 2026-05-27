import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TERMINAL = new Set(["tp2_hit", "sl_hit", "expired", "cancelled"]);
const EXPIRY_MINS = 360;

// ─── Price fetchers ───────────────────────────────────────────────────────────

async function binancePrice(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = await r.json() as { price: string };
    return Number(j.price);
  } catch { return null; }
}

async function finnhubForexPrice(symbol: string): Promise<number | null> {
  const key = Deno.env.get("FINNHUB_API_KEY") ?? "";
  if (!key) return null;
  try {
    // Use forex/quote endpoint for current bid/ask
    const r = await fetch(`https://finnhub.io/api/v1/forex/candle?symbol=OANDA:${symbol}&resolution=1&count=2&token=${key}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json() as { s?: string; c?: number[] };
    if (j?.s === "ok" && Array.isArray(j?.c) && j.c.length > 0) {
      return Number(j.c[j.c.length - 1]);
    }
    return null;
  } catch { return null; }
}

async function twelvedataForexPrice(symbol: string): Promise<number | null> {
  const key = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
  if (!key) return null;
  const tdSymbol = symbol.length === 6 ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol;
  try {
    const r = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(tdSymbol)}&apikey=${key}`, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = await r.json() as { price?: string };
    return j.price ? Number(j.price) : null;
  } catch { return null; }
}

async function latestPrice(symbol: string, market: string): Promise<number | null> {
  if (market === "crypto") return binancePrice(symbol);

  const provider = (Deno.env.get("FOREX_DATA_PROVIDER") ?? "demo").trim().toLowerCase();
  if (provider === "finnhub") return finnhubForexPrice(symbol);
  if (provider === "twelvedata") return twelvedataForexPrice(symbol);
  // Try finnhub then twelvedata as fallback for outcome checking
  const finnhub = await finnhubForexPrice(symbol);
  if (finnhub !== null) return finnhub;
  return twelvedataForexPrice(symbol);
}

// ─── Status logic ─────────────────────────────────────────────────────────────

function nextStatus(sig: Record<string, unknown>, price: number): string {
  const dir = sig.direction as string;
  const sl = Number(sig.stop_loss);
  const tp1 = Number(sig.tp1);
  const tp2 = Number(sig.tp2);
  const entryLow = Number(sig.entry_low);
  const entryHigh = Number(sig.entry_high);
  const status = sig.status as string;

  if (dir === "buy") {
    if (price <= sl) return "sl_hit";
    if (price >= tp2) return "tp2_hit";
    if (price >= tp1) return "tp1_hit";
    if (status === "waiting" && price >= entryLow) return "active";
    return status;
  } else {
    // sell
    if (price >= sl) return "sl_hit";
    if (price <= tp2) return "tp2_hit";
    if (price <= tp1) return "tp1_hit";
    if (status === "waiting" && price <= entryHigh) return "active";
    return status;
  }
}

// ─── Telegram outcome notification ───────────────────────────────────────────

async function sendOutcomeNotification(
  supabase: ReturnType<typeof createClient>,
  sig: Record<string, unknown>,
  newStatus: string,
  price: number,
): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID");
  if (!botToken || !chatId) return;

  const statusLabels: Record<string, string> = {
    tp1_hit: "TP1 HIT",
    tp2_hit: "TP2 HIT",
    sl_hit: "STOP LOSS HIT",
    expired: "SIGNAL EXPIRED",
  };
  const label = statusLabels[newStatus];
  if (!label) return;

  const dirEmoji = sig.direction === "buy" ? "🟢" : "🔴";
  const outcomeEmoji = newStatus === "sl_hit" ? "🛑" : newStatus === "expired" ? "⏱️" : "✅";
  const text = [
    `${outcomeEmoji} *HASHIBOT SIGNAL UPDATE*`,
    ``,
    `*${label}*`,
    ``,
    `*Symbol:* ${sig.symbol}`,
    `*Direction:* ${dirEmoji} ${String(sig.direction).toUpperCase()}`,
    `*Status:* ${newStatus.replace(/_/g, " ").toUpperCase()}`,
    `*Current Price:* ${price.toFixed(5)}`,
    `*TP1:* ${Number(sig.tp1).toFixed(5)}`,
    `*TP2:* ${Number(sig.tp2).toFixed(5)}`,
    `*Stop Loss:* ${Number(sig.stop_loss).toFixed(5)}`,
    ``,
    `_HashiBot Trading Intelligence_`,
  ].join("\n");

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    const tgData = await res.json() as { ok: boolean };
    if (tgData.ok) {
      // Mark the signal_update as telegram sent
      await supabase.from("telegram_deliveries").insert({
        signal_id: sig.id as string,
        delivery_type: "outcome_update",
        chat_id: chatId,
        status: "sent",
        error_message: "",
      });
    }
  } catch { /* non-fatal */ }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Auth: accept service role (for cron), admin token, or any authenticated user for manual trigger
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceInvocation = token === serviceRole;

    if (!isServiceInvocation) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: signals } = await supabase
      .from("signals")
      .select("*")
      .in("status", ["waiting", "active", "tp1_hit"]);

    const out = {
      scanned: 0,
      changed: 0,
      expired: 0,
      price_unavailable: 0,
      updates: [] as Array<{ signal_id: string; symbol: string; from: string; to: string; price: number | null }>,
    };

    for (const sig of (signals ?? [])) {
      out.scanned++;
      if (TERMINAL.has(sig.status)) continue;

      const ageMins = (Date.now() - new Date(sig.created_at).getTime()) / 60000;
      let ns = sig.status;
      let price: number | null = null;
      let reason = "no_change";

      if ((sig.status === "waiting" || sig.status === "active") && ageMins > EXPIRY_MINS) {
        ns = "expired";
        reason = "max_age_expired";
        out.expired++;
      } else {
        price = await latestPrice(sig.symbol, sig.market_type);
        if (price !== null) {
          ns = nextStatus(sig as Record<string, unknown>, price);
          reason = ns === sig.status ? "no_change" : "price_trigger";
        } else {
          out.price_unavailable++;
          continue;
        }
      }

      if (ns === sig.status) continue;

      // Idempotency: skip if this exact transition was already recorded
      const { data: existing } = await supabase
        .from("signal_updates")
        .select("id")
        .eq("signal_id", sig.id)
        .eq("new_status", ns)
        .maybeSingle();
      if (existing) continue;

      // Write the status update
      await supabase.from("signals").update({ status: ns, updated_at: new Date().toISOString() }).eq("id", sig.id);
      await supabase.from("signal_updates").insert({
        signal_id: sig.id,
        previous_status: sig.status,
        old_status: sig.status,
        new_status: ns,
        price,
        reason,
        created_at: new Date().toISOString(),
      });

      out.changed++;
      out.updates.push({ signal_id: sig.id, symbol: sig.symbol, from: sig.status, to: ns, price });

      // Send Telegram outcome notification (idempotent via telegram_deliveries check)
      if (["tp1_hit", "tp2_hit", "sl_hit", "expired"].includes(ns) && price !== null) {
        await sendOutcomeNotification(supabase, sig as Record<string, unknown>, ns, price);
      }
    }

    return new Response(JSON.stringify({ success: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
