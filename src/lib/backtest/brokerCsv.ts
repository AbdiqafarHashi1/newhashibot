export interface ImportedOhlcvCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MultiAssetParsedCandles {
  isMultiSymbol: boolean;
  feedsBySymbol: Record<string, ImportedOhlcvCandle[]>;
}

export interface InstrumentSpec {
  symbol: string;
  displayName: string;
  category: 'forex' | 'metals' | 'crypto';
  pipOrPointSize: number;
  spreadPipsOrPts: number;
  decimals: number;
  fridayWeekendClose: boolean;
  enforceSessionWindows: boolean;
}

export function detectInstrumentSpec(rawSymbol: string): InstrumentSpec {
  const sym = rawSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (sym.includes('XAU') || sym.includes('GOLD')) {
    return {
      symbol: 'XAUUSD',
      displayName: 'Gold / USD (Metals)',
      category: 'metals',
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 30.0,
      decimals: 2,
      fridayWeekendClose: true,
      enforceSessionWindows: false,
    };
  }
  if (sym.includes('XAG') || sym.includes('SILVER')) {
    return {
      symbol: 'XAGUSD',
      displayName: 'Silver / USD (Metals)',
      category: 'metals',
      pipOrPointSize: 0.001,
      spreadPipsOrPts: 3.5,
      decimals: 3,
      fridayWeekendClose: true,
      enforceSessionWindows: false,
    };
  }
  if (sym.includes('BTC')) {
    return {
      symbol: 'BTCUSDT',
      displayName: 'BTC/USDT Perpetual',
      category: 'crypto',
      pipOrPointSize: 0.1,
      spreadPipsOrPts: 2.0,
      decimals: 2,
      fridayWeekendClose: false,
      enforceSessionWindows: false,
    };
  }
  if (sym.includes('ETH')) {
    return {
      symbol: 'ETHUSDT',
      displayName: 'ETH/USDT Perpetual',
      category: 'crypto',
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 0.25,
      decimals: 2,
      fridayWeekendClose: false,
      enforceSessionWindows: false,
    };
  }
  if (sym.includes('SOL') || sym.includes('BNB') || sym.includes('XRP') || sym.includes('USDT')) {
    return {
      symbol: sym,
      displayName: `${sym} Perpetual`,
      category: 'crypto',
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 0.1,
      decimals: 2,
      fridayWeekendClose: false,
      enforceSessionWindows: false,
    };
  }
  if (sym.includes('JPY')) {
    return {
      symbol: sym,
      displayName: `${sym.slice(0, 3)}/${sym.slice(3, 6)} Spot`,
      category: 'forex',
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 1.4,
      decimals: 3,
      fridayWeekendClose: true,
      enforceSessionWindows: true,
    };
  }
  // Standard Forex (EURUSD, GBPUSD, AUDUSD, NZDUSD, etc.)
  return {
    symbol: sym.length >= 6 ? sym.slice(0, 6) : (sym || 'EURUSD'),
    displayName: sym.length >= 6 ? `${sym.slice(0, 3)}/${sym.slice(3, 6)} Spot` : sym,
    category: 'forex',
    pipOrPointSize: 0.0001,
    spreadPipsOrPts: 1.2,
    decimals: 5,
    fridayWeekendClose: true,
    enforceSessionWindows: true,
  };
}

const HEADER_ALIASES: Record<string, string[]> = {
  symbol: ['symbol', 'sym', 'pair', 'ticker', 'instrument', 'asset', 'market'],
  date: ['date'],
  time: ['time', 'timestamp', 'datetime', 'date time'],
  open: ['open', 'o'],
  high: ['high', 'h'],
  low: ['low', 'l'],
  close: ['close', 'c'],
  volume: ['volume', 'vol', 'tickvol', 'tick volume', 'real volume'],
};

function parseRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim()); cell = '';
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function detectDelimiter(header: string): string {
  const candidates = [',', ';', '\t'];
  return candidates.reduce((best, candidate) =>
    parseRow(header, candidate).length > parseRow(header, best).length ? candidate : best, ',');
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/[<>]/g, '').replace(/^['"]|['"]$/g, '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function indexFor(headers: string[], field: keyof typeof HEADER_ALIASES): number {
  return headers.findIndex((header) => HEADER_ALIASES[field].includes(header));
}

function numberValue(value: string | undefined): number {
  if (!value) return Number.NaN;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  return Number(normalized);
}

/** Converts common broker timestamps to a timezone-explicit, sortable UTC ISO value. */
export function normalizeBrokerTimestamp(date: string, time?: string): string | null {
  const raw = `${date || ''} ${time || ''}`.trim();
  if (!raw) return null;
  const normalized = raw.replace(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/, '$1-$2-$3');
  const isoLike = normalized.includes('T') ? normalized : normalized.replace(/\s+/, 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}Z`;
  const milliseconds = Date.parse(withZone);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function parseBrokerOhlcv(text: string): ImportedOhlcvCandle[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV must include a header and at least one OHLC row');
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], delimiter).map(normalizeHeader);
  const dateIndex = indexFor(headers, 'date');
  const timeIndex = indexFor(headers, 'time');
  const openIndex = indexFor(headers, 'open');
  const highIndex = indexFor(headers, 'high');
  const lowIndex = indexFor(headers, 'low');
  const closeIndex = indexFor(headers, 'close');
  const volumeIndex = indexFor(headers, 'volume');
  if ([openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) throw new Error('CSV needs open, high, low, and close columns');
  if (dateIndex < 0 && timeIndex < 0) throw new Error('CSV needs a date, time, timestamp, or datetime column');

  const candles = lines.slice(1).map((line) => {
    const row = parseRow(line, delimiter);
    const timestamp = normalizeBrokerTimestamp(dateIndex >= 0 ? row[dateIndex] : row[timeIndex], dateIndex >= 0 && timeIndex >= 0 ? row[timeIndex] : undefined);
    return { time: timestamp ?? '', open: numberValue(row[openIndex]), high: numberValue(row[highIndex]), low: numberValue(row[lowIndex]), close: numberValue(row[closeIndex]), volume: volumeIndex >= 0 ? numberValue(row[volumeIndex]) : 0 };
  }).filter((candle) => candle.time && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) && candle.high >= candle.low && candle.high >= candle.open && candle.high >= candle.close && candle.low <= candle.open && candle.low <= candle.close);
  if (candles.length === 0) throw new Error('CSV contains no valid OHLC rows; check its delimiter, date format, and price columns');
  candles.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return candles;
}

export function parseMultiAssetBrokerOhlcv(text: string): MultiAssetParsedCandles {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV must include a header and at least one OHLC row');
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], delimiter).map(normalizeHeader);
  const symbolIndex = indexFor(headers, 'symbol');
  const dateIndex = indexFor(headers, 'date');
  const timeIndex = indexFor(headers, 'time');
  const openIndex = indexFor(headers, 'open');
  const highIndex = indexFor(headers, 'high');
  const lowIndex = indexFor(headers, 'low');
  const closeIndex = indexFor(headers, 'close');
  const volumeIndex = indexFor(headers, 'volume');

  if ([openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) {
    throw new Error('CSV needs open, high, low, and close columns');
  }
  if (dateIndex < 0 && timeIndex < 0) {
    throw new Error('CSV needs a date, time, timestamp, or datetime column');
  }

  // If a Symbol column exists in the CSV, group candles by symbol
  if (symbolIndex >= 0) {
    const feedsBySymbol: Record<string, ImportedOhlcvCandle[]> = {};
    for (let i = 1; i < lines.length; i++) {
      const row = parseRow(lines[i], delimiter);
      const rawSym = (row[symbolIndex] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!rawSym || rawSym.length < 2) continue;

      const timestamp = normalizeBrokerTimestamp(
        dateIndex >= 0 ? row[dateIndex] : row[timeIndex],
        dateIndex >= 0 && timeIndex >= 0 ? row[timeIndex] : undefined
      );
      if (!timestamp) continue;

      const open = numberValue(row[openIndex]);
      const high = numberValue(row[highIndex]);
      const low = numberValue(row[lowIndex]);
      const close = numberValue(row[closeIndex]);
      const volume = volumeIndex >= 0 ? numberValue(row[volumeIndex]) : 0;

      if (
        ![open, high, low, close].every(Number.isFinite) ||
        high < low ||
        high < open ||
        high < close ||
        low > open ||
        low > close
      ) {
        continue;
      }

      if (!feedsBySymbol[rawSym]) feedsBySymbol[rawSym] = [];
      feedsBySymbol[rawSym].push({ time: timestamp, open, high, low, close, volume });
    }

    const detectedSymbols = Object.keys(feedsBySymbol).filter((s) => feedsBySymbol[s].length >= 10);
    if (detectedSymbols.length > 0) {
      detectedSymbols.forEach((sym) => {
        feedsBySymbol[sym].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
      });
      return {
        isMultiSymbol: detectedSymbols.length > 1,
        feedsBySymbol,
      };
    }
  }

  // Fallback to standard single symbol parsing
  const singleCandles = parseBrokerOhlcv(text);
  return {
    isMultiSymbol: false,
    feedsBySymbol: { DEFAULT: singleCandles },
  };
}

export function generateSampleCombinedCsv(): string {
  return [
    'Symbol,Date,Time,Open,High,Low,Close,Volume',
    'EURUSD,2026-03-01,08:00:00,1.08500,1.08550,1.08480,1.08530,1240',
    'EURUSD,2026-03-01,08:15:00,1.08530,1.08590,1.08510,1.08580,1530',
    'XAUUSD,2026-03-01,08:00:00,2850.50,2854.20,2849.10,2853.80,680',
    'XAUUSD,2026-03-01,08:15:00,2853.80,2856.40,2852.30,2855.90,820',
    'BTCUSDT,2026-03-01,08:00:00,88500.00,88750.00,88420.00,88680.00,45',
    'BTCUSDT,2026-03-01,08:15:00,88680.00,88920.00,88600.00,88840.00,58',
  ].join('\n');
}
