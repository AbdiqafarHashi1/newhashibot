import { STRATEGY_DEFINITIONS, StrategyName } from '../StrategyConfig';
import { generateSyntheticSessionData } from './syntheticData';
import { runSingleStrategyEngine } from './simulationEngine';
import { MarketEnvironment } from './types';

const CRYPTO_STRATS: StrategyName[] = [
  'CryptoMicroScalper',
  'CryptoSwingContinuation',
  'CryptoMomentumBreakout',
  'CryptoReversalExhaustion',
];

const HORIZONS = [
  { name: '7 Days', days: 7, bars: 672 },
  { name: '1 Month (30d)', days: 30, bars: 2880 },
  { name: '3 Months (90d)', days: 90, bars: 8640 },
  { name: '6 Months (180d)', days: 180, bars: 17280 },
  { name: '9 Months (270d)', days: 270, bars: 25920 },
];

for (const strat of CRYPTO_STRATS) {
  const def = STRATEGY_DEFINITIONS[strat];
  const params = def?.defaultParams || {};
  const minScore = def?.defaultMeta?.min_score ?? 80;
  console.log(`\n▶ Strategy: ${strat}`);

  for (const h of HORIZONS) {
    const candles = generateSyntheticSessionData('BTCUSDT', 'crypto', 65000, h.bars, 15);
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

    const res = runSingleStrategyEngine(candles, strat, params, env, 24, minScore);
    const m = res.metrics;
    const isPass = m.winRate >= 50 && m.profitFactor >= 1.15 && m.netUsd > 0 && m.maxDrawdownPct <= 15;
    const status = isPass ? '✅ PASS' : '❌ FAIL';
    console.log(`   [${h.name.padEnd(15)}] ${status} | Trades: ${String(m.totalTrades).padStart(4)} | WR: ${String(m.winRate).padStart(4)}% | PF: ${String(m.profitFactor).padStart(4)} | Net: +$${String(m.netUsd.toLocaleString()).padStart(11)} | MaxDD: ${m.maxDrawdownPct}%`);
  }
}
