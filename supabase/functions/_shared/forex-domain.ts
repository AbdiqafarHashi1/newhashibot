import type { StrategyCandle, StrategyIndicatorSnapshot } from "./professional-strategies.ts";
import { emaRootV1 } from "./indicator-engine.ts";

export const FOREX_INSTRUMENT_IDS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"] as const;
export type ForexInstrumentId = typeof FOREX_INSTRUMENT_IDS[number];
export type ForexAssetClass = "forex" | "gold";
export type ForexSessionName = "ASIA" | "LONDON" | "NEW_YORK" | "LONDON_NEW_YORK_OVERLAP" | "CLOSED";

export interface ForexInstrument {
  id: ForexInstrumentId;
  providerSymbol: string;
  displaySymbol: string;
  assetClass: ForexAssetClass;
  baseCurrency: string;
  quoteCurrency: string;
  pipSize: number;
  pointSize: number;
  pricePrecision: number;
  sessionTimezone: string;
  supportedTimeframes: readonly string[];
  productionEnabled: boolean;
}

export const FOREX_INSTRUMENTS: Readonly<Record<ForexInstrumentId, ForexInstrument>> = {
  EURUSD: { id: "EURUSD", providerSymbol: "EUR/USD", displaySymbol: "EUR/USD", assetClass: "forex", baseCurrency: "EUR", quoteCurrency: "USD", pipSize: .0001, pointSize: .00001, pricePrecision: 5, sessionTimezone: "Europe/London", supportedTimeframes: ["15m", "1h"], productionEnabled: true },
  GBPUSD: { id: "GBPUSD", providerSymbol: "GBP/USD", displaySymbol: "GBP/USD", assetClass: "forex", baseCurrency: "GBP", quoteCurrency: "USD", pipSize: .0001, pointSize: .00001, pricePrecision: 5, sessionTimezone: "Europe/London", supportedTimeframes: ["15m", "1h"], productionEnabled: true },
  USDJPY: { id: "USDJPY", providerSymbol: "USD/JPY", displaySymbol: "USD/JPY", assetClass: "forex", baseCurrency: "USD", quoteCurrency: "JPY", pipSize: .01, pointSize: .001, pricePrecision: 3, sessionTimezone: "Asia/Tokyo", supportedTimeframes: ["15m", "1h"], productionEnabled: true },
  AUDUSD: { id: "AUDUSD", providerSymbol: "AUD/USD", displaySymbol: "AUD/USD", assetClass: "forex", baseCurrency: "AUD", quoteCurrency: "USD", pipSize: .0001, pointSize: .00001, pricePrecision: 5, sessionTimezone: "Australia/Sydney", supportedTimeframes: ["15m", "1h"], productionEnabled: false },
  USDCAD: { id: "USDCAD", providerSymbol: "USD/CAD", displaySymbol: "USD/CAD", assetClass: "forex", baseCurrency: "USD", quoteCurrency: "CAD", pipSize: .0001, pointSize: .00001, pricePrecision: 5, sessionTimezone: "America/New_York", supportedTimeframes: ["15m", "1h"], productionEnabled: false },
  XAUUSD: { id: "XAUUSD", providerSymbol: "XAU/USD", displaySymbol: "XAU/USD", assetClass: "gold", baseCurrency: "XAU", quoteCurrency: "USD", pipSize: .1, pointSize: .01, pricePrecision: 2, sessionTimezone: "America/New_York", supportedTimeframes: ["15m", "1h"], productionEnabled: false },
};

export function normalizeForexInstrument(value: string): ForexInstrumentId | null {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(?:PRO|RAW)$/i, "");
  if (["GOLD", "XAUUSD", "XAUUSDM", "XAUUSDA"].includes(normalized)) return "XAUUSD";
  return FOREX_INSTRUMENT_IDS.find((id) => normalized === id || normalized === `${id}M` || normalized === `${id}A`) ?? null;
}

export function instrumentFor(value: string): ForexInstrument | null { const id = normalizeForexInstrument(value); return id ? FOREX_INSTRUMENTS[id] : null; }
export function roundInstrumentPrice(id: ForexInstrumentId, value: number): number { return Number(value.toFixed(FOREX_INSTRUMENTS[id].pricePrecision)); }
export function priceToPips(id: ForexInstrumentId, value: number): number { return value / FOREX_INSTRUMENTS[id].pipSize; }
export function pipsToPrice(id: ForexInstrumentId, value: number): number { return value * FOREX_INSTRUMENTS[id].pipSize; }

