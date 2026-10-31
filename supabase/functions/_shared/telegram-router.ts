import {resolveHubChat} from './telegram-hub.ts';
import { loadPublishableSignal } from "./signal-publication-guard.ts";
import {editorialDestinations} from './telegram-product.ts';
/**
 * HashiBot Phase 7A-2A Root Telegram Router Service
 * Backend-owned central routing, delivery queue, idempotency engine, retry manager,
 * customer eligibility checks, Free channel publisher, and incentive rate limiter.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  categorizeEvent,
  TelegramEventCategory,
  TelegramEventSeverity,
  TelegramVisibility,
} from "./telegram-taxonomy.ts";
import {
  channelRegistry,
  getBotToken,
  vipChatId,
  TelegramChannelKey,
} from "./telegram-registry.ts";

export { vipChatId };
import {
  formatEastAfricaTime,
  renderTelegramTemplate,
  splitMessageSafely,
  TemplateMessagePayload,
} from "./telegram-templates.ts";
import {
  CustomerEligibilityContext,
  verifyChannelEligibility,
} from "./telegram-eligibility.ts";
import {
  evaluateFreeChannelCandidate,
  FreePublisherConfig,
  persistPublicationDecision,
} from "./telegram-free-publisher.ts";
import {
  checkAntiSpamLimits,
  recordCampaignDelivery,
  validateCampaignCompliance,
} from "./telegram-incentive-engine.ts";
import {
  EditorialPublication,
  renderCanonicalVipSignal,
  renderEditorialPublication,
  validateEditorialPublication,
} from "./telegram-product.ts";

type SupabaseClient = ReturnType<typeof createClient>;

export type DeliveryStatus =
  | "queued"
  | "processing"
  | "sent"
  | "failed"
  | "skipped"
  | "retry_pending"
  | "dead_lettered";

export interface TelegramRouteEvent {
  event_id?: string | null;
  event_type: string;
  runtime_timestamp?: string;
  text?: string;
  signal_id?: string | null;
  trade_id?: string | null;
  order_id?: string | null;
  source?: string;
  channels?: TelegramChannelKey[];
  visibility?: TelegramVisibility;
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  disable_web_page_preview?: boolean;
  dedupe?: boolean;
  symbol?: string | null;
  market?: string | null;
  provider?: string | null;
  execution_mode?: string | null;
  reason?: string;
  severity?: TelegramEventSeverity | string;
  confidence?: number;
  cooldown_minutes?: number;
  customer_id?: string;
  account_id?: string;
  execution_provider?: string;
  execution_instance_id?: string;
  credential_ref?: string;
  execution_scope_key?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;

  // Customer Eligibility & Phase 7A-2A Options
  customerContext?: CustomerEligibilityContext;
  freePublisherConfig?: FreePublisherConfig;
  isCampaign?: boolean;
  campaignId?: string;
  campaignType?: "VIP_INVITATION" | "TRIAL" | "PRODUCT_UPDATE" | "FEATURE_ANNOUNCEMENT" | "EDUCATION" | "VERIFIED_RECAP";
  publicationMode?: "preview" | "delayed" | "full";
  editorial?: EditorialPublication;
}

export interface TelegramRouteResult {
  channel: TelegramChannelKey;
  chat_id: string;
  status: DeliveryStatus;
  telegram_message_id?: string;
  error_message?: string;
  delivery_id?: string;
  idempotency_key?: string;
}

/**
 * Deterministic Idempotency Key Calculation
 * Formula: {eventType}:{destination}:{entityId}:{lifecycleStage}
 */
export function buildIdempotencyKey(event: TelegramRouteEvent, destination: TelegramChannelKey): string {
  const entityId = event.signal_id || event.trade_id || event.order_id || event.event_id || "global";
  const stage = event.reason || event.severity || "standard";
  return `${event.event_type.toUpperCase()}:${destination}:${entityId}:${stage}`.toLowerCase();
}

/**
 * Classify error as transient (retryable) vs permanent (dead-letter)
 */
