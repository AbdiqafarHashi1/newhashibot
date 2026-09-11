import type { CanonicalCandle, DataQualityClassification, HistoricalDataQualityReport, HistoricalRange, HistoricalTimeframe } from './types';

export const TIMEFRAME_MS: Record<HistoricalTimeframe, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

export function missingRanges(bars: CanonicalCandle[], from: number, to: number, timeframe: HistoricalTimeframe, isExpected: (timestamp:number)=>boolean=()=>true): HistoricalRange[] {
  const step = TIMEFRAME_MS[timeframe];
  const present = new Set(bars.filter(b => b.timestamp >= from && b.timestamp <= to).map(b => b.timestamp));
  const result: HistoricalRange[] = [];
  let start: number | undefined;
  for (let t = from; t <= to; t += step) {
    if (!isExpected(t)) { if(start!==undefined){result.push({from:start,to:t-step});start=undefined;} continue; }
    if (!present.has(t) && start === undefined) start = t;
    if (present.has(t) && start !== undefined) { result.push({ from: start, to: t - step }); start = undefined; }
  }
  if (start !== undefined) result.push({ from: start, to });
  return result;
}

export function mergeRanges(ranges: HistoricalRange[], step = 1): HistoricalRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  return sorted.reduce<HistoricalRange[]>((out, range) => {
    const last = out[out.length - 1];
    if (last && range.from <= last.to + step) last.to = Math.max(last.to, range.to);
    else out.push({ ...range });
    return out;
  }, []);
}

export function normalizeAndValidate(
  input: CanonicalCandle[], timeframe: HistoricalTimeframe, requested: HistoricalRange,
  classification: DataQualityClassification = 'RESEARCH', now = Date.now(), isExpected:(timestamp:number)=>boolean=()=>true,
): { bars: CanonicalCandle[]; quality: HistoricalDataQualityReport } {
  let invalidBars = 0, duplicates = 0, outOfOrder = 0;
  const unique = new Map<number, CanonicalCandle>();
  input.forEach((bar, index) => {
    const numbers = [bar.timestamp, bar.open, bar.high, bar.low, bar.close];
    if (!numbers.every(Number.isFinite) || bar.timestamp <= 0 || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) { invalidBars++; return; }
    if (index && bar.timestamp < input[index - 1].timestamp) outOfOrder++;
    if (unique.has(bar.timestamp)) duplicates++;
    unique.set(bar.timestamp, { ...bar, timestamp: Math.trunc(bar.timestamp) });
  });
  const bars = [...unique.values()].sort((a, b) => a.timestamp - b.timestamp);
  const unrealisticJumps=bars.slice(1).filter((bar,index)=>Math.abs(bar.open-bars[index].close)/Math.max(Math.abs(bars[index].close),Number.EPSILON)>.25).length;
  const missing = missingRanges(bars, requested.from, requested.to, timeframe,isExpected);
  let expectedClosures=0;for(let t=requested.from;t<=requested.to;t+=TIMEFRAME_MS[timeframe])if(!isExpected(t))expectedClosures++;
  const expected = Math.max(1, Math.floor((requested.to - requested.from) / TIMEFRAME_MS[timeframe]) + 1);
  const penalties = invalidBars * 5 + duplicates + outOfOrder + (missing.reduce((n, r) => n + Math.floor((r.to-r.from)/TIMEFRAME_MS[timeframe])+1, 0) / expected) * 100;
  return { bars, quality: { duplicates, invalidBars, outOfOrder, missingRanges: missing, staleFinalBar: Boolean(bars.length && now - bars[bars.length - 1].timestamp > TIMEFRAME_MS[timeframe] * 2 && requested.to >= now - TIMEFRAME_MS[timeframe] * 2), score: Math.max(0, Math.round(100 - penalties-unrealisticJumps*5)), classification,expectedClosures,unknownSessionIntervals:0,unrealisticJumps,timezoneConsistent:bars.every(bar=>Number.isInteger(bar.timestamp)),sourceContinuous:true } };
}

export function historicalQualityGate(quality:HistoricalDataQualityReport):{status:'PASS'|'WARNING'|'FAIL';reasons:string[]}{const reasons:string[]=[];if(quality.invalidBars)reasons.push('INVALID_OHLC_OR_NON_FINITE');if(quality.duplicates)reasons.push('DUPLICATE_TIMESTAMPS');if(quality.outOfOrder)reasons.push('OUT_OF_ORDER');if(quality.missingRanges.length)reasons.push('MISSING_OR_LARGE_GAPS');if(quality.unrealisticJumps)reasons.push('UNREALISTIC_PRICE_JUMPS');if(quality.timezoneConsistent===false)reasons.push('TIMEZONE_INCONSISTENT');if(quality.sourceContinuous===false)reasons.push('SOURCE_DISCONTINUITY');if(quality.staleFinalBar)reasons.push('STALE_FINAL_BAR');const fail=quality.invalidBars>0||quality.score<50||quality.timezoneConsistent===false;return {status:fail?'FAIL':reasons.length?'WARNING':'PASS',reasons};}
