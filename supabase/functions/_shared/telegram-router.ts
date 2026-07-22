import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

type TelegramChannel = "admin" | "free" | "vip";
type DeliveryStatus = "sent" | "failed" | "skipped";
type EventSeverity = "low" | "medium" | "high" | "critical";

export interface TelegramRouteEvent {
  event_id?: string | null;
  event_type: string;
  text: string;
  signal_id?: string | null;
  source?: string;
  channels?: TelegramChannel[];
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  disable_web_page_preview?: boolean;
  dedupe?: boolean;
  symbol?: string | null;
  market?: string | null;
  reason?: string;
  severity?: EventSeverity | string;
  confidence?: number;
  data_source?: string;
  freshness?: string;
  channel_target?: TelegramChannel | TelegramChannel[] | "auto";
  cooldown_minutes?: number;
  customer_id?: string;
  execution_provider?: string;
  account_id?: string;
  execution_instance_id?: string;
  credential_ref?: string;
  execution_scope_key?: string;
  metadata?: Record<string, unknown>;
}

export interface TelegramRouteResult {
  channel: TelegramChannel;
  chat_id: string;
  status: DeliveryStatus;
  telegram_message_id?: string;
  error_message?: string;
  delivery_id?: string;
}

export function vipChatId(): string {
  return Deno.env.get("TELEGRAM_CHAT_ID") ?? Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID") ?? "";
}

export function telegramChannelConfig(): Record<TelegramChannel, string> {
  return {
    admin: Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") ?? "",
    free: Deno.env.get("TELEGRAM_FREE_CHAT_ID") ?? "",
    vip: vipChatId(),
  };
}

function uniqueChannels(channels: TelegramChannel[]): TelegramChannel[] {
  return Array.from(new Set(channels));
}

function normalizeTarget(target: TelegramRouteEvent["channel_target"]): TelegramChannel[] | null {
  if (!target || target === "auto") return null;
  return uniqueChannels(Array.isArray(target) ? target : [target]);
}

function isEventIntelligence(type: string): boolean {
  return type.includes("event_intelligence") || type.includes("intelligence_alert") || type.includes("regime_shift") || type.includes("level_break") || type.includes("volatility_expansion") || type.includes("liquidation_cascade") || type.includes("risk_off") || type.includes("risk_on") || type.includes("trend_exhaustion") || type.includes("breakout_watch") || type.includes("liquidity_sweep");
}

function isMajorBroadMarketEvent(event: TelegramRouteEvent, type: string): boolean {
  const severity = String(event.severity ?? "").toLowerCase();
  const market = String(event.market ?? "").toLowerCase();
  const symbol = String(event.symbol ?? "").toUpperCase();
  return severity === "critical"
    || (severity === "high" && (!symbol || symbol === "BTC" || symbol === "BTCUSDT" || symbol === "ETH" || symbol === "ETHUSDT" || ["crypto", "market", "broad_market"].includes(market)))
    || type.includes("major")
    || type.includes("market_wide")
    || type.includes("liquidation_cascade")
    || type.includes("risk_off")
    || type.includes("risk_on")
    || type.includes("btc_major")
    || type.includes("news_shock");
}

export function resolveTelegramChannels(eventType: string, override?: TelegramChannel[], event?: TelegramRouteEvent): TelegramChannel[] {
  if (override?.length) return uniqueChannels(override);
  const explicitTarget = normalizeTarget(event?.channel_target);
  if (explicitTarget?.length) return explicitTarget;

  const type = eventType.toLowerCase();
  if (
    type.startsWith("admin_")
    || type.includes("failure")
    || type.includes("failed")
    || type.includes("watchdog")
    || type.includes("mismatch")
    || type.includes("critical_system")
    || type.includes("critical_error")
    || type.includes("cleanup")
    || type.includes("cron_")
    || type.includes("provider_")
    || type.includes("unprotected")
    || type.includes("protection_degraded")
    || type.includes("stale_monitor")
    || type.includes("execution_rejection")
  ) return ["admin"];
  if (isEventIntelligence(type)) return isMajorBroadMarketEvent(event ?? { event_type: eventType, text: "" }, type) ? ["free", "vip"] : ["vip"];
  if (type.includes("signal_preview") || type.includes("opportunity_teaser") || type.includes("educational") || type.includes("market_update")) return ["free"];
  if (type.includes("signal_created") || type.includes("vip_signal") || type.includes("entry_triggered") || type.includes("tp1_hit") || type.includes("tp2_hit") || type.includes("sl_moved") || type.includes("profit_locked") || type.includes("invalidated") || type.includes("closed")) return ["vip"];
  if (type.includes("morning_brief") || type.includes("market_wrap") || type.includes("news_digest") || type.includes("watchlist") || type.includes("pattern") || type.includes("sentiment") || type.includes("market_analytics")) return ["free", "vip"];
  if (type.includes("highest_confidence_setup") || type.includes("free_selected_signal")) return ["free"];
  return ["vip"];
}

