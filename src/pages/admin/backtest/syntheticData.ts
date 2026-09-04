import { AssetClass, BtCandle, MultiAssetFeedItem, MultiAssetInstrument } from './types';

export function parseCandleCSV(csvText: string): { candles: BtCandle[]; error?: string } {
  try {
    const lines = csvText.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return { candles: [], error: 'CSV file is empty or missing data rows.' };

    const firstLine = lines[0].toLowerCase();
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
    const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));

    let timeIdx = headers.findIndex((h) => h.includes('time') || h.includes('date') || h.includes('timestamp'));
    let openIdx = headers.findIndex((h) => h === 'open' || h === 'o' || h.startsWith('open'));
    let highIdx = headers.findIndex((h) => h === 'high' || h === 'h' || h.startsWith('high'));
    let lowIdx = headers.findIndex((h) => h === 'low' || h === 'l' || h.startsWith('low'));
    let closeIdx = headers.findIndex((h) => h === 'close' || h === 'c' || h.startsWith('close'));
    let volIdx = headers.findIndex((h) => h === 'volume' || h === 'vol' || h === 'v' || h.startsWith('vol'));

    if (timeIdx === -1) timeIdx = 0;
    if (openIdx === -1) openIdx = 1;
    if (highIdx === -1) highIdx = 2;
    if (lowIdx === -1) lowIdx = 3;
    if (closeIdx === -1) closeIdx = 4;
    if (volIdx === -1) volIdx = headers.length > 5 ? 5 : -1;

    const candles: BtCandle[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length < 4) continue;

      const rawTime = parts[timeIdx] ?? `Bar-${i}`;
      let timeFormatted = rawTime;

      if (/^\d{10,13}$/.test(rawTime)) {
        const ms = rawTime.length === 10 ? Number(rawTime) * 1000 : Number(rawTime);
        timeFormatted = new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
      } else if (!isNaN(Date.parse(rawTime))) {
        timeFormatted = new Date(rawTime).toISOString().replace('T', ' ').slice(0, 19);
      }

      const open = parseFloat(parts[openIdx]);
      const high = parseFloat(parts[highIdx]);
      const low = parseFloat(parts[lowIdx]);
      const close = parseFloat(parts[closeIdx]);
      const volume = volIdx !== -1 && parts[volIdx] ? parseFloat(parts[volIdx]) : 100;

      if (!isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
        candles.push({
          time: timeFormatted,
          open,
          high,
          low,
          close,
          volume: isNaN(volume) ? 100 : volume,
        });
      }
    }

    if (candles.length < 20) {
      return { candles: [], error: `Found only ${candles.length} valid candles. Need at least 20 bars.` };
    }

    if (candles[0].time > candles[candles.length - 1].time) {
      candles.reverse();
    }

    return { candles };
  } catch (err: unknown) {
    return { candles: [], error: err instanceof Error ? err.message : 'Failed to parse CSV file.' };
  }
}

export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSyntheticSessionData(
  symbol: string,
  assetClass: AssetClass,
  basePrice: number,
  barsCount: number,
  timeframeMins: number,
  seedDate: Date = new Date('2026-08-30T12:00:00Z'),
  customSeed?: number
): BtCandle[] {
  const candles: BtCandle[] = [];
  let currentPrice = basePrice;
  const now = seedDate.getTime();
  const stepMs = timeframeMins * 60 * 1000;
  const startTime = now - barsCount * stepMs;

  const volatility =
    assetClass === 'crypto'
      ? 0.0035
      : assetClass === 'metals_gold'
      ? 0.0025
      : 0.0008;

  const isForex = assetClass === 'forex_majors' || assetClass === 'forex_crosses';
  const decimals = isForex ? (symbol.includes('JPY') ? 3 : 5) : 2;

  // Add deterministic seed variance by symbol name and base price
  const symbolSeed = symbol.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
  const initialSeed = ((customSeed ?? 1337) + symbolSeed + Math.floor(basePrice * 100)) >>> 0;
  const rng = createMulberry32(initialSeed);

  // Volatility clustering state (GARCH-like memory)
  let volClustering = 1.0;
  let prevReturn = 0;

  for (let i = 0; i < barsCount; i++) {
    const timeMs = startTime + i * stepMs;
    const date = new Date(timeMs);
    const hour = date.getUTCHours();
    const isLondon = hour >= 7 && hour <= 10;
    const isNY = hour >= 12 && hour <= 16;
    const isAsian = hour >= 0 && hour < 7;

    let sessionVol = volatility;
    if (isLondon) sessionVol *= 1.4;
    else if (isNY) sessionVol *= 1.6;
    else if (isAsian) sessionVol *= 0.6;

    // Autoregressive volatility clustering (persistence of high/low variance regimes)
    volClustering = 0.82 * volClustering + 0.18 * (0.6 + Math.abs(prevReturn) * 12);
    volClustering = Math.max(0.5, Math.min(2.5, volClustering));

    // Heavy-tailed shock / liquidity sweep (~2% probability)
    const isFatTailShock = rng() < 0.02;
    const shockMultiplier = isFatTailShock ? (1.8 + rng() * 1.4) : 1.0;

    const effectiveVol = sessionVol * volClustering * shockMultiplier;

    const phase = (i + symbolSeed) / 35;
    const drift = Math.sin(phase) * effectiveVol * 0.35;
    const randomMove = (rng() - 0.495) * 2 * effectiveVol;
    const delta = currentPrice * (drift + randomMove);
    prevReturn = delta / currentPrice;

    const open = currentPrice;
    const close = Math.max(open * 0.5, open + delta);
    const range = Math.abs(delta) + currentPrice * effectiveVol * (0.5 + rng());
    const high = Math.max(open, close) + range * rng() * 0.6;
    const low = Math.min(open, close) - range * rng() * 0.6;
    const volume = Math.floor(100 + rng() * 500 * (isLondon || isNY ? 2.5 : 1) * volClustering);

    candles.push({
      time: date.toISOString().replace('T', ' ').slice(0, 19),
      open: parseFloat(open.toFixed(decimals)),
      high: parseFloat(high.toFixed(decimals)),
      low: parseFloat(low.toFixed(decimals)),
      close: parseFloat(close.toFixed(decimals)),
      volume,
    });

    currentPrice = close;
  }

  return candles;
}

