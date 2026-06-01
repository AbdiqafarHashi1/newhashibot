import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};



function tradeManagementPlan(signal: Record<string, unknown>): Record<string, unknown> {
  const strategy = String(signal.strategy_name ?? "");
  const marketType = String(signal.market_type ?? "").toLowerCase();
  const isForex = marketType === "forex";
  const riskPct = Number(signal.recommended_risk_pct);
  const riskGuidance = Number.isFinite(riskPct)
    ? `Keep position risk near ${riskPct.toFixed(2)}% of account unless your plan is lower.`
    : "Default guidance: risk no more than 0.50% of account per signal.";
  const levMin = Number(signal.suggested_leverage_min);
  const levMax = Number(signal.suggested_leverage_max);
  const exposureGuidance = isForex
    ? "Use effective exposure / lot size that keeps loss at the planned risk; account for spread and slippage."
    : Number.isFinite(levMin) && Number.isFinite(levMax)
      ? `Effective leverage guidance: ${levMin.toFixed(0)}x–${levMax.toFixed(0)}x maximum only if stop-risk stays within plan.`
      : "Use effective leverage only if stop-risk stays within the planned account risk.";

  if (strategy.includes("MicroScalper")) {
    return {
      tp1PartialPct: 50,
      breakEvenRule: "Move stop to break-even after TP1 is tagged or price reaches roughly +0.75R to +1R.",
      trailingStopRule: "After TP1, trail tightly behind the latest micro swing or fast EMA; do not widen the stop.",
      timeStopRule: "Expire quickly if entry is not triggered or momentum stalls within the expected scalping window.",
      invalidationNote: "Invalid if price closes beyond the stop or momentum immediately reverses through the entry zone.",
      strategyNote: "Scalper profile: take faster TP1, reduce exposure on correlated stacked signals, and avoid chasing late entries.",
      riskGuidance, exposureGuidance,
      signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
    };
  }
  if (strategy.includes("CompressionBreakout")) {
    return {
      tp1PartialPct: 40,
      breakEvenRule: "Move stop to break-even after TP1 or after breakout acceptance/retest confirmation.",
      trailingStopRule: "Trail only after volatility expands; allow normal retest room before tightening.",
      timeStopRule: "Expire if breakout follow-through does not arrive within the expected bars/time for this timeframe.",
      invalidationNote: "Watch for fakeouts: invalid if price closes back inside the compression box or beyond the stop.",
      strategyNote: "Breakout profile: allow retest room, avoid early stop tightening, and require momentum expansion for runners.",
      riskGuidance, exposureGuidance,
      signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
    };
  }
  if (strategy.includes("SwingContinuation")) {
    return {
      tp1PartialPct: 35,
      breakEvenRule: "Move stop to break-even more slowly: after TP1 confirms or trend structure advances in your favor.",
      trailingStopRule: "Use wider trailing behind higher-timeframe swing structure; keep TP2 as the runner target.",
      timeStopRule: "Use a longer time stop than scalps; expire if continuation does not develop within the swing window.",
      invalidationNote: "Invalid if trend structure fails, key pullback level breaks, or price closes beyond the stop.",
      strategyNote: "Swing continuation profile: wider hold, slower break-even, and TP2 runner logic are preferred.",
      riskGuidance, exposureGuidance,
      signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
    };
  }
  return {
    tp1PartialPct: 40,
    breakEvenRule: "Consider break-even only after TP1 or clear confirmation in your favor.",
    trailingStopRule: "Trail only after meaningful follow-through; never widen the original stop.",
    timeStopRule: "Expire if the setup does not trigger or follow through within your plan.",
    invalidationNote: String(signal.invalidation ?? "Invalid if price closes beyond the stop loss."),
    strategyNote: "Manage according to signal-mode rules.",
    riskGuidance, exposureGuidance,
    signalOnlyWarning: "Signal guidance only — no broker, MT5, or order execution is performed.",
  };
}

function existingOrDerivedTradeManagement(signal: Record<string, unknown>): Record<string, unknown> {
  const snapshot = signal.risk_profile_snapshot as Record<string, unknown> | null;
  if (snapshot && typeof snapshot === "object" && snapshot.trade_management && typeof snapshot.trade_management === "object") {
    return snapshot.trade_management as Record<string, unknown>;
  }
  return tradeManagementPlan(signal);
}

function formatTradeManagementLines(signal: Record<string, unknown>): string[] {
  const plan = existingOrDerivedTradeManagement(signal);
  return [
    `*Management:*`,
    `• TP1 Partial: ~${plan.tp1PartialPct ?? 40}%`,
    `• BE: ${plan.breakEvenRule}`,
    `• Trail: ${plan.trailingStopRule}`,
    `• Expiry: ${plan.timeStopRule}`,
    `• Signal-only: no broker/MT5/order execution.`,
  ];
}

