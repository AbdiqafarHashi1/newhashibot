import { generateSyntheticSessionData } from './syntheticData';
import { runSingleStrategyEngine } from './simulationEngine';
import { MarketEnvironment } from './types';

// Let's test different reversal formulations
const HORIZONS = [
  { name: '7 Days', bars: 672 },
  { name: '1 Month', bars: 2880 },
  { name: '3 Months', bars: 8640 },
  { name: '6 Months', bars: 17280 },
  { name: '9 Months', bars: 25920 },
];

const env: MarketEnvironment = {
  symbol: 'BTCUSDT',
  assetClass: 'crypto',
  pipOrPointSize: 0.01,
  spreadPipsOrPts: 2.0,
  feePctPerSide: 0.04,
  accountSizeUsd: 100000,
  riskPctPerTrade: 1.0,
  fridayWeekendClose: false,
  enforceSessionWindows: false,
};

for (const h of HORIZONS) {
  const candles = generateSyntheticSessionData('BTCUSDT', 'crypto', 65000, h.bars, 15);
  const res = runSingleStrategyEngine(candles, 'CryptoReversalExhaustion', {
    exhaustion_threshold: 75,
    stop_atr_mult: 1.4,
    tp1_r: 1.3,
    tp2_r: 2.2,
  }, env, 24, 75);
  const m = res.metrics;
  console.log(`[${h.name}] Trades: ${m.totalTrades} | WR: ${m.winRate}% | PF: ${m.profitFactor} | Net: $${m.netUsd.toLocaleString()} | DD: ${m.maxDrawdownPct}%`);
}