export const PIPELINE_UNIVERSE: MultiAssetInstrument[] = [
  // Forex Majors & Crosses
  {
    symbol: 'EURUSD',
    displayName: 'EUR/USD (Euro Major)',
    category: 'forex',
    assetClass: 'forex_majors',
    basePrice: 1.0854,
    pipOrPointSize: 0.0001,
    spreadPipsOrPts: 1.2,
    decimals: 5,
    fridayWeekendClose: true,
    enforceSessionWindows: true,
  },
  {
    symbol: 'GBPUSD',
    displayName: 'GBP/USD (Cable)',
    category: 'forex',
    assetClass: 'forex_majors',
    basePrice: 1.2950,
    pipOrPointSize: 0.0001,
    spreadPipsOrPts: 1.5,
    decimals: 5,
    fridayWeekendClose: true,
    enforceSessionWindows: true,
  },
  {
    symbol: 'USDJPY',
    displayName: 'USD/JPY (Dollar / Yen)',
    category: 'forex',
    assetClass: 'forex_majors',
    basePrice: 154.20,
    pipOrPointSize: 0.01,
    spreadPipsOrPts: 1.4,
    decimals: 3,
    fridayWeekendClose: true,
    enforceSessionWindows: true,
  },
  {
    symbol: 'AUDUSD',
    displayName: 'AUD/USD (Aussie Dollar)',
    category: 'forex',
    assetClass: 'forex_majors',
    basePrice: 0.6550,
    pipOrPointSize: 0.0001,
    spreadPipsOrPts: 1.4,
    decimals: 5,
    fridayWeekendClose: true,
    enforceSessionWindows: true,
  },
  // Precious Metals
  {
    symbol: 'XAUUSD',
    displayName: 'XAU/USD (Spot Gold)',
    category: 'metals',
    assetClass: 'metals_gold',
    basePrice: 2485.50,
    pipOrPointSize: 0.01,
    spreadPipsOrPts: 35.0,
    decimals: 2,
    fridayWeekendClose: true,
    enforceSessionWindows: false,
  },
  {
    symbol: 'XAGUSD',
    displayName: 'XAG/USD (Spot Silver)',
    category: 'metals',
    assetClass: 'metals_gold',
    basePrice: 29.40,
    pipOrPointSize: 0.001,
    spreadPipsOrPts: 2.5,
    decimals: 3,
    fridayWeekendClose: true,
    enforceSessionWindows: false,
  },
  // Crypto Perpetuals
  {
    symbol: 'BTCUSDT',
    displayName: 'BTC/USDT (Bitcoin Perp)',
    category: 'crypto',
    assetClass: 'crypto',
    basePrice: 88500.00,
    pipOrPointSize: 0.01,
    spreadPipsOrPts: 2.0,
    decimals: 2,
    fridayWeekendClose: false,
    enforceSessionWindows: false,
  },
  {
    symbol: 'ETHUSDT',
    displayName: 'ETH/USDT (Ethereum Perp)',
    category: 'crypto',
    assetClass: 'crypto',
    basePrice: 3200.00,
    pipOrPointSize: 0.01,
    spreadPipsOrPts: 0.5,
    decimals: 2,
    fridayWeekendClose: false,
    enforceSessionWindows: false,
  },
  {
    symbol: 'SOLUSDT',
    displayName: 'SOL/USDT (Solana Perp)',
    category: 'crypto',
    assetClass: 'crypto',
    basePrice: 185.00,
    pipOrPointSize: 0.01,
    spreadPipsOrPts: 0.08,
    decimals: 2,
    fridayWeekendClose: false,
    enforceSessionWindows: false,
  },
];

