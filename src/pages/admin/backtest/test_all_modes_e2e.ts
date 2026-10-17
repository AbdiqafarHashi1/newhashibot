import { STRATEGY_DEFINITIONS, StrategyName } from '../StrategyConfig';
import { AssetCategory, AssetCapitalPool, MarketEnvironment, MultiAssetDatasetMap } from './types';
import { PIPELINE_UNIVERSE, generateSyntheticSessionData } from './syntheticData';
import { runSingleStrategyEngine, runMultiAssetPipelineEngine } from './simulationEngine';

// All 12 strategies
const ALL_STRATEGIES: StrategyName[] = [
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
];

const STRATEGY_ENV_MAP: Record<StrategyName, { symbol: string; category: AssetCategory; assetClass: string; pipOrPoint: number; defaultSpread: number; basePrice: number }> = {
  LondonBreakout: { symbol: 'EURUSD', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.0001, defaultSpread: 1.4, basePrice: 1.085 },
  NYContinuation: { symbol: 'EURUSD', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.0001, defaultSpread: 1.4, basePrice: 1.085 },
  FXTrendPullback: { symbol: 'GBPUSD', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.0001, defaultSpread: 1.8, basePrice: 1.275 },
  SessionORB: { symbol: 'EURUSD', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.0001, defaultSpread: 1.4, basePrice: 1.085 },
  FXMicroScalper: { symbol: 'EURUSD', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.0001, defaultSpread: 1.4, basePrice: 1.085 },
  MacroYieldDifferential: { symbol: 'USDJPY', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.01, defaultSpread: 1.5, basePrice: 152.0 },
  GoldVolatilityBreakout: { symbol: 'XAUUSD', category: 'metals', assetClass: 'metals_gold', pipOrPoint: 0.01, defaultSpread: 35.0, basePrice: 2480.0 },
  CryptoCompressionBreakout: { symbol: 'BTCUSDT', category: 'crypto', assetClass: 'crypto', pipOrPoint: 0.01, defaultSpread: 2.0, basePrice: 65000.0 },
  CryptoMicroScalper: { symbol: 'BTCUSDT', category: 'crypto', assetClass: 'crypto', pipOrPoint: 0.01, defaultSpread: 2.0, basePrice: 65000.0 },
  CryptoSwingContinuation: { symbol: 'ETHUSDT', category: 'crypto', assetClass: 'crypto', pipOrPoint: 0.01, defaultSpread: 0.35, basePrice: 3500.0 },
  CryptoMomentumBreakout: { symbol: 'SOLUSDT', category: 'crypto', assetClass: 'crypto', pipOrPoint: 0.01, defaultSpread: 0.05, basePrice: 150.0 },
  CryptoReversalExhaustion: { symbol: 'BTCUSDT', category: 'crypto', assetClass: 'crypto', pipOrPoint: 0.01, defaultSpread: 2.0, basePrice: 65000.0 },
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

const standardPools: Record<AssetCategory, AssetCapitalPool> = {
  forex: {
    category: 'forex',
    name: 'Forex Majors',
    symbol: 'EURUSD',
    capitalUsd: 100000,
    riskPct: 1.0,
    pipOrPointSize: 0.0001,
    spreadPipsOrPts: 1.2,
    decimals: 5,
    fridayClose: true,
    sessionFilter: true,
  },
  metals: {
    category: 'metals',
    name: 'Metals & Gold',
    symbol: 'XAUUSD',
    capitalUsd: 100000,
    riskPct: 1.0,
    pipOrPointSize: 0.01,
    spreadPipsOrPts: 30.0,
    decimals: 2,
    fridayClose: true,
    sessionFilter: false,
  },
  crypto: {
    category: 'crypto',
    name: 'Crypto Pool',
    symbol: 'BTCUSDT',
    capitalUsd: 100000,
    riskPct: 1.0,
    pipOrPointSize: 0.01,
    spreadPipsOrPts: 2.0,
    decimals: 2,
    fridayClose: false,
    sessionFilter: false,
  },
};

const HORIZONS = [
  { name: '7 Days', days: 7, bars: 672 },
  { name: '1 Month (30d)', days: 30, bars: 2880 },
  { name: '3 Months (90d)', days: 90, bars: 8640 },
  { name: '6 Months (180d)', days: 180, bars: 17280 },
  { name: '9 Months (270d)', days: 270, bars: 25920 },
];

async function runAllTests() {
  console.log('========================================================================');
  console.log('🧪 COMPREHENSIVE END-TO-END BACKTEST: ALL MODES ACROSS ALL HORIZONS');
  console.log('Horizons: 7 Days, 1 Month (30d), 3 Months (90d), 6 Months (180d), 9 Months (270d)');
  console.log('========================================================================\n');

  // -------------------------------------------------------------
  // MODE 1: SINGLE STRATEGY BENCHMARKS
  // -------------------------------------------------------------
  console.log('-------------------------------------------------------------');
  console.log('🎯 MODE 1: SINGLE STRATEGY LAB (12 STRATEGIES INDIVIDUALLY)');
  console.log('-------------------------------------------------------------');

  const singleFailures: string[] = [];

  for (const strat of ALL_STRATEGIES) {
    const info = STRATEGY_ENV_MAP[strat];
    const def = STRATEGY_DEFINITIONS[strat];
    const params = def?.defaultParams || {};
    const minScore = def?.defaultMeta?.min_score ?? 80;

    console.log(`\n▶ Strategy: ${strat} on ${info.symbol}`);

    for (const h of HORIZONS) {
      const candles = generateSyntheticSessionData(info.symbol, (info.category === 'forex' ? 'forex_majors' : info.category === 'metals' ? 'metals_gold' : 'crypto'), info.basePrice, h.bars, 15);
      const env: MarketEnvironment = {
        symbol: info.symbol,
        assetClass: info.category === 'forex' ? 'forex_majors' : info.category === 'metals' ? 'metals_gold' : 'crypto',
        pipOrPointSize: info.pipOrPoint,
        spreadPipsOrPts: info.defaultSpread,
        feePctPerSide: info.category === 'crypto' ? 0.04 : info.category === 'forex' ? 0.003 : 0.01,
        accountSizeUsd: 100000,
        riskPctPerTrade: 1.0,
        fridayWeekendClose: info.category !== 'crypto',
        enforceSessionWindows: info.category === 'forex',
      };

      const res = runSingleStrategyEngine(candles, strat, params, env, 24, minScore);
      const m = res.metrics;
      const isPass = m.winRate >= 50 && m.profitFactor >= 1.2 && m.netUsd > 0 && m.maxDrawdownPct <= 15;

      const status = isPass ? '✅ PASS' : '❌ FAIL';
      if (!isPass) {
        singleFailures.push(`${strat} [${h.name}]: WR=${m.winRate}%, PF=${m.profitFactor}, Net=$${m.netUsd.toLocaleString()}, DD=${m.maxDrawdownPct}%, Trades=${m.totalTrades}`);
      }

      console.log(`   [${h.name.padEnd(15)}] ${status} | Trades: ${String(m.totalTrades).padStart(4)} | WR: ${String(m.winRate).padStart(4)}% | PF: ${String(m.profitFactor).padStart(4)} | Net: +$${String(m.netUsd.toLocaleString()).padStart(11)} | MaxDD: ${m.maxDrawdownPct}%`);
    }
  }

  // -------------------------------------------------------------
  // MODE 2: MULTI-ASSET PIPELINE ARBITRATION BENCHMARKS
  // -------------------------------------------------------------
  console.log('\n-------------------------------------------------------------');
  console.log('⚡ MODE 2: MULTI-ASSET PIPELINE ARBITRATION ENGINE');
  console.log('-------------------------------------------------------------');

  const pipelineFailures: string[] = [];

  for (const h of HORIZONS) {
    const feeds = buildFeeds(h.bars);
    const res = runMultiAssetPipelineEngine(feeds, standardPools, ALL_STRATEGIES, {
      conflictPolicy: 'trend_priority',
      minScore: 80,
      maxConcurrentPositions: 4,
      enableWeights: true,
    });
    const m = res.metrics;
    const isPass = m.winRate >= 55 && m.profitFactor >= 1.3 && m.netUsd > 0 && m.maxDrawdownPct <= 10;
    const status = isPass ? '✅ PASS' : '❌ FAIL';

    if (!isPass) {
      pipelineFailures.push(`Pipeline [${h.name}]: WR=${m.winRate}%, PF=${m.profitFactor}, Net=$${m.netUsd.toLocaleString()}, DD=${m.maxDrawdownPct}%, Trades=${m.totalTrades}`);
    }

    console.log(`   [${h.name.padEnd(15)}] ${status} | Trades: ${String(m.totalTrades).padStart(4)} | WR: ${String(m.winRate).padStart(4)}% | PF: ${String(m.profitFactor).padStart(4)} | Net: +$${String(m.netUsd.toLocaleString()).padStart(12)} | MaxDD: ${m.maxDrawdownPct}%`);
  }

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n=============================================================');
  console.log('📊 TEST SUMMARY RESULTS');
  console.log('=============================================================');
  console.log(`Single Strategy Failures (${singleFailures.length}):`);
  singleFailures.forEach((f) => console.log(`   ❌ ${f}`));
  console.log(`\nPipeline Arbitration Failures (${pipelineFailures.length}):`);
  pipelineFailures.forEach((f) => console.log(`   ❌ ${f}`));
  console.log('=============================================================\n');
}

runAllTests().catch(console.error);
