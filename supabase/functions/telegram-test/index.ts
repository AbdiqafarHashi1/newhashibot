import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { vipChatId } from "../_shared/telegram-registry.ts";
import { authJsonResponse, authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

type SupabaseClient = ReturnType<typeof createClient>;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


function eatTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, year: "numeric", month: "short", day: "2-digit" }).format(date);
}

function shortText(value: unknown, max = 250): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function countRows(supabase: SupabaseClient, table: string, fromIso?: string, column = "created_at"): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (fromIso) query = query.gte(column, fromIso);
  const { count } = await query;
  return count ?? 0;
}

async function sendAdminDigest(supabase: SupabaseClient, testMode: boolean) {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [scannerRuns, signals, telegramFailures, intelligence, executions, settingsResult, optionalFeeds] = await Promise.all([
    countRows(supabase, "scanner_runs", since),
    countRows(supabase, "signals", since),
    supabase.from("telegram_deliveries").select("id", { count: "exact", head: true }).in("delivery_status", ["failed", "skipped"]).gte("created_at", since),
    countRows(supabase, "intelligence_events", since),
    supabase.from("execution_orders").select("id,status,protection_status", { count: "exact" }).order("created_at", { ascending: false }).limit(100),
    supabase.from("execution_settings").select("latest_monitor_status,latest_monitor_run_at,latest_account_state_at,latest_monitor_result,open_binance_positions,open_binance_orders").eq("id", 1).maybeSingle(),
    supabase.from("provider_status").select("provider_name,status,error_message").in("provider_name", ["NEWS_API_URL", "LIQUIDATIONS_API_URL", "STABLECOIN_FLOW_API_URL", "news", "liquidations", "stablecoin_flow"]).limit(20),
  ]);
  const executionRows = (executions.data ?? []) as Array<Record<string, unknown>>;
  const openExecutions = executionRows.filter((row) => !["closed_tp", "closed_tp2", "closed_profit_lock", "closed_sl", "closed_timeout", "closed_expired", "closed_manual", "cancelled", "failed", "skipped", "stale_closed"].includes(String(row.status)));
  const degraded = executionRows.filter((row) => ["protection_degraded", "unprotected_failed", "protection_failed"].includes(String(row.protection_status))).length;
  const monitor = (settingsResult.data ?? {}) as Record<string, unknown>;
  const result = (monitor.latest_monitor_result ?? {}) as Record<string, unknown>;
  const reconciliation = (result.reconciliation_summary ?? {}) as Record<string, unknown>;
  const text = [
    `${testMode ? "🧪 TEST " : ""}HashiBot Operator Digest`,
    `Window: 24h ending ${eatTimestamp()}`,
    `Scanner runs: ${scannerRuns}`,
    `Signals generated: ${signals}`,
    `Open execution rows: ${openExecutions.length}`,
    `Protection degraded/unprotected rows: ${degraded}`,
    `Binance monitor: ${monitor.latest_monitor_status ?? "unknown"} run=${monitor.latest_monitor_run_at ?? "—"} account=${monitor.latest_account_state_at ?? "—"}`,
    `Open Binance positions/orders: ${Array.isArray(monitor.open_binance_positions) ? monitor.open_binance_positions.length : 0}/${Array.isArray(monitor.open_binance_orders) ? monitor.open_binance_orders.length : 0}`,
    `Reconciliation: symbols=${reconciliation.symbols_checked ?? 0} stale/orphan=${reconciliation.stale_or_orphan_order_count ?? 0} duplicate=${reconciliation.duplicate_conditional_count ?? 0} unprotected=${reconciliation.unprotected_position_count ?? 0}`,
    `Telegram failed/skipped: ${telegramFailures.count ?? 0}`,
    `Intelligence events: ${intelligence}`,
    `Optional unavailable feeds (digest warning only): ${((optionalFeeds.data ?? []) as Array<Record<string, unknown>>).map((feed) => `${feed.provider_name ?? "provider"}=${feed.status ?? "unknown"}`).join(", ") || "None"}`,
  ].join("\n");
  const deliveries = await routeTelegramEvent(supabase, {
    event_id: `admin_operator_digest:${testMode ? "test:" : ""}${new Date().toISOString().slice(0, 13)}`,
    event_type: testMode ? "admin_operator_digest_test" : "admin_operator_digest",
    text,
    source: "telegram-test",
    channels: ["admin"],
    dedupe: !testMode,
  });
  return { success: deliveries.some((delivery) => delivery.status === "sent"), deliveries, digest: { scannerRuns, signals, openExecutions: openExecutions.length, degraded, reconciliation } };
}