async function insertDelivery(
  supabase: SupabaseClient,
  event: TelegramRouteEvent,
  channel: TelegramChannel,
  chatId: string,
  status: DeliveryStatus,
  errorMessage = "",
  telegramMessageId = "",
  retryCount = 0,
): Promise<string | undefined> {
  const payload = {
    signal_id: event.signal_id ?? null,
    delivery_type: event.event_type,
    chat_id: chatId || "not_configured",
    status,
    telegram_message_id: telegramMessageId,
    error_message: errorMessage,
    event_id: event.event_id ?? event.signal_id ?? crypto.randomUUID(),
    event_type: event.event_type,
    destination_channel: channel,
    destination_chat_id: chatId || "not_configured",
    sent_at: status === "sent" ? new Date().toISOString() : null,
    delivery_status: status,
    retry_count: retryCount,
    customer_id: event.customer_id ?? null,
    execution_provider: event.execution_provider ?? null,
    account_id: event.account_id ?? null,
    execution_instance_id: event.execution_instance_id ?? null,
    credential_ref: event.credential_ref ?? null,
    execution_scope_key: event.execution_scope_key ?? null,
  };
  const { data } = await supabase.from("telegram_deliveries").insert(payload).select("id").maybeSingle();
  return data?.id as string | undefined;
}


function alertDedupeKey(event: TelegramRouteEvent, channel: TelegramChannel): string {
  return [
    channel,
    event.event_type.toLowerCase(),
    String(event.source ?? "runtime").toLowerCase(),
    String(event.symbol ?? event.market ?? "provider").toLowerCase(),
    String(event.reason ?? event.text.split("\n")[0] ?? "").toLowerCase().slice(0, 120),
  ].join(":");
}

async function shouldSuppressOperationalAlert(supabase: SupabaseClient, event: TelegramRouteEvent, channel: TelegramChannel): Promise<{ suppress: boolean; key: string; reason?: string }> {
  const type = event.event_type.toLowerCase();
  const operational = channel === "admin" && (type.includes("failure") || type.includes("failed") || type.includes("provider_") || type.includes("unprotected") || type.includes("watchdog") || type.includes("critical"));
  if (!operational) return { suppress: false, key: "" };
  const key = alertDedupeKey(event, channel);
  const cooldownMinutes = eventCooldownMinutes(event);
  const sinceIso = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();
  try {
    const { data: existing } = await supabase.from("telegram_alert_dedupe").select("dedupe_key,last_sent_at,suppressed_count").eq("dedupe_key", key).maybeSingle();
    if (existing?.last_sent_at && String(existing.last_sent_at) > sinceIso) {
      await supabase.from("telegram_alert_dedupe").upsert({ dedupe_key: key, event_type: event.event_type, provider: event.source ?? null, symbol: event.symbol ?? null, last_seen: new Date().toISOString(), suppressed_count: Number(existing.suppressed_count ?? 0) + 1, metadata: { latest_text: event.text.slice(0, 500) } }, { onConflict: "dedupe_key" });
      await supabase.from("telegram_alert_digest").insert({ digest_key: key, provider: event.source ?? null, symbol: event.symbol ?? null, event_type: event.event_type, latest_error: event.text.slice(0, 1000), metadata: { channel, suppressed: true } });
      return { suppress: true, key, reason: "alert_cooldown" };
    }
    await supabase.from("telegram_alert_dedupe").upsert({ dedupe_key: key, event_type: event.event_type, provider: event.source ?? null, symbol: event.symbol ?? null, last_seen: new Date().toISOString(), last_sent_at: new Date().toISOString(), metadata: { latest_text: event.text.slice(0, 500) } }, { onConflict: "dedupe_key" });
  } catch {
    return { suppress: false, key };
  }
  return { suppress: false, key };
}

function eventDedupeKey(event: TelegramRouteEvent): string {
  return [
    event.event_type.toLowerCase(),
    String(event.symbol ?? event.market ?? "market").toLowerCase(),
    String(event.reason ?? "").toLowerCase().slice(0, 80),
  ].join(":");
}

function eventCooldownMinutes(event: TelegramRouteEvent): number {
  if (typeof event.cooldown_minutes === "number" && Number.isFinite(event.cooldown_minutes)) return Math.max(1, event.cooldown_minutes);
  return 60;
}

