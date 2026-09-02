import { PIPELINE_UNIVERSE, generateSyntheticSessionData } from './syntheticData';
import { runMultiAssetPipelineEngine } from './simulationEngine';
import { StrategyName } from '../StrategyConfig';
import { AssetCategory, AssetCapitalPool, MultiAssetDatasetMap } from './types';

const ASSET_CATEGORY_STRATEGIES: Record<string, StrategyName[]> = {
  all: [
    'LondonBreakout',
    'NYContinuation',
    'FXTrendPullback',
    'SessionORB',
    'FXMicroScalper',
    'GoldVolatilityBreakout',
    'MacroYieldDifferential',
    'CryptoCompressionBreakout',
    'CryptoMicroScalper',
    'CryptoSwingContinuation',
    'CryptoMomentumBreakout',
    'CryptoReversalExhaustion',
  ],
  forex: ['LondonBreakout', 'NYContinuation', 'FXTrendPullback', 'SessionORB', 'FXMicroScalper', 'MacroYieldDifferential'],
  metals: ['GoldVolatilityBreakout', 'MacroYieldDifferential'],
  crypto: ['CryptoCompressionBreakout', 'CryptoMicroScalper', 'CryptoSwingContinuation', 'CryptoMomentumBreakout', 'CryptoReversalExhaustion'],
};

const forexMetalsPools: Record<AssetCategory, AssetCapitalPool> = {
  forex: {
    category: 'forex',
    capitalUsd: 100000,
    riskPct: 1.0,
    maxDailyDrawdownPct: 5,
    maxOverallDrawdownPct: 10,
    spreadPipsOrPts: 1.2,
    pipOrPointSize: 0.0001,
    fridayClose: true,
  },
  metals: {
    category: 'metals',
    capitalUsd: 100000,
    riskPct: 1.0,
    maxDailyDrawdownPct: 5,
    maxOverallDrawdownPct: 10,
    spreadPipsOrPts: 2.5,
    pipOrPointSize: 0.1,
    fridayClose: true,
  },
  crypto: {
    category: 'crypto',
    capitalUsd: 0,
    riskPct: 0,
    maxDailyDrawdownPct: 5,
    maxOverallDrawdownPct: 10,
    spreadPipsOrPts: 5.0,
    pipOrPointSize: 1.0,
    fridayClose: false,
  },
};

const cryptoOnlyPools: Record<AssetCategory, AssetCapitalPool> = {
  forex: {
    category: 'forex',
    capitalUsd: 0,
    riskPct: 0,
    maxDailyDrawdownPct: 5,
    maxOverallDrawdownPct: 10,
    spreadPipsOrPts: 1.2,
    pipOrPointSize: 0.0001,
    fridayClose: true,
  },
  metals: {
    category: 'metals',
    capitalUsd: 0,
    riskPct: 0,
    maxDailyDrawdownPct: 5,
    maxOverallDrawdownPct: 10,
    spreadPipsOrPts: 2.5,
    pipOrPointSize: 0.1,
    fridayClose: true,
  },
  crypto: {
    category: 'crypto',
    capitalUsd: 100000,
    riskPct: 1.0,
    maxDailyDrawdownPct: 5,
    maxOverallDrawdownPct: 10,
    spreadPipsOrPts: 5.0,
    pipOrPointSize: 1.0,
    fridayClose: false,
  },
};

function buildFeeds(barCount: number): MultiAssetDatasetMap {
  const feeds: MultiAssetDatasetMap = {};
  for (const inst of PIPELINE_UNIVERSE) {
    const candles = generateSyntheticSessionData(inst.symbol, inst.assetClass, inst.basePrice, barCount, 15);
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
      count: candles.length,
      status: 'ready',
      source: 'session_engine',
      lastUpdated: new Date().toISOString(),
    };
  }
  feeds['forex'] = feeds['EURUSD'];
  feeds['metals'] = feeds['XAUUSD'];
  feeds['crypto'] = feeds['BTCUSDT'];
  return feeds;
}