export const BUILTIN_DATASETS: Record<
  string,
  { label: string; assetClass: AssetClass; symbol: string; tf: string; basePrice: number; bars: number; tfMins: number }
> = {
  'eurusd-15m': { label: 'EUR/USD 15m (Forex London & NY)', assetClass: 'forex_majors', symbol: 'EURUSD', tf: '15m', basePrice: 1.0850, bars: 1200, tfMins: 15 },
  'gbpusd-15m': { label: 'GBP/USD 15m (Forex Volatility & Pullbacks)', assetClass: 'forex_majors', symbol: 'GBPUSD', tf: '15m', basePrice: 1.2950, bars: 1200, tfMins: 15 },
  'usdjpy-15m': { label: 'USD/JPY 15m (Forex Tokyo & NY Breakout)', assetClass: 'forex_majors', symbol: 'USDJPY', tf: '15m', basePrice: 154.20, bars: 1200, tfMins: 15 },
  'audusd-15m': { label: 'AUD/USD 15m (Forex Asian Trends)', assetClass: 'forex_majors', symbol: 'AUDUSD', tf: '15m', basePrice: 0.6550, bars: 1200, tfMins: 15 },
  'xauusd-15m': { label: 'XAU/USD 15m (Spot Gold 6h Box Breakouts)', assetClass: 'metals_gold', symbol: 'XAUUSD', tf: '15m', basePrice: 2485.50, bars: 1200, tfMins: 15 },
  'xagusd-15m': { label: 'XAG/USD 15m (Spot Silver Volatility)', assetClass: 'metals_gold', symbol: 'XAGUSD', tf: '15m', basePrice: 29.40, bars: 1200, tfMins: 15 },
  'btc-15m': { label: 'BTC/USDT 15m (Crypto Volatility & Compress)', assetClass: 'crypto', symbol: 'BTCUSDT', tf: '15m', basePrice: 88500, bars: 1200, tfMins: 15 },
  'eth-15m': { label: 'ETH/USDT 15m (Crypto Momentum & Scalp)', assetClass: 'crypto', symbol: 'ETHUSDT', tf: '15m', basePrice: 3200, bars: 1200, tfMins: 15 },
  'sol-15m': { label: 'SOL/USDT 15m (Crypto High Beta Expansion)', assetClass: 'crypto', symbol: 'SOLUSDT', tf: '15m', basePrice: 185, bars: 1200, tfMins: 15 },
};

/**
 * Creates full multi-asset feed dictionary containing all 9 instruments across
 * Forex, Metals, and Crypto universes with synchronized chronological timestamps.
 */
export function createDefaultMultiAssetFeeds(barsCount: number = 1200, tfMins: number = 15): Record<string, MultiAssetFeedItem> {
  const feeds: Record<string, MultiAssetFeedItem> = {};

  PIPELINE_UNIVERSE.forEach((inst) => {
    const candles = generateSyntheticSessionData(inst.symbol, inst.assetClass, inst.basePrice, barsCount, tfMins);
    feeds[inst.symbol] = {
      category: inst.category,
      symbol: inst.symbol,
      displayName: inst.displayName,
      assetClass: inst.assetClass,
      pipOrPointSize: inst.pipOrPointSize,
      spreadPipsOrPts: inst.spreadPipsOrPts,
      decimals: inst.decimals,
      fridayWeekendClose: inst.fridayWeekendClose,
      enforceSessionWindows: inst.enforceSessionWindows,
      candles,
      status: 'ready',
      source: 'preset',
      count: candles.length,
      lastUpdated: new Date().toISOString(),
    };
  });

  // Provide category shortcuts for backward compatibility
  if (feeds['EURUSD']) feeds['forex'] = { ...feeds['EURUSD'], symbol: 'EURUSD', displayName: 'Forex Majors (EUR/USD)' };
  if (feeds['XAUUSD']) feeds['metals'] = { ...feeds['XAUUSD'], symbol: 'XAUUSD', displayName: 'Metals & Gold (XAU/USD)' };
  if (feeds['BTCUSDT']) feeds['crypto'] = { ...feeds['BTCUSDT'], symbol: 'BTCUSDT', displayName: 'Crypto Pool (BTC/USDT)' };

  return feeds;
}