export async function routeTelegramEvent(supabase: SupabaseClient, event: TelegramRouteEvent): Promise<TelegramRouteResult[]> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const config = telegramChannelConfig();
  const channels = resolveTelegramChannels(event.event_type, event.channels, event);
  const results: TelegramRouteResult[] = [];
  const type = event.event_type.toLowerCase();
  const isEventAlert = isEventIntelligence(type);
  const alertKey = isEventAlert ? eventDedupeKey(event) : "";
  const sinceIso = isEventAlert ? new Date(Date.now() - eventCooldownMinutes(event) * 60_000).toISOString() : "";

  for (const channel of channels) {
    const operationalAlert = await shouldSuppressOperationalAlert(supabase, event, channel);
    if (operationalAlert.suppress) {
      const deliveryId = await insertDelivery(supabase, { ...event, event_id: operationalAlert.key || event.event_id }, channel, config[channel] || "not_configured", "skipped", operationalAlert.reason ?? "alert_cooldown");
      results.push({ channel, chat_id: config[channel] || "not_configured", status: "skipped", error_message: operationalAlert.reason ?? "alert_cooldown", delivery_id: deliveryId });
      continue;
    }
    const chatId = config[channel];
    if (!token || !chatId) {
      const error = !token ? "TELEGRAM_BOT_TOKEN missing" : `TELEGRAM_${channel.toUpperCase()}_CHAT_ID missing`;
      const deliveryId = await insertDelivery(supabase, event, channel, chatId, "skipped", error);
      results.push({ channel, chat_id: chatId || "not_configured", status: "skipped", error_message: error, delivery_id: deliveryId });
      continue;
    }

    if (event.event_id && event.dedupe !== false) {
      const { data: existingEvent } = await supabase.from("telegram_deliveries")
        .select("id")
        .eq("event_id", event.event_id)
        .eq("destination_channel", channel)
        .eq("status", "sent")
        .limit(1)
        .maybeSingle();
      if (existingEvent) {
        const deliveryId = await insertDelivery(supabase, event, channel, chatId, "skipped", `already_sent_event:${existingEvent.id}`);
        results.push({ channel, chat_id: chatId, status: "skipped", error_message: "already_sent_event", delivery_id: deliveryId });
        continue;
      }
    }

    if (event.signal_id) {
      const { data: existing } = await supabase.from("telegram_deliveries")
        .select("id")
        .eq("signal_id", event.signal_id)
        .eq("destination_channel", channel)
        .eq("delivery_type", event.event_type)
        .eq("status", "sent")
        .limit(1)
        .maybeSingle();
      if (existing) {
        const deliveryId = await insertDelivery(supabase, event, channel, chatId, "skipped", `already_sent:${existing.id}`);
        results.push({ channel, chat_id: chatId, status: "skipped", error_message: "already_sent", delivery_id: deliveryId });
        continue;
      }
    }

    if (isEventAlert) {
      const { data: recentAlert } = await supabase.from("telegram_deliveries")
        .select("id")
        .eq("event_type", event.event_type)
        .eq("destination_channel", channel)
        .eq("delivery_status", "sent")
        .gte("created_at", sinceIso)
        .ilike("event_id", `${alertKey}:%`)
        .limit(1)
        .maybeSingle();
      if (recentAlert) {
        const deliveryId = await insertDelivery(supabase, { ...event, event_id: `${alertKey}:${event.event_id ?? Date.now()}` }, channel, chatId, "skipped", `cooldown:${recentAlert.id}`);
        results.push({ channel, chat_id: chatId, status: "skipped", error_message: "cooldown", delivery_id: deliveryId });
        continue;
      }
    }

    try {
      const routedEvent = isEventAlert ? { ...event, event_id: `${alertKey}:${event.event_id ?? Date.now()}` } : event;
      const messageText = isEventAlert && !event.text.toLowerCase().includes("market intelligence alert")
        ? `Market Intelligence Alert\n\n${event.text}`
        : event.text;
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: event.parse_mode,
          disable_web_page_preview: event.disable_web_page_preview ?? true,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      const ok = res.ok && data.ok === true;
      const msgId = String(data.result?.message_id ?? "");
      const error = ok ? "" : (data.description ?? res.statusText ?? "Telegram API error");
      const deliveryId = await insertDelivery(supabase, routedEvent, channel, chatId, ok ? "sent" : "failed", error, msgId);
      results.push({ channel, chat_id: chatId, status: ok ? "sent" : "failed", telegram_message_id: msgId, error_message: error, delivery_id: deliveryId });
    } catch (e) {
      const error = e instanceof Error ? e.message : "unknown";
      const deliveryId = await insertDelivery(supabase, event, channel, chatId, "failed", error);
      results.push({ channel, chat_id: chatId, status: "failed", error_message: error, delivery_id: deliveryId });
    }
  }
  return results;
}
