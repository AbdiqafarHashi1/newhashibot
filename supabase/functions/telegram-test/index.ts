import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { routeTelegramEvent, vipChatId } from "../_shared/telegram-router.ts";

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
    const chatId = vipChatId();

    const config = {
      bot_token_configured: !!botToken,
      vip_chat_id_configured: !!chatId,
      admin_chat_id_configured: !!Deno.env.get("TELEGRAM_ADMIN_CHAT_ID"),
      free_chat_id_configured: !!Deno.env.get("TELEGRAM_FREE_CHAT_ID"),
    };

    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, config, error: "TELEGRAM_BOT_TOKEN is not configured" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!chatId) {
      return new Response(
        JSON.stringify({ success: false, config, error: "TELEGRAM_CHAT_ID is not configured" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = `🧪 *HashiBot Telegram Router Test*

Timestamp: ${new Date().toISOString()}
Channel: VIP SIGNAL ROOM
Status: Router connection verified

_This is an automated test from the HashiBot operator panel. No action required._`;

    const [delivery] = await routeTelegramEvent(supabase, {
      event_id: `telegram-test:${Date.now()}`,
      event_type: "test",
      text,
      source: "telegram-test",
      channels: ["vip"],
      parse_mode: "Markdown",
      dedupe: false,
    });

    if (delivery?.status === "sent") {
      await supabase.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "telegram_test_sent",
        entity_type: "telegram",
        entity_id: "test",
        metadata: { telegram_message_id: delivery.telegram_message_id, chat_id: delivery.chat_id, channel: delivery.channel },
      });

      return new Response(
        JSON.stringify({ success: true, config, telegram_message_id: delivery.telegram_message_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errMsg = delivery?.error_message ?? "Telegram delivery failed";
    return new Response(
      JSON.stringify({ success: false, config, error: errMsg }),
      { status: delivery?.status === "skipped" ? 422 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