export function classifyDeliveryError(status: number, description: string): { permanent: boolean; retryAfterSeconds: number } {
  const desc = description.toLowerCase();

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    desc.includes("bot was blocked") ||
    desc.includes("chat not found") ||
    desc.includes("unauthorized") ||
    desc.includes("forbidden") ||
    desc.includes("bad request") ||
    desc.includes("invalid token")
  ) {
    return { permanent: true, retryAfterSeconds: 0 };
  }

  if (status === 429) {
    const match = desc.match(/retry after (\d+)/);
    const retryAfter = match ? parseInt(match[1], 10) : 30;
    return { permanent: false, retryAfterSeconds: retryAfter };
  }

  return { permanent: false, retryAfterSeconds: 5 };
}

/**
 * Record or update delivery state in `telegram_deliveries`
 */
async function recordDeliveryTruth(
  supabase: SupabaseClient,
  event: TelegramRouteEvent,
  channelKey: TelegramChannelKey,
  chatId: string,
  status: DeliveryStatus,
  idempotencyKey: string,
  errorMessage = "",
  telegramMessageId = "",
  retryCount = 0,
  nextAttemptAt: string | null = null,
  retryAfterSeconds = 0,
  telegramResponse: Record<string, unknown> | null = null,
): Promise<string | undefined> {
  const { defaultVisibility } = categorizeEvent(event.event_type);
  const visibility = event.visibility || defaultVisibility;

  const rowPayload = {
    event_id: event.event_id ?? event.signal_id ?? crypto.randomUUID(),
    event_type: event.event_type,
    signal_id: event.signal_id ?? null,
    delivery_type: event.event_type,
    chat_id: chatId || "not_configured",
    destination_channel: channelKey,
    destination_chat_id: chatId || "not_configured",
    status: status === "sent" ? "sent" : status === "skipped" ? "skipped" : "failed",
    delivery_status: status,
    telegram_message_id: telegramMessageId,
    error_message: errorMessage,
    sent_at: status === "sent" ? new Date().toISOString() : null,
    retry_count: retryCount,
    customer_id: event.customer_id ?? null,
    execution_provider: event.execution_provider ?? event.provider ?? null,
    account_id: event.account_id ?? null,
    execution_instance_id: event.execution_instance_id ?? null,
    credential_ref: event.credential_ref ?? null,
    execution_scope_key: event.execution_scope_key ?? null,
    idempotency_key: idempotencyKey,
    routing_version: "v2.0",
    template_version: "v2.0",
    retry_after_seconds: retryAfterSeconds,
    next_attempt_at: nextAttemptAt,
    telegram_response: telegramResponse,
    visibility,
    dead_lettered_at: status === "dead_lettered" ? new Date().toISOString() : null,
    dead_letter_reason: status === "dead_lettered" ? errorMessage : null,
  };

  try {
    const { data } = await supabase.from("telegram_deliveries").insert(rowPayload).select("id").maybeSingle();
    return data?.id as string | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Central Router dispatching method
 */
export async function routeTelegramEvent(supabase: SupabaseClient, event: TelegramRouteEvent): Promise<TelegramRouteResult[]> {
  const botToken = getBotToken();
  const results: TelegramRouteResult[] = [];

  if (event.editorial) {
    const checked=validateEditorialPublication(event.editorial);
    const channel=event.editorial.audience;
    if(!checked.valid)return [{channel,chat_id:"blocked",status:"skipped",error_message:checked.reason}];
    const {data,error}=await supabase.rpc("enqueue_canonical_lifecycle_event",{p_event_key:event.editorial.dedupe_key,p_event_type:"EDITORIAL",p_event_version:1,p_signal_id:null,p_execution_id:null,p_customer_id:null,p_account_id:null,p_occurred_at:event.editorial.generated_at,p_payload:{editorial:event.editorial},p_destinations:editorialDestinations(event.editorial)});
    return [{channel,chat_id:"durable_queue",status:error?"failed":"queued",error_message:error?"EDITORIAL_QUEUE_UNAVAILABLE":undefined,delivery_id:typeof data==="string"?data:undefined}];
  }
  if (event.channels?.length===1 && event.channels[0]==="admin") {
    const {data,error}=await supabase.rpc("enqueue_canonical_lifecycle_event",{p_event_key:buildIdempotencyKey(event,"admin"),p_event_type:"OPERATIONAL_INCIDENT",p_event_version:1,p_signal_id:null,p_execution_id:null,p_customer_id:null,p_account_id:null,p_occurred_at:event.runtime_timestamp??new Date().toISOString(),p_payload:{details:event.text??event.reason??event.event_type,event_type:event.event_type,source:event.source},p_destinations:["admin"]});
    return [{channel:"admin",chat_id:"durable_queue",status:error?"failed":"queued",error_message:error?"ADMIN_QUEUE_UNAVAILABLE":undefined,delivery_id:typeof data==="string"?data:undefined}];
  }

  if (/agent/i.test(event.source ?? "") && !event.editorial) {
    const channel = event.channels?.[0] ?? "admin";
    const key = buildIdempotencyKey(event, channel);
    const deliveryId = await recordDeliveryTruth(supabase, event, channel, "", "skipped", key, "AGENT_EDITORIAL_CONTRACT_REQUIRED");
    return [{ channel, chat_id: "blocked", status: "skipped", error_message: "AGENT_EDITORIAL_CONTRACT_REQUIRED", delivery_id: deliveryId, idempotency_key: key }];
  }

  const { defaultVisibility } = categorizeEvent(event.event_type);
  const visibility = event.visibility || defaultVisibility;
  const destinations = event.channels?.length ? event.channels : channelRegistry.getChannelsForVisibility(visibility);
  const publicDestinations = destinations.filter(channel => channel === "free" || channel === "vip");
  if (publicDestinations.length && !event.editorial) {
    // Legacy callers cannot send text or bypass the durable queue and qualification gate.
    const initialSignal = /^(NEW_SIGNAL|SIGNAL|SIGNAL_QUALIFIED|SIGNAL_CREATED|AUTO_SIGNAL|INITIAL_SIGNAL|FREE_SELECTED_SIGNAL)$/i.test(event.event_type);
    if (!initialSignal || !event.signal_id) return publicDestinations.map(channel => ({ channel, chat_id: "blocked", status: "skipped" as const, error_message: "CANONICAL_PUBLICATION_OR_EDITORIAL_REQUIRED" }));
    try {
      const signal = await loadPublishableSignal(supabase, event.signal_id);
      for (const channel of publicDestinations) {
        const destination=channel==="vip"?(String(signal.market_type).toLowerCase()==="crypto"?"vip_crypto":"vip_forex_gold"):channel;
        const { error } = await supabase.from("signal_publication_work").insert({ signal_id: signal.id, entity_type: "signal", entity_id: signal.id, event_type: "SIGNAL_QUALIFIED", event_version: 1, destination, event_key: `signal:${signal.signal_identity}:${channel}` });
        if (error) {
          const { data: existing, error: lookupError } = await supabase.from("signal_publication_work").select("id").eq("entity_type", "signal").eq("entity_id", signal.id).eq("event_type", "SIGNAL_QUALIFIED").eq("event_version", 1).eq("destination", destination).maybeSingle();
          if (lookupError || !existing) throw Error("PUBLICATION_QUEUE_UNAVAILABLE");
        }
      }
      return publicDestinations.map(channel => ({ channel, chat_id: "durable_queue", status: "queued" as const }));
    } catch (error) {
      return publicDestinations.map(channel => ({ channel, chat_id: "blocked", status: "skipped" as const, error_message: error instanceof Error ? error.message : "QUALIFICATION_UNAVAILABLE" }));
    }
  }

  if (visibility === "NO_TELEGRAM") {
    return results;
  }

  // Routing Rules:
  // - SIGNALS & QUALIFIED TRADES -> 'vip' (and 'free' if qualified/eligible)
  // - EXECUTION/POSITION LIFECYCLE (TP1, TP2, BE lock, Fills) -> 'vip' (VIP real-time management) and 'admin' (execution truth)
  // - RECOVERY, RISK, RUNTIME, TELEGRAM, HEALTH -> 'admin'
  let rawChannels: TelegramChannelKey[] = event.channels && event.channels.length > 0
    ? event.channels
    : channelRegistry.getChannelsForVisibility(visibility);

  // Non-signal authors enter through a typed, evidence-backed boundary. Their
  // declared audience is authoritative and may never be widened by callers.
  if (event.editorial) {
    const validation = validateEditorialPublication(event.editorial);
    if (!validation.valid) {
      const channel = event.editorial.audience;
      const key = buildIdempotencyKey(event, channel);
      const deliveryId = await recordDeliveryTruth(supabase, event, channel, "", "skipped", key, validation.reason);
      return [{ channel, chat_id: "blocked", status: "skipped", error_message: validation.reason, delivery_id: deliveryId, idempotency_key: key }];
    }
    rawChannels = [event.editorial.audience];
  }

  const payload: TemplateMessagePayload = {
    eventType: event.event_type,
    market: event.market ?? undefined,
    symbol: event.symbol ?? undefined,
    direction: (event.payload?.direction as string) ?? undefined,
    grade: (event.payload?.grade as string) ?? undefined,
    confidence: (event.payload?.confidence as number) ?? event.confidence ?? undefined,
    entryLow: (event.payload?.entry_low as number) ?? undefined,
    entryHigh: (event.payload?.entry_high as number) ?? undefined,
    stopLoss: (event.payload?.stop_loss as number) ?? undefined,
    tp1: (event.payload?.tp1 as number) ?? undefined,
    tp2: (event.payload?.tp2 as number) ?? undefined,
    tp3: (event.payload?.tp3 as number) ?? undefined,
    riskReward: (event.payload?.risk_reward as number) ?? undefined,
    strategyName: (event.payload?.strategy_name as string) ?? undefined,
    regime: (event.payload?.regime as string) ?? undefined,
    reason: event.reason ?? (event.payload?.reason as string) ?? undefined,
    eventPrice: (event.payload?.event_price as number) ?? undefined,
    realizedR: (event.payload?.realized_r as number) ?? undefined,
    provider: event.provider ?? event.execution_provider ?? undefined,
    executionMode: event.execution_mode ?? undefined,
    accountRef: event.account_id ?? undefined,
    customerRef: event.customer_id ?? undefined,
    severity: String(event.severity ?? "LOW"),
    details: event.text ?? (event.payload?.details as string) ?? undefined,
    timestamp: event.runtime_timestamp ?? new Date().toISOString(),
    publicationMode: event.publicationMode ?? "preview",
  };

  for (const channelKey of rawChannels) {
    // 1. Verify Customer Eligibility for channel
    const eligibility = verifyChannelEligibility(channelKey, event.customerContext);
    if (!eligibility.allowed) {
      const idempotencyKey = buildIdempotencyKey(event, channelKey);
      const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, "blocked", "skipped", idempotencyKey, `ELIGIBILITY_BLOCKED:${eligibility.reason}`);
      results.push({ channel: channelKey, chat_id: "blocked", status: "skipped", error_message: eligibility.reason, delivery_id: deliveryId, idempotency_key: idempotencyKey });
      continue;
    }

    // 2. Free Channel Publisher Evaluation
    if (channelKey === "free" && event.signal_id && (event.event_type.startsWith("SIGNAL_") || event.event_type === "NEW_SIGNAL")) {
      const candidate = {
        id: event.signal_id,
        symbol: event.symbol ?? "",
        market_type: event.market ?? "crypto",
        direction: (event.payload?.direction as string) ?? "buy",
        grade: (event.payload?.grade as string) ?? "",
        confidence_score: (event.payload?.confidence as number) ?? event.confidence ?? 0,
        risk_reward: (event.payload?.risk_reward as number) ?? 0,
        timeframe: (event.payload?.timeframe as string) ?? "",
        strategy_name: (event.payload?.strategy_name as string) ?? "",
        entry_low: (event.payload?.entry_low as number) ?? undefined,
        entry_high: (event.payload?.entry_high as number) ?? undefined,
        stop_loss: (event.payload?.stop_loss as number) ?? undefined,
        tp1: (event.payload?.tp1 as number) ?? undefined,
        tp2: (event.payload?.tp2 as number) ?? undefined,
        status: String(event.payload?.status ?? ""),
        data_source: String(event.payload?.data_source ?? ""),
        created_at: event.runtime_timestamp ?? new Date().toISOString(),
      };

      const evalRes = await evaluateFreeChannelCandidate(supabase, candidate, event.freePublisherConfig);
      await persistPublicationDecision(
        supabase,
        event.signal_id,
        evalRes.decision,
        evalRes.reason,
        event.publicationMode ?? "preview",
        candidate
      );

      if (!evalRes.eligible) {
        const idempotencyKey = buildIdempotencyKey(event, channelKey);
        const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, "skipped", "skipped", idempotencyKey, `FREE_PUBLISHER_SKIPPED:${evalRes.reason}`);
        results.push({ channel: channelKey, chat_id: "skipped", status: "skipped", error_message: evalRes.reason, delivery_id: deliveryId, idempotency_key: idempotencyKey });
        continue;
      }
    }

    // 3. Campaign & Anti-Spam Check for Promotional Messages
    if (event.isCampaign || event.event_type === "VIP_INVITATION") {
      const antiSpam = await checkAntiSpamLimits(supabase, channelKey);
      if (!antiSpam.allowed) {
        const idempotencyKey = buildIdempotencyKey(event, channelKey);
        const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, "skipped", "skipped", idempotencyKey, `ANTI_SPAM_BLOCKED:${antiSpam.reason}`);
        results.push({ channel: channelKey, chat_id: "skipped", status: "skipped", error_message: antiSpam.reason, delivery_id: deliveryId, idempotency_key: idempotencyKey });
        continue;
      }

      if (event.text) {
        const compliance = validateCampaignCompliance(event.text);
        if (!compliance.compliant) {
          const idempotencyKey = buildIdempotencyKey(event, channelKey);
          const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, "skipped", "skipped", idempotencyKey, `COMPLIANCE_VIOLATION:${compliance.violation}`);
          results.push({ channel: channelKey, chat_id: "skipped", status: "skipped", error_message: compliance.violation, delivery_id: deliveryId, idempotency_key: idempotencyKey });
          continue;
        }
      }
    }

    const destination = channelRegistry.getDestination(channelKey);
    const chatId = channelKey==='free'||channelKey==='admin'?await resolveHubChat(supabase,channelKey==='free'?'FREE':'ADMIN',destination?.chatId||''):destination?.chatId||'';
    const idempotencyKey = buildIdempotencyKey(event, channelKey);

    // 4. Missing Token or Destination Config
    if (!botToken || !chatId) {
      const error = !botToken ? "TELEGRAM_BOT_TOKEN missing" : `TELEGRAM_${channelKey.toUpperCase()}_CHAT_ID missing`;
      const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, chatId, "skipped", idempotencyKey, error);
      results.push({ channel: channelKey, chat_id: chatId || "not_configured", status: "skipped", error_message: error, delivery_id: deliveryId, idempotency_key: idempotencyKey });
      continue;
    }

    // 5. Idempotency Check
    if (event.dedupe !== false) {
      try {
        let existing = null;
        if (event.event_id) {
          const { data } = await supabase.from("telegram_deliveries")
            .select("id")
            .eq("event_id", event.event_id)
            .eq("destination_channel", channelKey)
            .eq("status", "sent")
            .limit(1)
            .maybeSingle();
          existing = data;
        }
        if (!existing) {
          const { data } = await supabase.from("telegram_deliveries")
            .select("id")
            .eq("idempotency_key", idempotencyKey)
            .eq("delivery_status", "sent")
            .limit(1)
            .maybeSingle();
          existing = data;
        }

        if (existing) {
          const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, chatId, "skipped", idempotencyKey, `already_sent:${existing.id}`);
          results.push({ channel: channelKey, chat_id: chatId, status: "skipped", error_message: "already_sent", delivery_id: deliveryId, idempotency_key: idempotencyKey });
          continue;
        }
      } catch {
        // Continue if DB check fails
      }
    }

    // 6. Render Message Text
    let fullText: string;
    if (event.editorial) fullText = renderEditorialPublication(event.editorial);
    else if (event.text && event.text.length > 0) fullText = event.text;
    else if (channelKey === "vip" && (event.event_type.startsWith("SIGNAL_") || event.event_type === "NEW_SIGNAL") && event.signal_id) {
      fullText = renderCanonicalVipSignal({
        signal_id: event.signal_id, market: event.market ?? "", symbol: event.symbol ?? "", direction: String(event.payload?.direction ?? ""), occurred_at: payload.timestamp ?? new Date().toISOString(),
        entry_low: payload.entryLow, entry_high: payload.entryHigh, stop_loss: payload.stopLoss, targets: [payload.tp1, payload.tp2, payload.tp3].filter((v): v is number => v !== undefined),
        risk_reward: payload.riskReward, strategy: payload.strategyName, grade: payload.grade, confidence: payload.confidence, session: String(event.payload?.session ?? "") || undefined, exchange: String(event.payload?.exchange ?? "") || undefined,
      });
    } else fullText = renderTelegramTemplate(payload, channelKey);
    const textChunks = splitMessageSafely(fullText, 4000);

    let lastMessageId = "";
    let sendSuccess = true;
    let lastError = "";

    for (const chunk of textChunks) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: event.parse_mode || "Markdown",
            disable_web_page_preview: event.disable_web_page_preview ?? true,
          }),
          signal: AbortSignal.timeout(8000),
        });

        const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; description?: string };
        const ok = res.ok && data.ok === true;

        if (ok) {
          lastMessageId = String(data.result?.message_id ?? "");
        } else {
          sendSuccess = false;
          lastError = data.description ?? res.statusText ?? `HTTP ${res.status}`;
          const errClassification = classifyDeliveryError(res.status, lastError);

          if (errClassification.permanent) {
            channelRegistry.markHealth(channelKey, false, new Date().toISOString(), lastError);
            const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, chatId, "dead_lettered", idempotencyKey, lastError, "", 0, null, 0, data as Record<string, unknown>);
            results.push({ channel: channelKey, chat_id: chatId, status: "dead_lettered", error_message: lastError, delivery_id: deliveryId, idempotency_key: idempotencyKey });
          } else {
            const nextAttempt = new Date(Date.now() + errClassification.retryAfterSeconds * 1000).toISOString();
            const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, chatId, "retry_pending", idempotencyKey, lastError, "", 1, nextAttempt, errClassification.retryAfterSeconds, data as Record<string, unknown>);
            results.push({ channel: channelKey, chat_id: chatId, status: "retry_pending", error_message: lastError, delivery_id: deliveryId, idempotency_key: idempotencyKey });
          }
          break;
        }
      } catch (e) {
        sendSuccess = false;
        lastError = (e instanceof Error ? e.message : "Network error").replace(/https?:\/\/\S+/g, "[redacted]");
        const nextAttempt = new Date(Date.now() + 5000).toISOString();
        const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, chatId, "retry_pending", idempotencyKey, lastError, "", 1, nextAttempt, 5);
        results.push({ channel: channelKey, chat_id: chatId, status: "retry_pending", error_message: lastError, delivery_id: deliveryId, idempotency_key: idempotencyKey });
        break;
      }
    }

    if (sendSuccess) {
      channelRegistry.markHealth(channelKey, true);
      const deliveryId = await recordDeliveryTruth(supabase, event, channelKey, chatId, "sent", idempotencyKey, "", lastMessageId);
      results.push({ channel: channelKey, chat_id: chatId, status: "sent", telegram_message_id: lastMessageId, delivery_id: deliveryId, idempotency_key: idempotencyKey });

      if (event.isCampaign && event.campaignId) {
        await recordCampaignDelivery(supabase, {
          campaignId: event.campaignId,
          campaignType: event.campaignType ?? "VIP_INVITATION",
          channel: channelKey,
          content: fullText,
        });
      }
    }
  }

  return results;
}
