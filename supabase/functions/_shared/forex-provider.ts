import { instrumentFor, timeframeMilliseconds } from "./forex-domain.ts";
import type { StrategyCandle } from "./professional-strategies.ts";

export interface ForexCandleRequest { symbol: string; timeframe: string; limit: number; endAt?: string; }
export interface CandleGap { expectedOpenTime: string; nextOpenTime: string; missingBars: number; }
export interface ForexProviderDiagnostics { provider: string; ok: boolean; attempts: number; latencyMs: number; candleCount: number; gaps: readonly CandleGap[]; stale: boolean; degraded: boolean; error: string | null; checkedAt: string; }
export interface ForexProviderResult { candles: readonly StrategyCandle[]; diagnostics: ForexProviderDiagnostics; }
export interface ForexMarketDataProvider { readonly id: string; candles(request: ForexCandleRequest): Promise<ForexProviderResult>; }

export function detectCandleGaps(candles: readonly StrategyCandle[], timeframe: string): CandleGap[] {
  const interval = timeframeMilliseconds(timeframe); if (!interval) return [];
  const ordered = [...candles].sort((a, b) => Date.parse(a.open_time) - Date.parse(b.open_time));
  const gaps: CandleGap[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const previous = Date.parse(ordered[index - 1].open_time), next = Date.parse(ordered[index].open_time), missingBars = Math.round((next - previous) / interval) - 1;
    if (missingBars > 0) gaps.push({ expectedOpenTime: new Date(previous + interval).toISOString(), nextOpenTime: ordered[index].open_time, missingBars });
  }
  return gaps;
}

export interface TwelveDataProviderOptions { apiKey: string; fetcher?: typeof fetch; attempts?: number; timeoutMs?: number; now?: () => Date; }
export class TwelveDataForexProvider implements ForexMarketDataProvider {
  readonly id = "twelvedata";
  constructor(private readonly options: TwelveDataProviderOptions) {}
  async candles(request: ForexCandleRequest): Promise<ForexProviderResult> {
    const started = Date.now(), now = this.options.now?.() ?? new Date(), instrument = instrumentFor(request.symbol), interval = timeframeMilliseconds(request.timeframe);
    if (!instrument || !interval) return this.result([], 0, started, now, "unsupported_instrument_or_timeframe");
    const attempts = Math.max(1, this.options.attempts ?? 3), tdInterval = request.timeframe.replace("m", "min").replace("h", "h"); let error = "provider_unavailable";
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
        const url = new URL("https://api.twelvedata.com/time_series"); url.search = new URLSearchParams({ symbol: instrument.providerSymbol, interval: tdInterval, outputsize: String(Math.min(Math.max(request.limit, 2), 5000)), timezone: "UTC", format: "JSON", apikey: this.options.apiKey, ...(request.endAt ? { end_date: request.endAt } : {}) }).toString();
        const response = await (this.options.fetcher ?? fetch)(url, { signal: controller.signal }); clearTimeout(timer);
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.values)) throw new Error(String(payload.message ?? `http_${response.status}`));
        const candles = payload.values.map((row: Record<string, string>) => ({ symbol: instrument.id, market_type: "forex", timeframe: request.timeframe, open_time: /Z$|[+-]\d\d:\d\d$/.test(row.datetime) ? new Date(row.datetime).toISOString() : new Date(`${row.datetime.replace(" ", "T")}Z`).toISOString(), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume ?? 0), source: this.id })).filter((row: StrategyCandle) => [row.open, row.high, row.low, row.close].every(Number.isFinite) && row.low <= Math.min(row.open, row.close) && row.high >= Math.max(row.open, row.close)).sort((a: StrategyCandle, b: StrategyCandle) => Date.parse(a.open_time) - Date.parse(b.open_time));
        return this.result(candles, attempt, started, now, null);
      } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1))); }
    }
    return this.result([], attempts, started, now, error);
  }
  private result(candles: StrategyCandle[], attempts: number, started: number, now: Date, error: string | null): ForexProviderResult {
    const gaps = detectCandleGaps(candles, candles[0]?.timeframe ?? ""), interval = timeframeMilliseconds(candles[0]?.timeframe ?? ""), last = candles.at(-1), stale = Boolean(interval && last && now.getTime() - Date.parse(last.open_time) > interval * 3), degraded = Boolean(error || gaps.length || stale);
    return { candles, diagnostics: { provider: this.id, ok: !error && candles.length > 0 && !stale, attempts, latencyMs: Date.now() - started, candleCount: candles.length, gaps, stale, degraded, error, checkedAt: now.toISOString() } };
  }
}
