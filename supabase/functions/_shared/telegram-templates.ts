/**
 * HashiBot Phase 7A-2A Centralized Message Template Engine
 * Renders normalized, provider-aware, market-aware, HTML/Markdown safe Telegram messages.
 */

export const TEMPLATE_VERSION = "v2.0.0";

/**
 * Format timestamp into East Africa Time (EAT, UTC+3) in 12-hour format.
 * Example: "10:45 AM EAT" or "Jul 23, 10:45 AM EAT"
 */
export function formatEastAfricaTime(dateInput: string | number | Date = new Date(), includeDate = true): string {
  const date = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Africa/Nairobi",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    };
    if (includeDate) {
      options.month = "short";
      options.day = "numeric";
    }

    const formatted = new Intl.DateTimeFormat("en-US", options).format(date);
    return `${formatted} EAT`;
  } catch {
    const utcHours = date.getUTCHours();
    const eatHours = (utcHours + 3) % 24;
    const ampm = eatHours >= 12 ? "PM" : "AM";
    const h12 = eatHours % 12 || 12;
    const mins = String(date.getUTCMinutes()).padStart(2, "0");
    return `${h12}:${mins} ${ampm} EAT`;
  }
}

/**
 * Sanitize text to redact sensitive tokens, passwords, API keys.
 */
export function safeSanitize(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return str
    .replace(/(?:sk_live|service_role|apikey|token|secret|password|bearer)[=:]\S+/gi, "[REDACTED]")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim();
}

/**
 * Escape Markdown special characters to prevent Telegram API Markdown parsing errors.
 */
