import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

type TelegramChannel = "admin" | "free" | "vip";
type DeliveryStatus = "sent" | "failed" | "skipped";

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

export function resolveTelegramChannels(eventType: string, override?: TelegramChannel[]): TelegramChannel[] {
  if (override?.length) return Array.from(new Set(override));
  const type = eventType.toLowerCase();
  if (type.startsWith("admin_") || type.includes("failure") || type.includes("watchdog") || type.includes("mismatch") || type.includes("critical") || type.includes("cleanup") || type.includes("cron_")) return ["admin"];
  if (type.includes("morning_brief") || type.includes("market_wrap") || type.includes("news_digest") || type.includes("watchlist") || type.includes("pattern") || type.includes("sentiment") || type.includes("market_analytics")) return ["admin", "free", "vip"];
  if (type.includes("highest_confidence_setup")) return ["free"];
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
  };
  const { data } = await supabase.from("telegram_deliveries").insert(payload).select("id").maybeSingle();
  return data?.id as string | undefined;
}

export async function routeTelegramEvent(supabase: SupabaseClient, event: TelegramRouteEvent): Promise<TelegramRouteResult[]> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const config = telegramChannelConfig();
  const channels = resolveTelegramChannels(event.event_type, event.channels);
  const results: TelegramRouteResult[] = [];

  for (const channel of channels) {
    const chatId = config[channel];
    if (!token || !chatId) {
      const error = !token ? "TELEGRAM_BOT_TOKEN missing" : `TELEGRAM_${channel.toUpperCase()}_CHAT_ID missing`;
      const deliveryId = await insertDelivery(supabase, event, channel, chatId, "skipped", error);
      results.push({ channel, chat_id: chatId || "not_configured", status: "skipped", error_message: error, delivery_id: deliveryId });
      continue;
    }

    if (event.dedupe !== false && event.signal_id) {
      const { data: existing } = await supabase.from("telegram_deliveries")
        .select("id")
        .eq("signal_id", event.signal_id)
        .eq("destination_channel", channel)
        .eq("delivery_type", event.event_type)
        .eq("status", "sent")
        .maybeSingle();
      if (existing) {
        const deliveryId = await insertDelivery(supabase, event, channel, chatId, "skipped", `already_sent:${existing.id}`);
        results.push({ channel, chat_id: chatId, status: "skipped", error_message: "already_sent", delivery_id: deliveryId });
        continue;
      }
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: event.text,
          parse_mode: event.parse_mode,
          disable_web_page_preview: event.disable_web_page_preview ?? true,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      const ok = res.ok && data.ok === true;
      const msgId = String(data.result?.message_id ?? "");
      const error = ok ? "" : (data.description ?? res.statusText ?? "Telegram API error");
      const deliveryId = await insertDelivery(supabase, event, channel, chatId, ok ? "sent" : "failed", error, msgId);
      results.push({ channel, chat_id: chatId, status: ok ? "sent" : "failed", telegram_message_id: msgId, error_message: error, delivery_id: deliveryId });
    } catch (e) {
      const error = e instanceof Error ? e.message : "unknown";
      const deliveryId = await insertDelivery(supabase, event, channel, chatId, "failed", error);
      results.push({ channel, chat_id: chatId, status: "failed", error_message: error, delivery_id: deliveryId });
    }
  }
  return results;
}
