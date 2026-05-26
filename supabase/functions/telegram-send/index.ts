import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function formatSignalMessage(signal: Record<string, unknown>): string {
  const gradeEmoji = signal.grade === "A+" ? "⭐⭐⭐" : signal.grade === "A" ? "⭐⭐" : "⭐";
  const dirEmoji = signal.direction === "buy" ? "🟢 BUY" : "🔴 SELL";
  const entryRange = signal.entry_low && signal.entry_high
    ? `${Number(signal.entry_low).toFixed(5)} – ${Number(signal.entry_high).toFixed(5)}`
    : String(signal.entry_high ?? "N/A");

  return [
    `🤖 *HASHIBOT ${signal.grade} SIGNAL* ${gradeEmoji}`,
    ``,
    `*Symbol:* ${signal.symbol}`,
    `*Market:* ${String(signal.market_type).toUpperCase()}`,
    `*Timeframe:* ${signal.timeframe}`,
    `*Direction:* ${dirEmoji}`,
    `*Entry:* ${entryRange}`,
    `*Stop Loss:* ${Number(signal.stop_loss).toFixed(5)}`,
    `*TP1:* ${Number(signal.tp1).toFixed(5)}`,
    `*TP2:* ${Number(signal.tp2).toFixed(5)}`,
    signal.tp3 ? `*TP3:* ${Number(signal.tp3).toFixed(5)}` : null,
    `*Risk/Reward:* ${Number(signal.risk_reward).toFixed(2)}R`,
    `*Strategy:* ${signal.strategy_name}`,
    `*Regime:* ${signal.regime}`,
    `*Confidence:* ${signal.confidence_score}%`,
    `*Reason:* ${signal.reason}`,
    `*Invalidation:* ${signal.invalidation}`,
    `*Status:* ${String(signal.status).toUpperCase()}`,
    ``,
    `_HashiBot Trading Intelligence_`,
  ].filter(Boolean).join("\n");
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { signal_id, chat_id, delivery_type = "signal" } = body as {
      signal_id: string;
      chat_id?: string;
      delivery_type?: string;
    };

    if (!signal_id) {
      return new Response(JSON.stringify({ error: "signal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const defaultChatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID");
    const targetChatId = chat_id || defaultChatId;

    if (!botToken || !targetChatId) {
      // Log as not configured
      await supabase.from("telegram_deliveries").insert({
        signal_id,
        delivery_type,
        chat_id: targetChatId ?? "not_configured",
        status: "failed",
        error_message: !botToken ? "TELEGRAM_BOT_TOKEN not configured" : "TELEGRAM_DEFAULT_CHANNEL_ID not configured",
      });

      return new Response(
        JSON.stringify({ error: "Telegram not configured", details: !botToken ? "Missing BOT_TOKEN" : "Missing CHANNEL_ID" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingSent } = await supabase.from("telegram_deliveries")
      .select("id, created_at")
      .eq("signal_id", signal_id)
      .eq("delivery_type", delivery_type)
      .eq("status", "sent")
      .maybeSingle();
    if (existingSent) {
      await supabase.from("telegram_deliveries").insert({
        signal_id, delivery_type, chat_id: targetChatId, status: "failed",
        error_message: `duplicate_blocked_existing_sent:${existingSent.id}`,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "duplicate_already_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch signal
    const { data: signal, error: sigErr } = await supabase
      .from("signals")
      .select("*")
      .eq("id", signal_id)
      .maybeSingle();

    if (sigErr || !signal) {
      return new Response(JSON.stringify({ error: "Signal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = formatSignalMessage(signal as Record<string, unknown>);

    // Send to Telegram
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgRes.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (tgData.ok) {
      const msgId = String(tgData.result?.message_id ?? "");
      await supabase.from("telegram_deliveries").insert({
        signal_id,
        delivery_type,
        chat_id: targetChatId,
        status: "sent",
        telegram_message_id: msgId,
        error_message: "",
      });

      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "telegram_signal_sent",
        entity_type: "signal",
        entity_id: signal_id,
        metadata: { chat_id: targetChatId, telegram_message_id: msgId },
      });

      return new Response(
        JSON.stringify({ success: true, telegram_message_id: msgId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errMsg = tgData.description ?? "Telegram API error";
      await supabase.from("telegram_deliveries").insert({
        signal_id,
        delivery_type,
        chat_id: targetChatId,
        status: "failed",
        error_message: errMsg,
      });

      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