function titleCaseMode(value: unknown): string {
  return String(value ?? "signal_mode")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatRiskGuidanceLines(signal: Record<string, unknown>): string[] {
  const riskPct = Number(signal.recommended_risk_pct);
  const levMin = Number(signal.suggested_leverage_min);
  const levMax = Number(signal.suggested_leverage_max);
  const cap = Number(signal.leverage_cap);
  if (!Number.isFinite(riskPct) || !Number.isFinite(levMin) || !Number.isFinite(levMax)) return [];
  return [
    `*Risk Guidance:*`,
    `• Capital Mode: ${titleCaseMode(signal.capital_mode ?? signal.mode_slug ?? "signal_mode")}`,
    `• Risk Profile: ${titleCaseMode(signal.risk_profile ?? "balanced")}`,
    `• Suggested Risk: ${riskPct.toFixed(2)}% of account`,
    `• Suggested Leverage: ${levMin.toFixed(0)}x–${levMax.toFixed(0)}x`,
    Number.isFinite(cap) ? `• Max Leverage Cap: ${cap.toFixed(0)}x` : null,
    signal.strategy_specific_warning ? `• Note: ${signal.strategy_specific_warning}` : null,
    `• Warning: ${signal.risk_warning || "Signal only. Manage risk. Not financial advice."}`,
  ].filter(Boolean) as string[];
}

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
    ``,
    ...formatTradeManagementLines(signal),
    ``,
    `*Strategy:* ${signal.strategy_name}`,
    `*Regime:* ${signal.regime}`,
    `*Confidence:* ${signal.confidence_score}%`,
    `*Data:* ${signal.data_source === "REAL DATA" ? "✅ REAL DATA" : String(signal.data_source ?? "unknown")}`,
    `*Reason:* ${signal.reason}`,
    `*Invalidation:* ${signal.invalidation}`,
    `*Status:* ${String(signal.status).toUpperCase()}`,
    ``,
    ...formatRiskGuidanceLines(signal),
    ``,
    `*Timestamp:* ${new Date().toISOString()}`,
    ``,
    `_Signal Mode only. Not financial advice._`,
    `_HashiBot Trading Intelligence_`,
  ].filter(Boolean).join("\n");
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

function gradeIndex(g: string): number {
  const order = ["none", "C", "B", "A", "A+"];
  const idx = order.indexOf(g);
  return idx === -1 ? 0 : idx;
}

function hasFiniteNumber(value: unknown): boolean {
  return Number.isFinite(Number(value));
}

function signalSendBlockReason(signal: Record<string, unknown>, minGrade: string): string | null {
  if (!parseBooleanEnv(Deno.env.get("TELEGRAM_ENABLED") ?? undefined, false)) return "telegram_disabled_env";
  if (!parseBooleanEnv(Deno.env.get("ENABLE_SIGNAL_MODE_OUTPUT") ?? undefined, false)) return "signal_mode_output_disabled";
  const marketType = String(signal.market_type ?? "").toLowerCase();
  if (marketType === "crypto" && !parseBooleanEnv(Deno.env.get("SIGNAL_ENABLE_CRYPTO") ?? undefined, true)) return "crypto_disabled";
  if (marketType === "forex" && !parseBooleanEnv(Deno.env.get("SIGNAL_ENABLE_FOREX") ?? undefined, false)) return "forex_disabled";
  if (!["crypto", "forex"].includes(marketType)) return "unsupported_market_type";
  if (signal.data_source !== "REAL DATA") return "not_real_data";
  const arb = signal.arbitrator_decision as Record<string, unknown> | null;
  if (arb && arb.final_decision !== "approved") return `not_final_approved:${String(arb.final_decision ?? "unknown")}`;
  const status = String(signal.status ?? "");
  if (!["waiting", "active", "new", "approved"].includes(status)) return `status_not_sendable:${status}`;
  if (gradeIndex(String(signal.grade ?? "")) < gradeIndex(minGrade || "A")) return "grade_below_min_auto_send";
  const hasEntry = hasFiniteNumber(signal.entry_low) || hasFiniteNumber(signal.entry_high);
  if (!signal.symbol || !signal.direction || !hasEntry || !hasFiniteNumber(signal.stop_loss) || !hasFiniteNumber(signal.tp1)) return "invalid_trade_fields";
  return null;
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
      .in("delivery_type", ["auto_signal", "signal", "initial_signal"])
      .eq("chat_id", targetChatId)
      .eq("status", "sent")
      .maybeSingle();
    if (existingSent) {
      await supabase.from("telegram_deliveries").insert({
        signal_id, delivery_type, chat_id: targetChatId, status: "skipped",
        error_message: `already_sent:${existingSent.id}`,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const { data: cfg } = await supabase.from("scanner_config").select("min_auto_send_grade,min_signal_grade").eq("id", 1).maybeSingle();
    const blockReason = signalSendBlockReason(signal as Record<string, unknown>, cfg?.min_auto_send_grade || cfg?.min_signal_grade || "A");
    if (blockReason) {
      await supabase.from("telegram_deliveries").insert({
        signal_id,
        delivery_type,
        chat_id: targetChatId,
        status: "skipped",
        error_message: blockReason,
      });
      return new Response(JSON.stringify({ skipped: true, reason: blockReason }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