const config = {
  conflictPolicy: 'trend_priority' as const,
  minScore: 82,
  maxConcurrentPositions: 3,
  enableWeights: true,
};

const horizons = [
  { name: '30-Day', bars: 2880 },
  { name: '60-Day', bars: 5760 },
  { name: '90-Day', bars: 8640 },
];

console.log('======================================================================');
console.log('🏛️ RUNNING ISOLATED BENCHMARK: FOREX/METALS (MT5) VS CRYPTO (EXCHANGES)');
console.log('======================================================================');

const cryptoStrategies = ASSET_CATEGORY_STRATEGIES['crypto'] as StrategyName[];
const forexMetalsStrategies = [
  ...(ASSET_CATEGORY_STRATEGIES['forex'] as StrategyName[]),
  ...(ASSET_CATEGORY_STRATEGIES['metals'] as StrategyName[]),
];

for (const h of horizons) {
  console.log(`\n-------------------------------------------------------------`);
  console.log(`⏱️ HORIZON: ${h.name.toUpperCase()} (${h.bars} 15-Minute Candles)`);
  console.log(`-------------------------------------------------------------`);

  const feeds = buildFeeds(h.bars);

  // 1. Run Forex & Metals (MT5 Customer Profile)
  const fxRes = runMultiAssetPipelineEngine(feeds, forexMetalsPools, forexMetalsStrategies, config);
  const fxM = fxRes.metrics;

  console.log(`\n📈 1. FOREX + METALS (MT5 / Prop Trader Account Profile):`);
  console.log(`   Capital Pool: $100,000 Forex + $100,000 Metals`);
  console.log(`   Total Trades: ${fxM.totalTrades} | Win Rate: ${fxM.winRate}% | Profit Factor: ${fxM.profitFactor}`);
  console.log(`   Total Net PnL: +$${fxM.netUsd.toLocaleString()} (+${fxM.totalR}R)`);
  console.log(`   Max Drawdown: ${fxM.maxDrawdownPct}% | TP1: ${fxM.tp1Hits} | TP2: ${fxM.tp2Hits} | Losses: ${fxM.losses}`);
  console.log(`   Instruments:`);
  for (const [sym, s] of Object.entries(fxRes.symbolSummaries)) {
    if (s.totalTrades > 0) {
      console.log(`     ${sym.padEnd(8)}: Trades: ${String(s.totalTrades).padStart(3)} | WR: ${String(s.winRate).padStart(4)}% | PF: ${String(s.profitFactor).padStart(4)} | Net: +$${String(s.netUsd.toLocaleString()).padStart(8)}`);
    }
  }

  // 2. Run Crypto Alone (Binance / Bybit Account Profile)
  const cryptoRes = runMultiAssetPipelineEngine(feeds, cryptoOnlyPools, cryptoStrategies, config);
  const crM = cryptoRes.metrics;

  console.log(`\n🚀 2. CRYPTO ONLY (Binance / Bybit / Exchange Account Profile):`);
  console.log(`   Capital Pool: $100,000 Crypto USDT Pool (24/7 Trading)`);
  console.log(`   Total Trades: ${crM.totalTrades} | Win Rate: ${crM.winRate}% | Profit Factor: ${crM.profitFactor}`);
  console.log(`   Total Net PnL: +$${crM.netUsd.toLocaleString()} (+${crM.totalR}R)`);
  console.log(`   Max Drawdown: ${crM.maxDrawdownPct}% | TP1: ${crM.tp1Hits} | TP2: ${crM.tp2Hits} | Losses: ${crM.losses}`);
  console.log(`   Instruments:`);
  for (const [sym, s] of Object.entries(cryptoRes.symbolSummaries)) {
    if (s.totalTrades > 0) {
      console.log(`     ${sym.padEnd(8)}: Trades: ${String(s.totalTrades).padStart(3)} | WR: ${String(s.winRate).padStart(4)}% | PF: ${String(s.profitFactor).padStart(4)} | Net: +$${String(s.netUsd.toLocaleString()).padStart(8)}`);
    }
  }
}