function zonedParts(at: Date, timeZone: string): { weekday: string; year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")), minute: Number(get("minute")) };
}

function sessionOpenAt(at: Date, timeZone: string, hour: number): string | null {
  const local = zonedParts(at, timeZone), targetWallClock = Date.UTC(local.year, local.month - 1, local.day, hour);
  const offsetAt = (instant: Date) => { const parts = zonedParts(instant, timeZone); return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant.getTime(); };
  let candidate = new Date(targetWallClock - offsetAt(new Date(Date.UTC(local.year, local.month - 1, local.day, 12))));
  candidate = new Date(targetWallClock - offsetAt(candidate));
  const verified = zonedParts(candidate, timeZone);
  return verified.year === local.year && verified.month === local.month && verified.day === local.day && verified.hour === hour && verified.minute === 0 ? candidate.toISOString() : null;
}

function sessionWindow(at: Date, timeZone: string, startHour: number, endHour: number): boolean {
  const part = zonedParts(at, timeZone); if (["Sat", "Sun"].includes(part.weekday)) return false;
  const clock = part.hour + part.minute / 60; return clock >= startHour && clock < endHour;
}

export function forexSession(at: string | Date): ForexSessionName {
  const date = typeof at === "string" ? new Date(at) : at;
  if (!Number.isFinite(date.getTime())) return "CLOSED";
  const london = sessionWindow(date, "Europe/London", 8, 16);
  const newYork = sessionWindow(date, "America/New_York", 8, 17);
  if (london && newYork) return "LONDON_NEW_YORK_OVERLAP";
  if (london) return "LONDON";
  if (newYork) return "NEW_YORK";
  const utc = zonedParts(date, "UTC");
  if (!["Sat", "Sun"].includes(utc.weekday) && utc.hour < 8) return "ASIA";
  return "CLOSED";
}

export function timeframeMilliseconds(timeframe: string): number | null {
  const match = /^(\d+)(m|h|d)$/.exec(timeframe); if (!match) return null;
  return Number(match[1]) * (match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000);
}

export interface ForexSpreadMetadata { model: "provider" | "estimated" | "unavailable"; spreadPrice: number | null; spreadPips: number | null; maximumPips: number; eligible: boolean; }
export interface ForexProviderCostMetadata { provider: string; requestCost: number; cacheHit: boolean; budgetRemaining: number | null; budgetEligible: boolean; }
export interface ForexMarketContext {
  instrument: ForexInstrument;
  symbol: ForexInstrumentId;
  timeframe: string;
  evaluatedAt: string;
  normalizedCandles: readonly StrategyCandle[];
  currentClosedCandle: StrategyCandle | null;
  previousClosedCandles: readonly StrategyCandle[];
  indicators: StrategyIndicatorSnapshot;
  ema200: number;
  session: ForexSessionName;
  sessionMetadata: { londonOpen: boolean; newYorkOpen: boolean; overlap: boolean; londonOpenAt: string | null; newYorkOpenAt: string | null; timezone: string };
  breakoutRange: { high: number; low: number; candles: number } | null;
  volatilityState: "LOW" | "NORMAL" | "HIGH" | "ABNORMAL";
  trendState: "UP" | "DOWN" | "FLAT";
  pullbackState: "CONTROLLED" | "EXTENDED" | "NONE";
  stale: boolean;
  malformed: boolean;
  marketOpen: boolean;
  spread: ForexSpreadMetadata;
  providerCost: ForexProviderCostMetadata;
  evidence: Record<string, unknown>;
}

