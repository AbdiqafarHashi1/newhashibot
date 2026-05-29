import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID");

    const config = {
      bot_token_configured: !!botToken,
      chat_id_configured: !!chatId,
    };

    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, config, error: "TELEGRAM_BOT_TOKEN is not configured" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!chatId) {
      return new Response(
        JSON.stringify({ success: false, config, error: "TELEGRAM_DEFAULT_CHANNEL_ID is not configured" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = `🧪 HashiBot Telegram Connection Test\n\nTimestamp: ${new Date().toISOString()}\nStatus: Connection verified\n\nThis is an automated test from the HashiBot operator panel. No action required.`;

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    const tgData = await tgRes.json() as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (tgData.ok) {
      const msgId = String(tgData.result?.message_id ?? "");

      await supabase.from("telegram_deliveries").insert({
        signal_id: null,
        delivery_type: "test",
        chat_id: chatId,
        status: "sent",
        telegram_message_id: msgId,
        error_message: "",
      });

      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "telegram_test_sent",
        entity_type: "telegram",
        entity_id: "test",
        metadata: { telegram_message_id: msgId, chat_id: chatId },
      });

      return new Response(
        JSON.stringify({ success: true, config, telegram_message_id: msgId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errMsg = tgData.description ?? "Telegram API returned an error";

      await supabase.from("telegram_deliveries").insert({
        signal_id: null,
        delivery_type: "test",
        chat_id: chatId,
        status: "failed",
        error_message: errMsg,
      });

      return new Response(
        JSON.stringify({ success: false, config, error: errMsg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