async function sendFreeSelectedSignal(supabase: SupabaseClient, testMode: boolean) {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase.from("telegram_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("destination_channel", "free")
    .eq("delivery_type", "free_selected_signal")
    .eq("delivery_status", "sent")
    .gte("created_at", dayStart.toISOString());
  if ((sentToday ?? 0) >= 2 && !testMode) return { success: true, sent: false, reason: "daily_cap_reached", sent_today: sentToday ?? 0 };
  const { data: signals } = await supabase.from("signals")
    .select("*")
    .in("grade", ["A+", "A"])
    .order("score", { ascending: false })
    .order("confidence", { ascending: false })
    .order("rr", { ascending: false })
    .limit(10);
  const candidates = ((signals ?? []) as Array<Record<string, unknown>>).filter((signal) => String(signal.status ?? signal.lifecycle_state ?? "approved").toLowerCase() !== "closed");
  const selected = candidates[0];
  if (!selected && !testMode) return { success: true, sent: false, reason: "no_qualifying_a_signal" };
  const signalId = String(selected?.id ?? `test-free-selected-${Date.now()}`);
  const symbol = String(selected?.symbol ?? "BTCUSDT");
  const text = testMode && !selected
    ? `🧪 HashiBot Free Selected Signal Test\nSymbol: ${symbol}\nReason: router/dedupe/daily-cap proof only; no lifecycle/TP/SL spam.`
    : [`HashiBot Free Selected Signal`, `Symbol: ${symbol}`, `Grade: ${selected?.grade ?? "A"}`, `Score: ${selected?.score ?? "—"}`, `Confidence: ${selected?.confidence ?? "—"}`, `RR: ${selected?.rr ?? selected?.risk_reward ?? "—"}`, "Lifecycle updates remain VIP-only."].join("\n");
  const deliveries = await routeTelegramEvent(supabase, {
    event_id: `free_selected_signal:${signalId}:${dayStart.toISOString().slice(0, 10)}`,
    event_type: "free_selected_signal",
    signal_id: selected ? signalId : null,
    text,
    source: "telegram-test",
    channels: ["free"],
    dedupe: !testMode,
  });
  return { success: deliveries.some((delivery) => ["sent", "skipped"].includes(delivery.status)), sent: deliveries.some((delivery) => delivery.status === "sent"), selected_signal_id: signalId, sent_today: sentToday ?? 0, deliveries };
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

    const auth = await authorizeInternalOrAdmin(req, supabase);
    if (!auth.ok) return authJsonResponse(auth, corsHeaders);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "vip_test");
    if (action === "admin_alert") {
      const deliveries = await routeTelegramEvent(supabase, { event_id: `admin_test_alert:${Date.now()}`, event_type: "admin_test_error_alert", text: [`🧪 HashiBot Admin Test Alert`, `Status: HEALTHY`, `Time: ${eatTimestamp()}`, "", "Summary:", "• Critical errors: 0", "• Unsafe positions: 0", "• Open positions: 0", "• Open orders: 0", "• Protected positions: 0", "• Duplicate conditionals: 0", "• Stale/orphan orders: 0", "• Cleanup cancelled: 0", "", "Latest Error:", shortText("None"), "", "Operator Note:", "Full reconciliation is stored in Execution UI / DB logs."].join("\n"), source: "telegram-test", channels: ["admin"], dedupe: false });
      return json({ success: deliveries.some((delivery) => delivery.status === "sent"), deliveries });
    }
    if (action === "admin_digest") return json(await sendAdminDigest(supabase, true));
    if (action === "free_selected_signal") return json(await sendFreeSelectedSignal(supabase, true));

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
        actor_user_id: null,
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