export function buildForexMarketContext(input: { symbol: string; timeframe: string; candles: readonly StrategyCandle[]; indicators: StrategyIndicatorSnapshot; evaluatedAt: string; spreadPrice?: number | null; spreadModel?: ForexSpreadMetadata["model"]; maximumSpreadPips?: number; provider?: string; requestCost?: number; cacheHit?: boolean; budgetRemaining?: number | null }): ForexMarketContext | null {
  const instrument = instrumentFor(input.symbol); if (!instrument) return null;
  const interval = timeframeMilliseconds(input.timeframe); if (!interval) return null;
  const now = Date.parse(input.evaluatedAt);
  const normalized = input.candles.map((c) => ({ ...c, symbol: instrument.id, market_type: "forex", timeframe: input.timeframe })).filter((c) => Date.parse(c.open_time) + interval <= now).sort((a, b) => Date.parse(a.open_time) - Date.parse(b.open_time));
  const malformed = normalized.length === 0 || normalized.some((c, index) => ![c.open, c.high, c.low, c.close].every(Number.isFinite) || c.close <= 0 || c.low > Math.min(c.open, c.close) || c.high < Math.max(c.open, c.close) || c.high < c.low || (index > 0 && Date.parse(c.open_time) <= Date.parse(normalized[index - 1].open_time)));
  const current = normalized.at(-1) ?? null;
  const stale = !current || now - (Date.parse(current.open_time) + interval) > interval * 2;
  const closes = normalized.map((c) => c.close), ema200 = emaRootV1(closes, 200), price = current?.close ?? 0, atr = input.indicators.atr14;
  const trendState = input.indicators.ema20 > input.indicators.ema50 && price > input.indicators.ema20 ? "UP" : input.indicators.ema20 < input.indicators.ema50 && price < input.indicators.ema20 ? "DOWN" : "FLAT";
  const extension = atr > 0 ? Math.abs(price - input.indicators.ema20) / atr : Infinity;
  const pullbackState = trendState === "FLAT" ? "NONE" : extension <= .7 ? "CONTROLLED" : extension > 1.8 ? "EXTENDED" : "NONE";
  const ratio = price > 0 ? atr / price : Infinity;
  const gold = instrument.assetClass === "gold";
  const volatilityState = ratio < (gold ? .0007 : .00025) ? "LOW" : ratio > (gold ? .012 : .006) ? "ABNORMAL" : ratio > (gold ? .006 : .003) ? "HIGH" : "NORMAL";
  const session = forexSession(input.evaluatedAt);
  const rangeRows = normalized.slice(-49, -1); const breakoutRange = rangeRows.length ? { high: Math.max(...rangeRows.map((c) => c.high)), low: Math.min(...rangeRows.map((c) => c.low)), candles: rangeRows.length } : null;
  const spreadPrice = input.spreadPrice ?? null, spreadPips = spreadPrice === null ? null : priceToPips(instrument.id, spreadPrice), maximumPips = input.maximumSpreadPips ?? (gold ? 8 : 2.5);
  const spread: ForexSpreadMetadata = { model: input.spreadModel ?? (spreadPrice === null ? "unavailable" : "provider"), spreadPrice, spreadPips, maximumPips, eligible: spreadPips === null || spreadPips <= maximumPips };
  const budgetRemaining = input.budgetRemaining ?? null;
  const providerCost: ForexProviderCostMetadata = { provider: input.provider ?? "twelvedata", requestCost: input.requestCost ?? 1, cacheHit: input.cacheHit ?? false, budgetRemaining, budgetEligible: budgetRemaining === null || budgetRemaining >= (input.requestCost ?? 1) };
  const evaluationDate = new Date(input.evaluatedAt);
  return { instrument, symbol: instrument.id, timeframe: input.timeframe, evaluatedAt: input.evaluatedAt, normalizedCandles: normalized, currentClosedCandle: current, previousClosedCandles: normalized.slice(0, -1), indicators: input.indicators, ema200, session, sessionMetadata: { londonOpen: session === "LONDON" || session === "LONDON_NEW_YORK_OVERLAP", newYorkOpen: session === "NEW_YORK" || session === "LONDON_NEW_YORK_OVERLAP", overlap: session === "LONDON_NEW_YORK_OVERLAP", londonOpenAt: sessionOpenAt(evaluationDate, "Europe/London", 8), newYorkOpenAt: sessionOpenAt(evaluationDate, "America/New_York", 8), timezone: instrument.sessionTimezone }, breakoutRange, volatilityState, trendState, pullbackState, stale, malformed, marketOpen: session !== "CLOSED", spread, providerCost, evidence: { instrument_id: instrument.id, provider_symbol: instrument.providerSymbol, asset_class: instrument.assetClass, closed_candle_time: current?.open_time ?? null, candle_count: normalized.length, atr, ema20: input.indicators.ema20, ema50: input.indicators.ema50, ema200, rsi: input.indicators.rsi14, session, stale, malformed, spread_eligible: spread.eligible, provider_budget_eligible: providerCost.budgetEligible } };
}
