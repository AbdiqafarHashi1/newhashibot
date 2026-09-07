export interface ImportedOhlcvCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const HEADER_ALIASES: Record<string, string[]> = {
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
  const normalized = raw.replace(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})/, '$1-$2-$3');
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
