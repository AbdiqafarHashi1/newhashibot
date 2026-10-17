import { PIPELINE_UNIVERSE, generateSyntheticSessionData } from './syntheticData';
import { runMultiAssetPipelineEngine } from './simulationEngine';
import { STRATEGY_DEFINITIONS, StrategyName } from '../StrategyConfig';
import { AssetCategory, AssetCapitalPool } from './types';

const capitalPools: Record<AssetCategory, AssetCapitalPool> = {
  forex: {
    category: 'forex',
    name: 'forex', symbol: 'EURUSD', decimals: 5, sessionFilter: false,
    capitalUsd: 100000,
    riskPct: 1.0,
    spreadPipsOrPts: 1.2,
    pipOrPointSize: 0.0001,
    fridayClose: true,
  },
  metals: {
    category: 'metals',
    name: 'metals', symbol: 'XAUUSD', decimals: 2, sessionFilter: false,
    capitalUsd: 100000,
    riskPct: 1.0,
    spreadPipsOrPts: 2.5,
    pipOrPointSize: 0.1,
    fridayClose: true,
  },
  crypto: {
    category: 'crypto',
    name: 'crypto', symbol: 'BTCUSDT', decimals: 2, sessionFilter: false,
    capitalUsd: 100000,
    riskPct: 1.0,
    spreadPipsOrPts: 5.0,
    pipOrPointSize: 1.0,
    fridayClose: false,
  },
};

const activeStrategies = Object.keys(STRATEGY_DEFINITIONS) as StrategyName[];

import { MultiAssetDatasetMap, BtMetrics, CategorySummary, SymbolSummary, StrategyStat } from './types';

interface HorizonBest {
  horizon: { name: string; days: number; bars: number };
  config: { name: string; conflictPolicy: 'strict_no_conflict' | 'trend_priority'; minScore: number; maxConcurrentPositions: number; enableWeights: boolean };
  metrics: BtMetrics;
  categories: Record<string, CategorySummary>;
  symbols: Record<string, SymbolSummary>;
  strategyStats: StrategyStat[];
}

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

const configsToTest = [
  {
    name: 'Strict No Conflict (Score 80, 4 Concurrent, Weighted AI Multipliers)',
    conflictPolicy: 'strict_no_conflict' as const,
    minScore: 80,
    maxConcurrentPositions: 4,
    enableWeights: true,
  },
  {
    name: 'Strict No Conflict (Score 80, 3 Concurrent, Weighted AI Multipliers)',
    conflictPolicy: 'strict_no_conflict' as const,
    minScore: 80,
    maxConcurrentPositions: 3,
    enableWeights: true,
  },
  {
    name: 'Trend Priority (Score 82, 3 Concurrent, Weighted AI Multipliers)',
    conflictPolicy: 'trend_priority' as const,
    minScore: 82,
    maxConcurrentPositions: 3,
    enableWeights: true,
  },
  {
    name: 'High Quality Gate (Score 85, 3 Concurrent, Weighted AI Multipliers)',
    conflictPolicy: 'strict_no_conflict' as const,
    minScore: 85,
    maxConcurrentPositions: 3,
    enableWeights: true,
  },
];

const horizons = [
  { name: '30-Day Horizon', days: 30, bars: 2880 },
  { name: '60-Day Horizon', days: 60, bars: 5760 },
  { name: '90-Day Horizon', days: 90, bars: 8640 },
];

console.log('=== RUNNING MULTI-HORIZON PIPELINE BACKTEST & ARBITRATION BENCHMARK ===');

const allHorizonResults: Record<string, HorizonBest> = {};

for (const h of horizons) {
  console.log(`\n======================================================`);
  console.log(`📊 TESTING ${h.name.toUpperCase()} (${h.days} Days / ${h.bars} 15m Bars)`);
  console.log(`======================================================`);

  const feeds = buildFeeds(h.bars);
  let bestForHorizon: HorizonBest | null = null;
  let bestFitness = -Infinity;

  for (const cfg of configsToTest) {
    const res = runMultiAssetPipelineEngine(feeds, capitalPools, activeStrategies, cfg);
    const m = res.metrics;

    const fitness = m.profitFactor * (m.winRate / 100) * Math.sqrt(m.totalTrades) / (1 + (m.maxDrawdownPct || 0.1));
    console.log(`--> [${cfg.name}]`);
    console.log(`    Trades: ${m.totalTrades} | WinRate: ${m.winRate}% | PF: ${m.profitFactor} | Total R: +${m.totalR}R | Net USD: +$${m.netUsd.toLocaleString()} | MaxDD: ${m.maxDrawdownPct}%`);

    if (fitness > bestFitness) {
      bestFitness = fitness;
      bestForHorizon = {
        horizon: h,
        config: cfg,
        metrics: m,
        categories: res.categorySummaries,
        symbols: res.symbolSummaries,
        strategyStats: res.strategyStats,
      };
    }
  }

  if (bestForHorizon) {
    allHorizonResults[h.name] = bestForHorizon;

    console.log(`\n🏆 BEST OPTIMAL CONFIGURATION FOR ${h.name.toUpperCase()}:`);
    console.log(`   Config: ${bestForHorizon.config.name}`);
    console.log(`   Trades: ${bestForHorizon.metrics.totalTrades} | WinRate: ${bestForHorizon.metrics.winRate}% | Profit Factor: ${bestForHorizon.metrics.profitFactor} | Net: +$${bestForHorizon.metrics.netUsd.toLocaleString()} (+${bestForHorizon.metrics.totalR}R)`);
    console.log(`   Drawdown: ${bestForHorizon.metrics.maxDrawdownPct}% | TP1 Hits: ${bestForHorizon.metrics.tp1Hits} | TP2 Hits: ${bestForHorizon.metrics.tp2Hits} | Losses: ${bestForHorizon.metrics.losses}`);
    console.log(`   Category Performance:`);
    console.log(`     Forex  Pool ($100k): +$${bestForHorizon.categories.forex.netUsd.toLocaleString()} (+${bestForHorizon.categories.forex.returnPct}%) | WR: ${bestForHorizon.categories.forex.winRate}% | PF: ${bestForHorizon.categories.forex.profitFactor}`);
    console.log(`     Metals Pool ($100k): +$${bestForHorizon.categories.metals.netUsd.toLocaleString()} (+${bestForHorizon.categories.metals.returnPct}%) | WR: ${bestForHorizon.categories.metals.winRate}% | PF: ${bestForHorizon.categories.metals.profitFactor}`);
    console.log(`     Crypto Pool ($100k): +$${bestForHorizon.categories.crypto.netUsd.toLocaleString()} (+${bestForHorizon.categories.crypto.returnPct}%) | WR: ${bestForHorizon.categories.crypto.winRate}% | PF: ${bestForHorizon.categories.crypto.profitFactor}`);
    console.log(`   Instrument Performance:`);
    for (const [sym, s] of Object.entries(bestForHorizon.symbols as Record<string, SymbolSummary>)) {
      console.log(`     ${sym.padEnd(8)}: Trades: ${String(s.totalTrades).padStart(2)} | WR: ${String(s.winRate).padStart(4)}% | PF: ${String(s.profitFactor).padStart(4)} | Net: +$${String(s.netUsd.toLocaleString()).padStart(8)} | Alpha: ${s.alphaSharePct}%`);
    }
  }
}

console.log('\n=== COMPLETED ALL 30, 60, and 90 DAY BACKTESTS ===');