export function escapeMarkdown(value: unknown): string {
  const str = safeSanitize(value);
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[");
}

/**
 * Format price according to instrument precision requirements.
 */
export function formatInstrumentPrice(price: number | undefined | null, market = "crypto", symbol = ""): string {
  if (price === undefined || price === null || !Number.isFinite(price)) return "—";

  const sym = symbol.toUpperCase().trim();
  const mkt = market.toLowerCase().trim();

  if (sym === "XAUUSD" || mkt === "metals") {
    return price.toFixed(2);
  }

  if (mkt === "forex") {
    if (sym.endsWith("JPY")) {
      return price.toFixed(3);
    }
    return price.toFixed(5);
  }

  const absPrice = Math.abs(price);
  if (absPrice >= 1000) return price.toFixed(2);
  if (absPrice >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

/**
 * Mask customer reference for public safety
 */
export function maskCustomerRef(ref: string | undefined | null): string {
  if (!ref) return "—";
  const clean = safeSanitize(ref);
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export interface TemplateMessagePayload {
  eventType: string;
  market?: string;
  symbol?: string;
  direction?: string;
  grade?: string;
  confidence?: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  riskReward?: number;
  strategyName?: string;
  regime?: string;
  reason?: string;
  eventPrice?: number;
  realizedR?: number;
  provider?: string;
  executionMode?: string;
  accountRef?: string;
  customerRef?: string;
  severity?: string;
  details?: string;
  timestamp?: string;
  warning?: string;

  // Phase 7A-2A Fields
  publicationMode?: "preview" | "delayed" | "full";
  session?: string;
  keyLevels?: string[];
  cta?: string;
  topic?: string;
  keyTakeaway?: string;
  exampleScenario?: string;
  totalSignalsCount?: number;
  qualifiedFreeSignalsCount?: number;
  winRatePct?: number;
  topPerformingStrategy?: string;
  topPerformingMarket?: string;
  keyHighlights?: string[];
  monthName?: string;
  platformUpgrades?: string[];
  educationalMilestones?: string[];
}

export const FREE_UPGRADE_BANNER = [
  `━━━━━━━━━━━━━━━━━━━━━━`,
  `💎 *UPGRADE TO HASHIBOT VIP*`,
  `• Instant real-time Crypto & Forex/Gold setups`,
  `• Exact entry limit zones, SL, TP1, TP2 & TP3 targets`,
  `• Live trade management: Automatic BE lock & trailing stop updates`,
  ``,
  `🔗 *Instant Upgrade:* [hashibot.trade/vip](https://hashibot.trade/vip)`,
  `💬 *Manual Access & Inquiries:* Text @Abdihashi1 on Telegram`,
  `━━━━━━━━━━━━━━━━━━━━━━`,
].join("\n");

/**
 * Render Free Channel Signal (Preview, Delayed, Full)
 */
export function renderFreeChannelSignalTemplate(payload: TemplateMessagePayload): string {
  const mode = payload.publicationMode ?? "full";
  const timeStr = formatEastAfricaTime(payload.timestamp ? new Date(payload.timestamp) : new Date());
  const symbol = payload.symbol?.toUpperCase() ?? "BTCUSDT";
  const market = payload.market?.toUpperCase() ?? "CRYPTO";
  const directionEmoji = payload.direction?.toLowerCase() === "buy" ? "🟢 BUY" : "🔴 SELL";

  if (mode === "preview") {
    return [
      `🔍 *HASHIBOT FREE SETUP PREVIEW*`,
      ``,
      `*Symbol:* ${escapeMarkdown(symbol)} (${escapeMarkdown(market)})`,
      `*Direction:* ${directionEmoji}`,
      `*Strategy:* ${escapeMarkdown(payload.strategyName ?? "Institutional Breakout")}`,
      `*Timeframe:* ${escapeMarkdown(payload.details ?? "15m")}`,
      `*Market Regime:* ${escapeMarkdown(payload.regime ?? "Trending")}`,
      ``,
      `🔒 *Entry, Stop Loss, and TP levels are locked in Free Preview.*`,
      payload.cta ?? FREE_UPGRADE_BANNER,
      ``,
      `*Generated:* ${timeStr}`,
      `_Signal Mode guidance. Not financial advice._`,
    ].join("\n");
  }

  const entryRange = payload.entryLow && payload.entryHigh
    ? `${formatInstrumentPrice(payload.entryLow, payload.market, payload.symbol)} – ${formatInstrumentPrice(payload.entryHigh, payload.market, payload.symbol)}`
    : formatInstrumentPrice(payload.entryHigh ?? payload.entryLow, payload.market, payload.symbol);

  return [
    `🆓 *HASHIBOT FREE QUALIFIED SIGNAL* ⭐`,
    ``,
    `*Symbol:* ${escapeMarkdown(symbol)} (${escapeMarkdown(market)})`,
    `*Direction:* ${directionEmoji}`,
    `*Entry Range:* ${entryRange}`,
    `*Stop Loss:* ${formatInstrumentPrice(payload.stopLoss, payload.market, payload.symbol)}`,
    `*TP1:* ${formatInstrumentPrice(payload.tp1, payload.market, payload.symbol)}`,
    `*TP2:* ${formatInstrumentPrice(payload.tp2, payload.market, payload.symbol)}`,
    `*Risk/Reward:* ${payload.riskReward ? payload.riskReward.toFixed(2) : "—"}R`,
    ``,
    `*Strategy:* ${escapeMarkdown(payload.strategyName ?? "Standard")}`,
    `*Grade:* ${escapeMarkdown(payload.grade ?? "A")}`,
    payload.reason ? `*Analysis:* ${escapeMarkdown(payload.reason)}` : null,
    ``,
    `⚠️ *Risk Warning:* Risk 0.50% to 1.00% max per setup. Maintain stop discipline.`,
    payload.cta ?? FREE_UPGRADE_BANNER,
    ``,
    `*Time:* ${timeStr}`,
    `_Signal Mode guidance. Not financial advice._`,
  ].filter(Boolean).join("\n");
}

/**
 * Render Market Outlook Template
 */
export function renderMarketOutlookTemplate(payload: TemplateMessagePayload): string {
  const timeStr = formatEastAfricaTime(payload.timestamp ? new Date(payload.timestamp) : new Date());
  const market = payload.market ?? "Crypto & Forex";
  const session = payload.session ?? "London / New York";
  const levels = payload.keyLevels?.map((l) => `• ${escapeMarkdown(l)}`).join("\n") ?? "• Key pivot levels identified";

  return [
    `🌐 *HASHIBOT MARKET OUTLOOK: ${escapeMarkdown(market.toUpperCase())}*`,
    `*Session Context:* ${escapeMarkdown(session)}`,
    ``,
    `*Market Regime:* ${escapeMarkdown(payload.regime ?? "Ranging / Neutral")}`,
    `*Volatility Context:* ${escapeMarkdown(payload.details ?? "Normal volatility")}`,
    ``,
    `*Key Structural Levels:*`,
    levels,
    ``,
    `💡 *Trading Guidance:* Focus on A/A+ qualified setups. Quality over quantity.`,
    payload.cta ?? `👉 *Join HashiBot VIP Signals* to receive real-time signal dispatches.`,
    ``,
    `*Published:* ${timeStr}`,
  ].join("\n");
}

/**
 * Render No-Trade Explanation Template
 */
export function renderNoTradeTemplate(payload: TemplateMessagePayload): string {
  const timeStr = formatEastAfricaTime(payload.timestamp ? new Date(payload.timestamp) : new Date());
  const market = payload.market ?? "Global Markets";

  return [
    `☕ *HASHIBOT NO-TRADE GUIDANCE: ${escapeMarkdown(market.toUpperCase())}*`,
    ``,
    `*Reason:* ${escapeMarkdown(payload.details ?? "No setup met our institutional A/A+ threshold today.")}`,
    payload.warning ? `*Macro Context:* ${escapeMarkdown(payload.warning)}` : null,
    ``,
    `🛡️ *Capital Preservation:* Staying out of poor-quality or choppy markets is an essential edge in professional trading.`,
    ``,
    `*Published:* ${timeStr}`,
  ].filter(Boolean).join("\n");
}

/**
 * Render Educational Post Template
 */
export function renderEducationalTemplate(payload: TemplateMessagePayload): string {
  const timeStr = formatEastAfricaTime(payload.timestamp ? new Date(payload.timestamp) : new Date());
  const topic = payload.topic ?? "Trading Discipline";

  return [
    `📚 *HASHIBOT TRADING INTELLIGENCE: ${escapeMarkdown(topic.toUpperCase())}*`,
    ``,
    `*Key Takeaway:*`,
    `${escapeMarkdown(payload.keyTakeaway ?? "Always respect risk parameters and position sizing.")}`,
    ``,
    payload.exampleScenario ? `*Scenario Example:*\n${escapeMarkdown(payload.exampleScenario)}\n` : null,
    `💡 *Pro Tip:* HashiBot algorithms automatically enforce these rules across all signal generation.`,
    ``,
    `*Published:* ${timeStr}`,
  ].filter(Boolean).join("\n");
}

/**
 * Render Weekly Summary Template
 */
export function renderWeeklySummaryTemplate(payload: TemplateMessagePayload): string {
  const timeStr = formatEastAfricaTime(payload.timestamp ? new Date(payload.timestamp) : new Date());
  const highlights = payload.keyHighlights?.map((h) => `• ${escapeMarkdown(h)}`).join("\n") ?? "• Consistent risk control applied across all signals";

  return [
    `📊 *HASHIBOT WEEKLY MARKET INTELLIGENCE RECAP*`,
    ``,
    `*Total Signals Generated:* ${payload.totalSignalsCount ?? 0}`,
    `*Free Channel Qualified Signals:* ${payload.qualifiedFreeSignalsCount ?? 0}`,
    `*Signal Performance Metric:* ${payload.winRatePct ?? 0}% Win/Target Rate`,
    `*Top Strategy:* ${escapeMarkdown(payload.topPerformingStrategy ?? "Compression Breakout")}`,
    `*Top Market:* ${escapeMarkdown(payload.topPerformingMarket ?? "Crypto / Forex Major")}`,
    ``,
    `*Key Performance Highlights:*`,
    highlights,
    ``,
    payload.cta ?? `🚀 *Upgrade to HashiBot VIP* for full real-time coverage in the week ahead.`,
    ``,
    `*Published:* ${timeStr}`,
  ].join("\n");
}

/**
 * Render Monthly Summary Template
 */
export function renderMonthlySummaryTemplate(payload: TemplateMessagePayload): string {
  const timeStr = formatEastAfricaTime(payload.timestamp ? new Date(payload.timestamp) : new Date());
  const month = payload.monthName ?? "Current Month";
  const upgrades = payload.platformUpgrades?.map((u) => `• ${escapeMarkdown(u)}`).join("\n") ?? "• Engine reliability & precision improvements";

  return [
    `🗓️ *HASHIBOT MONTHLY SUMMARY: ${escapeMarkdown(month.toUpperCase())}*`,
    ``,
    `*Total Institutional Signals Processed:* ${payload.totalSignalsCount ?? 0}`,
    ``,
    `*Platform & System Improvements:*`,
    upgrades,
    ``,
    `💡 *Continuous Evolution:* HashiBot expands provider coverage and protection algorithms monthly.`,
    ``,
    `*Published:* ${timeStr}`,
  ].join("\n");
}

/**
 * Main Template Renderer
 */
export function renderTelegramTemplate(payload: TemplateMessagePayload, channelKey = "vip"): string {
  const eventType = payload.eventType.toUpperCase();
  const timeStr = formatEastAfricaTime(payload.timestamp ? new Date(payload.timestamp) : new Date());
  const symbol = payload.symbol?.toUpperCase() ?? "GLOBAL";
  const market = payload.market?.toUpperCase() ?? "CRYPTO";
  const provider = payload.provider?.toUpperCase() ?? "HASHIBOT";
  const execMode = payload.executionMode ? `[${payload.executionMode.toUpperCase()}]` : "";

  // Dedicated Phase 7A-2A Content Types
  if (eventType === "MARKET_OUTLOOK") return renderMarketOutlookTemplate(payload);
  if (eventType === "NO_TRADE_EXPLANATION") return renderNoTradeTemplate(payload);
  if (eventType === "EDUCATIONAL_POST") return renderEducationalTemplate(payload);
  if (eventType === "WEEKLY_SUMMARY") return renderWeeklySummaryTemplate(payload);
  if (eventType === "MONTHLY_SUMMARY") return renderMonthlySummaryTemplate(payload);
  if (eventType === "FREE_SELECTED_SIGNAL" || (eventType.startsWith("SIGNAL_") && channelKey === "free")) {
    return renderFreeChannelSignalTemplate(payload);
  }

  // AI Analysis, Daily News & Intelligence Digest (Sent to both Free & VIP channels)
  if (
    eventType === "MORNING_BRIEF" ||
    eventType === "NEWS_DIGEST" ||
    eventType === "MARKET_WRAP" ||
    eventType === "AI_ANALYSIS" ||
    eventType === "WATCHLIST_PATTERN_UPDATE" ||
    eventType.startsWith("INTELLIGENCE_")
  ) {
    const isFree = channelKey === "free";
    const headerTitle =
      eventType.includes("MORNING_BRIEF") ? "🌅 HASHIBOT AI MORNING BRIEF" :
      eventType.includes("NEWS_DIGEST") ? "📰 HASHIBOT AI DAILY NEWS & MACRO DIGEST" :
      eventType.includes("MARKET_WRAP") ? "🌙 HASHIBOT AI EVENING MARKET WRAP" :
      eventType.includes("WATCHLIST_PATTERN") ? "📡 HASHIBOT AI WATCHLIST & PATTERN SCAN" :
      "🧠 HASHIBOT AI QUANTITATIVE MARKET INTELLIGENCE";

    const banner = isFree ? `\n\n${FREE_UPGRADE_BANNER}` : "";

    return [
      `*${headerTitle}*`,
      `*Market Focus:* ${escapeMarkdown(market)} & Global Macro`,
      `*Regime Classification:* ${escapeMarkdown(payload.regime ?? "HMM Continuous Trend Scanning")}`,
      payload.confidence ? `*AI Confidence Score:* ${payload.confidence}%` : null,
      ``,
      payload.details ? `${escapeMarkdown(payload.details)}` : null,
      payload.reason ? `\n*AI Key Insight:* ${escapeMarkdown(payload.reason)}` : null,
      banner,
      ``,
      `*Timestamp:* ${timeStr}`,
      `_Autonomous AI quantitative intelligence engine._`,
    ].filter(Boolean).join("\n");
  }

  // 1. SIGNALS GROUP TEMPLATES (VIP & Default)
  if (eventType.startsWith("SIGNAL_") || eventType === "NEW_SIGNAL") {
    const isFree = channelKey === "free";
    if (isFree) return renderFreeChannelSignalTemplate(payload);

    const assetEmoji = market === "FOREX" ? "💱" : market === "METALS" ? "🥇" : "⚡";
    const title = `${assetEmoji} HASHIBOT VIP ${payload.grade ?? "A+"} ${escapeMarkdown(market)} SIGNAL`;
    const directionEmoji = payload.direction?.toLowerCase() === "buy" ? "🟢 BUY" : "🔴 SELL";
    const entryRange = payload.entryLow && payload.entryHigh
      ? `${formatInstrumentPrice(payload.entryLow, payload.market, payload.symbol)} – ${formatInstrumentPrice(payload.entryHigh, payload.market, payload.symbol)}`
      : formatInstrumentPrice(payload.entryHigh ?? payload.entryLow, payload.market, payload.symbol);

    return [
      `*${title}*`,
      ``,
      `*Symbol:* ${escapeMarkdown(symbol)} [${escapeMarkdown(market)}]`,
      `*Direction:* ${directionEmoji}`,
      `*Entry Range:* ${entryRange}`,
      `*Stop Loss:* ${formatInstrumentPrice(payload.stopLoss, payload.market, payload.symbol)}`,
      `*Target 1 (50%):* ${formatInstrumentPrice(payload.tp1, payload.market, payload.symbol)}`,
      `*Target 2 (30%):* ${formatInstrumentPrice(payload.tp2, payload.market, payload.symbol)}`,
      payload.tp3 ? `*Target 3 (Runner 20%):* ${formatInstrumentPrice(payload.tp3, payload.market, payload.symbol)}` : null,
      `*Risk/Reward:* ${payload.riskReward ? payload.riskReward.toFixed(2) : "—"}R`,
      ``,
      `*Strategy:* ${escapeMarkdown(payload.strategyName ?? "Institutional Structure")}`,
      `*Regime:* ${escapeMarkdown(payload.regime ?? "Trending")}`,
      `*Confidence:* ${payload.confidence ? `${payload.confidence}%` : "—"}`,
      payload.reason ? `*Analysis:* ${escapeMarkdown(payload.reason)}` : null,
      ``,
      `🛡️ *Trade Management Plan:* On TP1 hit, Stop Loss automatically adjusts to Breakeven (+fees). Risk strictly 0.5%–1.0%.`,
      ``,
      `*Time:* ${timeStr}`,
      `_HashiBot VIP Institutional Execution._`,
    ].filter(Boolean).join("\n");
  }

  // 2. EXECUTION GROUP TEMPLATES (Admin & VIP Real-time Trade Updates)
  if (eventType.startsWith("EXECUTION_") || eventType.startsWith("POSITION_")) {
    const statusLabel = eventType.replace("EXECUTION_", "").replace("POSITION_", "");
    const isVip = channelKey === "vip";

    if (isVip) {
      const pnlStr = payload.realizedR !== undefined
        ? `\n*Realized Profit:* ${payload.realizedR >= 0 ? "🟢 +" : "🔴 "}${payload.realizedR.toFixed(2)}R`
        : "";
      return [
        `⚡ *VIP TRADE UPDATE: ${escapeMarkdown(symbol)}*`,
        ``,
        `*Action:* ${escapeMarkdown(statusLabel)}`,
        `*Market:* ${escapeMarkdown(market)}`,
        `*Direction:* ${escapeMarkdown(payload.direction?.toUpperCase() ?? "—")}`,
        payload.eventPrice ? `*Price:* ${formatInstrumentPrice(payload.eventPrice, payload.market, payload.symbol)}` : null,
        pnlStr,
        payload.details ? `*Status:* ${escapeMarkdown(payload.details)}` : null,
        ``,
        `*Time:* ${timeStr}`,
      ].filter(Boolean).join("\n");
    }

    return [
      `⚡ *EXECUTION NOTIFICATION (BACKEND)* ${execMode}`,
      ``,
      `*Status:* ${escapeMarkdown(statusLabel)}`,
      `*Provider:* ${escapeMarkdown(provider)}`,
      `*Symbol:* ${escapeMarkdown(symbol)} [${escapeMarkdown(market)}]`,
      `*Direction:* ${escapeMarkdown(payload.direction?.toUpperCase() ?? "—")}`,
      payload.eventPrice ? `*Execution Price:* ${formatInstrumentPrice(payload.eventPrice, payload.market, payload.symbol)}` : null,
      payload.realizedR !== undefined ? `*Realized PnL:* ${payload.realizedR >= 0 ? "+" : ""}${payload.realizedR.toFixed(2)}R` : null,
      payload.accountRef ? `*Account Ref:* ${escapeMarkdown(payload.accountRef)}` : null,
      payload.customerRef ? `*Customer Ref:* ${escapeMarkdown(maskCustomerRef(payload.customerRef))}` : null,
      payload.details ? `*Details:* ${escapeMarkdown(payload.details)}` : null,
      ``,
      `*Time:* ${timeStr}`,
      `_Verified execution backend truth event._`,
    ].filter(Boolean).join("\n");
  }

  // 3. PROTECTION GROUP TEMPLATES (BE Locks & Trailing Stops for VIP & Admin)
  if (eventType.startsWith("PROTECTION_") || eventType.includes("BREAK_EVEN") || eventType.includes("TRAILING_STOP") || eventType.includes("TP1_HIT") || eventType.includes("TP2_HIT")) {
    const isVip = channelKey === "vip";
    if (isVip) {
      return [
        `🛡️ *VIP TRADE MANAGEMENT ALERT: ${escapeMarkdown(symbol)}*`,
        ``,
        `*Update:* ${escapeMarkdown(eventType.replace(/_/g, " "))}`,
        payload.eventPrice ? `*Trigger Price:* ${formatInstrumentPrice(payload.eventPrice, payload.market, payload.symbol)}` : null,
        payload.stopLoss ? `*New Protected Stop:* ${formatInstrumentPrice(payload.stopLoss, payload.market, payload.symbol)}` : null,
        payload.details ? `*Action:* ${escapeMarkdown(payload.details)}` : `Stop Loss moved to Breakeven. Trade is now completely risk-free.`,
        ``,
        `*Time:* ${timeStr}`,
      ].filter(Boolean).join("\n");
    }

    return [
      `🛡️ *PROTECTION & RISK MANAGEMENT (BACKEND)*`,
      ``,
      `*Event:* ${escapeMarkdown(eventType)}`,
      `*Symbol:* ${escapeMarkdown(symbol)}`,
      payload.eventPrice ? `*Trigger Price:* ${formatInstrumentPrice(payload.eventPrice, payload.market, payload.symbol)}` : null,
      payload.stopLoss ? `*New SL Price:* ${formatInstrumentPrice(payload.stopLoss, payload.market, payload.symbol)}` : null,
      payload.accountRef ? `*Account:* ${escapeMarkdown(payload.accountRef)}` : null,
      payload.details ? `*Status:* ${escapeMarkdown(payload.details)}` : null,
      ``,
      `*Time:* ${timeStr}`,
    ].filter(Boolean).join("\n");
  }

  // 4. RECOVERY & SUPERVISOR TEMPLATES
  if (eventType.startsWith("RECOVERY_") || eventType.startsWith("SUPERVISOR_") || eventType.includes("ORPHAN_")) {
    return [
      `🚨 *HASHISUPERVISOR ALERT*`,
      ``,
      `*Event:* ${escapeMarkdown(eventType)}`,
      `*Severity:* ${escapeMarkdown(payload.severity ?? "HIGH")}`,
      `*Symbol:* ${escapeMarkdown(symbol)}`,
      `*Provider:* ${escapeMarkdown(provider)}`,
      payload.details ? `*Details:* ${escapeMarkdown(payload.details)}` : null,
      payload.warning ? `*Action Taken:* ${escapeMarkdown(payload.warning)}` : null,
      ``,
      `*Time:* ${timeStr}`,
      `_Operator attention required if marked CRITICAL._`,
    ].filter(Boolean).join("\n");
  }

  // 5. RISK LOCK & CAPITAL TEMPLATES
  if (eventType.startsWith("RISK_") || eventType.includes("LOCK") || eventType.includes("DRAWDOWN")) {
    return [
      `🛑 *RISK ENGINE INTERVENTION*`,
      ``,
      `*Event:* ${escapeMarkdown(eventType)}`,
      `*Provider / Account:* ${escapeMarkdown(provider)} ${payload.accountRef ? `(${escapeMarkdown(payload.accountRef)})` : ""}`,
      payload.details ? `*Reason:* ${escapeMarkdown(payload.details)}` : null,
      ``,
      `*Time:* ${timeStr}`,
      `_Risk controls applied automatically._`,
    ].filter(Boolean).join("\n");
  }

  // 6. DEFAULT OPERATIONAL DIGEST / GENERIC TEMPLATE
  return [
    `ℹ️ *HASHIBOT OPERATIONAL EVENT*`,
    ``,
    `*Event Type:* ${escapeMarkdown(eventType)}`,
    `*Source:* ${escapeMarkdown(provider)}`,
    payload.symbol ? `*Symbol:* ${escapeMarkdown(symbol)}` : null,
    payload.details ? `*Message:* ${escapeMarkdown(payload.details)}` : null,
    payload.warning ? `*Warning:* ${escapeMarkdown(payload.warning)}` : null,
    ``,
    `*Time:* ${timeStr}`,
  ].filter(Boolean).join("\n");
}

/**
 * Split text safely into chunks
 */
export function splitMessageSafely(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text];

  const lines = text.split("\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    if ((currentChunk + line + "\n").length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.map((chunk, index) => `${chunk}\n\n_(Part ${index + 1}/${chunks.length})_`);
}
