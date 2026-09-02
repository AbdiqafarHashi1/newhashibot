import { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import {
  Play,
  Sliders,
  Activity,
  Filter,
  TrendingUp,
  Cpu,
  Layers3,
  Trophy,
} from 'lucide-react';
import { STRATEGY_DEFINITIONS, StrategyName } from './StrategyConfig';
import {
  AssetCategory,
  AssetCapitalPool,
  MultiAssetFeedItem,
  BtTrade,
  BtMetrics,
  ArbitrationEvent,
  StrategyContributionStat,
  CategoryPerformanceSummary,
  SymbolPerformanceSummary,
  STRATEGY_ASSET_MAP,
  DATE_RANGE_OPTIONS,
  AICalibrationReport,
  StrategyTweakProposal,
} from './backtest/types';
import {
  createDefaultMultiAssetFeeds,
  generateSyntheticSessionData,
  PIPELINE_UNIVERSE,
} from './backtest/syntheticData';
import {
  runMultiAssetPipelineEngine,
  generateAICalibrationReport,
} from './backtest/simulationEngine';
import { MultiAssetDataManager } from './backtest/MultiAssetDataManager';
import { CapitalPoolManager } from './backtest/CapitalPoolManager';
import { CategoryScorecards } from './backtest/CategoryScorecards';
import { AICalibrationPanel } from './backtest/AICalibrationPanel';
import { SingleStrategyLab } from './backtest/SingleStrategyLab';
import { PropClearanceLab } from './backtest/PropClearanceLab';
import { KnowledgeGuide } from './backtest/KnowledgeGuide';
import {
  CalibrationPreset,
  getSavedPresets,
  saveNewPreset,
  deleteUserPreset,
  getActivePresetId,
  setActivePresetId,
  saveSingleStrategyConfig,
  BASE_DEFAULT_PRESET,
  deployPresetToLiveStrategyConfigs,
} from './backtest/presetStorage';

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

export default function BacktestLab() {
  // Mode Selection: Single Strategy vs Multi-Asset Pipeline vs Institutional Prop Clearance
  const [backtestMode, setBacktestMode] = useState<'single_strategy' | 'pipeline_arbitration' | 'prop_firm_clearance'>('pipeline_arbitration');

  // ─── Multi-Asset Pipeline State ─────────────────────────────────────────────
  const [multiAssetFeeds, setMultiAssetFeeds] = useState<Record<string, MultiAssetFeedItem>>(createDefaultMultiAssetFeeds);
  const [capitalPools, setCapitalPools] = useState<Record<AssetCategory, AssetCapitalPool>>({
    forex: {
      category: 'forex',
      name: 'Forex Majors',
      symbol: 'EURUSD',
      capitalUsd: 10000,
      riskPct: 1.0,
      pipOrPointSize: 0.0001,
      spreadPipsOrPts: 1.4,
      decimals: 5,
      fridayClose: true,
      sessionFilter: true,
    },
    metals: {
      category: 'metals',
      name: 'Metals & Gold',
      symbol: 'XAUUSD',
      capitalUsd: 5000,
      riskPct: 1.0,
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 35.0,
      decimals: 2,
      fridayClose: true,
      sessionFilter: false,
    },
    crypto: {
      category: 'crypto',
      name: 'Crypto Pool',
      symbol: 'BTCUSDT',
      capitalUsd: 10000,
      riskPct: 1.0,
      pipOrPointSize: 0.01,
      spreadPipsOrPts: 2.0,
      decimals: 2,
      fridayClose: false,
      sessionFilter: false,
    },
  });

  // Date Range Scope & History Horizon
  const [selectedRange, setSelectedRange] = useState<string>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-08-01');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-08-30');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('15m');
  const [historyDepthBars, setHistoryDepthBars] = useState<number>(2500);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);

  // Calibration Presets State
  const [savedPresets, setSavedPresets] = useState<CalibrationPreset[]>(() => getSavedPresets());
  const [activePresetId, setActivePresetIdState] = useState<string>(() => getActivePresetId());

  // Strategy Pool & Arbitration Configuration
  const [pipelineCategory, setPipelineCategory] = useState<string>('all');
  const [enabledPipelineStrategies, setEnabledPipelineStrategies] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    ASSET_CATEGORY_STRATEGIES.all.forEach((s) => {
      init[s] = true;
    });
    return init;
  });

  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState<number>(3);
  const [minArbitrationScore, setMinArbitrationScore] = useState<number>(80);
  const [arbitrationConflictPolicy, setArbitrationConflictPolicy] = useState<'highest_score' | 'strict_no_conflict' | 'trend_priority'>('strict_no_conflict');
  const enableStrategyWeights = true;

  // Pipeline Execution Results & AI Calibration State
  const [pipelineTrades, setPipelineTrades] = useState<BtTrade[]>([]);
  const [pipelineMetrics, setPipelineMetrics] = useState<BtMetrics | null>(null);
  const [arbitrationEvents, setArbitrationEvents] = useState<ArbitrationEvent[]>([]);
  const [strategyStats, setStrategyStats] = useState<StrategyContributionStat[]>([]);
  const [categorySummaries, setCategorySummaries] = useState<Record<AssetCategory, CategoryPerformanceSummary> | null>(null);
  const [symbolSummaries, setSymbolSummaries] = useState<Record<string, SymbolPerformanceSummary>>({});
  const [isPipelineRunning, setIsPipelineRunning] = useState<boolean>(false);
  const [aiCalibrationReport, setAiCalibrationReport] = useState<AICalibrationReport | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);

  // Filter views for trades and arbitration logs
  const [tradeCategoryFilter, setTradeCategoryFilter] = useState<string>('all');
  const [arbCategoryFilter, setArbCategoryFilter] = useState<string>('all');
  const [activeResultsTab, setActiveResultsTab] = useState<'trades' | 'arbitration' | 'alpha_matrix' | 'equity' | 'rejections' | 'ai_calibration'>('trades');

  // Run Multi-Asset Pipeline Backtest
  const handleRunPipelineBacktest = useCallback(() => {
    setIsPipelineRunning(true);
    setTimeout(() => {
      const activeStrats = (ASSET_CATEGORY_STRATEGIES[pipelineCategory] || ASSET_CATEGORY_STRATEGIES.all).filter(
        (s) => enabledPipelineStrategies[s] !== false
      );

      const result = runMultiAssetPipelineEngine(multiAssetFeeds, capitalPools, activeStrats, {
        maxConcurrentPositions: maxConcurrentTrades,
        minScore: minArbitrationScore,
        conflictPolicy: arbitrationConflictPolicy,
        enableWeights: enableStrategyWeights,
      });

      setPipelineTrades(result.trades);
      setPipelineMetrics(result.metrics);
      setArbitrationEvents(result.arbitrationEvents);
      setStrategyStats(result.strategyStats);
      setCategorySummaries(result.categorySummaries);
      setSymbolSummaries(result.symbolSummaries || {});

      // Generate AI Strategy Calibration Report & Tweak Recommendations
      const report = generateAICalibrationReport(
        result.trades,
        result.metrics,
        result.strategyStats,
        result.categorySummaries,
        capitalPools
      );
      setAiCalibrationReport(report);

      setIsPipelineRunning(false);
    }, 200);
  }, [
    multiAssetFeeds,
    capitalPools,
    pipelineCategory,
    enabledPipelineStrategies,
    maxConcurrentTrades,
    minArbitrationScore,
    arbitrationConflictPolicy,
    enableStrategyWeights,
  ]);

  // Handle Preset Selection (Harmonizes Conflict Policy & Settings)
  const handleSelectPreset = (preset: CalibrationPreset) => {
    setActivePresetIdState(preset.id);
    setActivePresetId(preset.id);

    setArbitrationConflictPolicy(preset.conflictPolicy);
    setMinArbitrationScore(preset.minArbitrationScore);
    setMaxConcurrentTrades(preset.maxConcurrentTrades);

    setCapitalPools((prev) => ({
      ...prev,
      forex: { ...prev.forex, riskPct: preset.capitalPoolRisk.forex },
      metals: { ...prev.metals, riskPct: preset.capitalPoolRisk.metals },
      crypto: { ...prev.crypto, riskPct: preset.capitalPoolRisk.crypto },
    }));

    // Apply weights and parameters
    Object.entries(preset.strategyWeights || {}).forEach(([strat, weight]) => {
      const def = STRATEGY_DEFINITIONS[strat as StrategyName];
      if (def?.defaultAI) def.defaultAI.weight_multiplier = weight;
    });

    Object.entries(preset.strategyMinScores || {}).forEach(([strat, minScore]) => {
      const def = STRATEGY_DEFINITIONS[strat as StrategyName];
      if (def?.defaultMeta) def.defaultMeta.min_score = minScore;
    });

    Object.entries(preset.strategyParams || {}).forEach(([strat, params]) => {
      const def = STRATEGY_DEFINITIONS[strat as StrategyName];
      if (def?.defaultParams) {
        Object.assign(def.defaultParams, params);
      }
    });

    setTimeout(() => {
      handleRunPipelineBacktest();
    }, 100);
  };

  // Handle Saving New Preset Profile
  const handleSaveCurrentPreset = (name: string, description: string) => {
    const currentWeights: Record<string, number> = {};
    const currentMinScores: Record<string, number> = {};
    const currentParams: Record<string, Record<string, number>> = {};

    Object.entries(STRATEGY_DEFINITIONS).forEach(([k, v]) => {
      if (v.defaultAI) currentWeights[k] = v.defaultAI.weight_multiplier;
      if (v.defaultMeta) currentMinScores[k] = v.defaultMeta.min_score;
      if (v.defaultParams) currentParams[k] = { ...v.defaultParams };
    });

    const newPreset = saveNewPreset({
      name,
      description,
      conflictPolicy: arbitrationConflictPolicy,
      minArbitrationScore,
      maxConcurrentTrades,
      strategyWeights: currentWeights,
      strategyMinScores: currentMinScores,
      strategyParams: currentParams,
      capitalPoolRisk: {
        forex: capitalPools.forex.riskPct,
        metals: capitalPools.metals.riskPct,
        crypto: capitalPools.crypto.riskPct,
      },
    });

    setSavedPresets(getSavedPresets());
    setActivePresetIdState(newPreset.id);
  };

  // Handle Deleting Saved Preset
  const handleDeletePreset = (presetId: string) => {
    deleteUserPreset(presetId);
    const updated = getSavedPresets();
    setSavedPresets(updated);
    if (activePresetId === presetId) {
      handleSelectPreset(BASE_DEFAULT_PRESET);
    }
  };

  // Handle Saving Single Strategy Tweak Permanently
  const handleSaveSingleStrategyTweak = (proposal: StrategyTweakProposal) => {
    saveSingleStrategyConfig(
      proposal.strategy,
      proposal.recommendedWeight,
      proposal.recommendedMinScore,
      {
        tp1_r: proposal.recommendedTp1R,
        tp2_r: proposal.recommendedTp2R,
        stop_atr_mult: proposal.recommendedStopAtrMult,
      }
    );
    handleApplySingleAITweak(proposal);
  };

  // Apply AI Recommended Calibration
  const handleApplyAllAICalibrations = (report: AICalibrationReport) => {
    setIsCalibrating(true);

    if (report.globalTweaks) {
      setMinArbitrationScore(report.globalTweaks.recommendedMinScore);
      setMaxConcurrentTrades(report.globalTweaks.recommendedMaxPositions);
      setArbitrationConflictPolicy(report.globalTweaks.recommendedConflictPolicy);
      setCapitalPools((prev) => ({
        ...prev,
        forex: { ...prev.forex, riskPct: report.globalTweaks.recommendedForexRiskPct },
        metals: { ...prev.metals, riskPct: report.globalTweaks.recommendedMetalsRiskPct },
        crypto: { ...prev.crypto, riskPct: report.globalTweaks.recommendedCryptoRiskPct },
      }));
    }

    report.recommendations.forEach((prop) => {
      const def = STRATEGY_DEFINITIONS[prop.strategy];
      if (def) {
        if (def.defaultAI) def.defaultAI.weight_multiplier = prop.recommendedWeight;
        if (def.defaultMeta) def.defaultMeta.min_score = prop.recommendedMinScore;
        if (def.defaultParams) {
          def.defaultParams.tp1_r = prop.recommendedTp1R;
          def.defaultParams.tp2_r = prop.recommendedTp2R;
          def.defaultParams.stop_atr_mult = prop.recommendedStopAtrMult;
        }
      }
    });

    setTimeout(() => {
      handleRunPipelineBacktest();
      setIsCalibrating(false);
    }, 250);
  };

  const handleApplySingleAITweak = (proposal: StrategyTweakProposal) => {
    const def = STRATEGY_DEFINITIONS[proposal.strategy];
    if (def) {
      if (def.defaultAI) def.defaultAI.weight_multiplier = proposal.recommendedWeight;
      if (def.defaultMeta) def.defaultMeta.min_score = proposal.recommendedMinScore;
      if (def.defaultParams) {
        def.defaultParams.tp1_r = proposal.recommendedTp1R;
        def.defaultParams.tp2_r = proposal.recommendedTp2R;
        def.defaultParams.stop_atr_mult = proposal.recommendedStopAtrMult;
      }
    }
    handleRunPipelineBacktest();
  };

  const [deploySuccessMsg, setDeploySuccessMsg] = useState<string>('');

  const handleDeployToLivePipeline = async (preset: CalibrationPreset) => {
    setIsCalibrating(true);
    try {
      const res = await deployPresetToLiveStrategyConfigs(preset);
      if (res.success) {
        setDeploySuccessMsg(`🚀 Successfully deployed "${preset.name}" to Live & Demo trading pipeline! All ${res.count} strategies updated in production database.`);
        setTimeout(() => setDeploySuccessMsg(''), 9000);
      } else {
        setDeploySuccessMsg(`⚠️ Notice: Saved to memory session (${res.error || 'local runtime'}).`);
        setTimeout(() => setDeploySuccessMsg(''), 6000);
      }
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleResetDefaults = () => {
    handleSelectPreset(BASE_DEFAULT_PRESET);
  };

  // Auto-run on first load
  useEffect(() => {
    handleRunPipelineBacktest();
  }, [handleRunPipelineBacktest]);

  // Update segregated capital pool
  const handleUpdatePool = (category: AssetCategory, updates: Partial<AssetCapitalPool>) => {
    setCapitalPools((prev) => ({
      ...prev,
      [category]: { ...prev[category], ...updates },
    }));
  };

  // Fetch Live Multi-Asset Historical Data in One Go Across Full Universe (Uncapped / Deep Horizon)
  const handleSyncAllFeeds = async () => {
    setIsSyncingAll(true);

    const rangeOption = DATE_RANGE_OPTIONS.find((o) => o.key === selectedRange) || DATE_RANGE_OPTIONS[2];
    const targetBars = historyDepthBars || Math.max(500, rangeOption.days * 24 * (60 / (selectedTimeframe === '5m' ? 5 : selectedTimeframe === '1h' ? 60 : 15)));

    const updatedFeeds = { ...multiAssetFeeds };

    // Sync all instruments in PIPELINE_UNIVERSE
    for (const inst of PIPELINE_UNIVERSE) {
      try {
        if (updatedFeeds[inst.symbol]) {
          updatedFeeds[inst.symbol] = { ...updatedFeeds[inst.symbol], status: 'loading' };
        }

        const resp = await fetch(`/api/market-data/history?symbol=${inst.symbol}&interval=${selectedTimeframe}&assetClass=${inst.assetClass}&range=${selectedRange}&limit=${Math.min(1000, targetBars)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.candles && data.candles.length >= 20) {
            updatedFeeds[inst.symbol] = {
              category: inst.category,
              symbol: inst.symbol,
              displayName: inst.displayName,
              assetClass: inst.assetClass,
              pipOrPointSize: inst.pipOrPointSize,
              spreadPipsOrPts: inst.spreadPipsOrPts,
              decimals: inst.decimals,
              fridayWeekendClose: inst.fridayWeekendClose,
              enforceSessionWindows: inst.enforceSessionWindows,
              candles: data.candles,
              count: data.candles.length,
              status: 'ready',
              source: data.source || 'live_feed',
              lastUpdated: new Date().toISOString(),
            };
            continue;
          }
        }
        throw new Error('API fallback');
      } catch {
        const synthetic = generateSyntheticSessionData(inst.symbol, inst.assetClass, inst.basePrice, targetBars, 15);
        updatedFeeds[inst.symbol] = {
          category: inst.category,
          symbol: inst.symbol,
          displayName: inst.displayName,
          assetClass: inst.assetClass,
          pipOrPointSize: inst.pipOrPointSize,
          spreadPipsOrPts: inst.spreadPipsOrPts,
          decimals: inst.decimals,
          fridayWeekendClose: inst.fridayWeekendClose,
          enforceSessionWindows: inst.enforceSessionWindows,
          candles: synthetic,
          count: synthetic.length,
          status: 'ready',
          source: 'session_engine',
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    // Set category benchmark shortcuts
    if (updatedFeeds['EURUSD']) updatedFeeds['forex'] = updatedFeeds['EURUSD'];
    if (updatedFeeds['XAUUSD']) updatedFeeds['metals'] = updatedFeeds['XAUUSD'];
    if (updatedFeeds['BTCUSDT']) updatedFeeds['crypto'] = updatedFeeds['BTCUSDT'];

    setMultiAssetFeeds(updatedFeeds);
    setIsSyncingAll(false);

    // Automatically trigger backtest with fresh data
    const activeStrats = (ASSET_CATEGORY_STRATEGIES[pipelineCategory] || ASSET_CATEGORY_STRATEGIES.all).filter(
      (s) => enabledPipelineStrategies[s] !== false
    );

    const result = runMultiAssetPipelineEngine(updatedFeeds, capitalPools, activeStrats, {
      maxConcurrentPositions: maxConcurrentTrades,
      minScore: minArbitrationScore,
      conflictPolicy: arbitrationConflictPolicy,
      enableWeights: enableStrategyWeights,
    });

    setPipelineTrades(result.trades);
    setPipelineMetrics(result.metrics);
    setArbitrationEvents(result.arbitrationEvents);
    setStrategyStats(result.strategyStats);
    setCategorySummaries(result.categorySummaries);
    setSymbolSummaries(result.symbolSummaries || {});

    const report = generateAICalibrationReport(
      result.trades,
      result.metrics,
      result.strategyStats,
      result.categorySummaries,
      capitalPools
    );
    setAiCalibrationReport(report);
  };

  // Export Combined Dataset Package
  const handleExportFeeds = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      timeframe: selectedTimeframe,
      range: selectedRange,
      datasets: multiAssetFeeds,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multi_asset_backtest_package_${selectedTimeframe}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered lists
  const filteredTrades = useMemo(() => {
    if (tradeCategoryFilter === 'all') return pipelineTrades;
    return pipelineTrades.filter((t) => t.category === tradeCategoryFilter);
  }, [pipelineTrades, tradeCategoryFilter]);

  const filteredArbitrationEvents = useMemo(() => {
    return arbitrationEvents.filter((ev) => {
      if (arbCategoryFilter !== 'all') {
        const hasCategory = ev.candidates.some((c) => c.category === arbCategoryFilter);
        if (!hasCategory) return false;
      }
      return true;
    });
  }, [arbitrationEvents, arbCategoryFilter]);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Top Header & Mode Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                <Layers3 className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Institutional Backtest Lab & Arbitration Engine</h1>
                <p className="text-xs text-slate-400">
                  Cross-asset pipeline simulation with segregated capital pools, native pricing feeds, and AI arbitration showdowns.
                </p>
              </div>
            </div>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex flex-wrap items-center p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              id="mode-btn-pipeline"
              onClick={() => setBacktestMode('pipeline_arbitration')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                backtestMode === 'pipeline_arbitration'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Multi-Asset Pipeline
            </button>
            <button
              id="mode-btn-single"
              onClick={() => setBacktestMode('single_strategy')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                backtestMode === 'single_strategy'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Single Strategy Lab
            </button>
            <button
              id="mode-btn-prop-clearance"
              onClick={() => setBacktestMode('prop_firm_clearance')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                backtestMode === 'prop_firm_clearance'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-amber-400/90 hover:text-amber-300'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              Prop Firm Clearance Lab
            </button>
          </div>
        </div>

        {/* Knowledge & Architecture Guide Accordion */}
        <KnowledgeGuide />

        {/* ─── PIPELINE & ARBITRATION VIEW ────────────────────────────────────── */}
        {backtestMode === 'pipeline_arbitration' && (
          <div className="space-y-6">
            {/* Multi-Asset Synchronized Data Manager */}
            <MultiAssetDataManager
              feeds={multiAssetFeeds}
              selectedRange={selectedRange}
              onSelectRange={(r) => setSelectedRange(r)}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onCustomDateChange={(s, e) => {
                setCustomStartDate(s);
                setCustomEndDate(e);
              }}
              selectedTimeframe={selectedTimeframe}
              onTimeframeChange={(tf) => setSelectedTimeframe(tf)}
              historyDepthBars={historyDepthBars}
              onHistoryDepthChange={(depth) => setHistoryDepthBars(depth)}
              isSyncingAll={isSyncingAll}
              onSyncAllFeeds={handleSyncAllFeeds}
              onExportFeeds={handleExportFeeds}
            />

            {/* Segregated Capital Pool Manager */}
            <CapitalPoolManager pools={capitalPools} onUpdatePool={handleUpdatePool} />

            {/* Strategy Pool & Arbitration Configuration Card */}
            <div id="arbitration-controls-card" className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="font-semibold text-white text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    Strategy Pool Selection & Arbitration Policies
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select which quantitative strategies compete in the arbitration pipeline across their native asset categories.
                  </p>
                </div>

                {/* Category Filter Tabs */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-lg border border-slate-700/60">
                  {['all', 'forex', 'metals', 'crypto'].map((cat) => (
                    <button
                      key={cat}
                      id={`pool-cat-${cat}`}
                      onClick={() => setPipelineCategory(cat)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-all ${
                        pipelineCategory === cat
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat} ({ASSET_CATEGORY_STRATEGIES[cat]?.length || 0})
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategy Checkboxes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-4 pb-4">
                {(ASSET_CATEGORY_STRATEGIES[pipelineCategory] || ASSET_CATEGORY_STRATEGIES.all).map((stratName) => {
                  const def = STRATEGY_DEFINITIONS[stratName];
                  const meta = STRATEGY_ASSET_MAP[stratName] || { category: 'forex', defaultSymbol: 'EURUSD' };
                  const isChecked = enabledPipelineStrategies[stratName] !== false;
                  if (!def) return null;

                  return (
                    <div
                      key={stratName}
                      id={`strat-card-${stratName}`}
                      onClick={() =>
                        setEnabledPipelineStrategies((prev) => ({
                          ...prev,
                          [stratName]: !isChecked,
                        }))
                      }
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                        isChecked
                          ? 'bg-slate-800/60 border-purple-500/50 hover:border-purple-400 shadow-sm'
                          : 'bg-slate-900/50 border-slate-800 opacity-50 hover:opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${isChecked ? 'bg-purple-400' : 'bg-slate-600'}`} />
                            <h5 className="font-semibold text-xs text-white">{def.displayName}</h5>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                            {meta.category.toUpperCase()} • {meta.defaultSymbol}
                          </span>
                        </div>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-slate-700/80 text-purple-300">
                          {def.defaultAI.weight_multiplier || 1.0}x AI
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{def.description}</p>
                    </div>
                  );
                })}
              </div>

              {/* Arbitration Rules Bar & Run Button */}
              <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Max Concurrent Positions</label>
                  <select
                    value={maxConcurrentTrades}
                    onChange={(e) => setMaxConcurrentTrades(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  >
                    <option value={1}>1 Position Max (Tight)</option>
                    <option value={2}>2 Positions Max</option>
                    <option value={3}>3 Positions Max (Standard)</option>
                    <option value={5}>5 Positions Max (Wide)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Min Setup Score</label>
                  <input
                    type="number"
                    value={minArbitrationScore}
                    onChange={(e) => setMinArbitrationScore(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Conflict Policy</label>
                  <select
                    value={arbitrationConflictPolicy}
                    onChange={(e) => setArbitrationConflictPolicy(e.target.value as 'highest_score' | 'strict_no_conflict' | 'trend_priority')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  >
                    <option value="strict_no_conflict">Strict Concordance (Reject Opposing)</option>
                    <option value="highest_score">Highest Weighted Score (Winner Takes Slot)</option>
                  </select>
                </div>

                <div className="pt-4 sm:pt-0 flex gap-2">
                  <button
                    id="btn-run-pipeline-backtest"
                    onClick={handleRunPipelineBacktest}
                    disabled={isPipelineRunning}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all"
                  >
                    <Play className={`w-4 h-4 ${isPipelineRunning ? 'animate-spin' : ''}`} />
                    {isPipelineRunning ? 'Running Arbitration...' : 'Run Pipeline Arbitration'}
                  </button>
                </div>
              </div>
            </div>

            {/* Category Performance Scorecards & Multi-Asset Universe Breakdown */}
            {categorySummaries && (
              <CategoryScorecards summaries={categorySummaries} symbolSummaries={symbolSummaries} />
            )}

            {/* Deployment Notification */}
            {deploySuccessMsg && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center gap-3 shadow-lg animate-fade-in">
                <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                  <TrendingUp className="w-4 h-4" />
                </span>
                <div className="flex-1">{deploySuccessMsg}</div>
                <button
                  onClick={() => setDeploySuccessMsg('')}
                  className="px-2 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-[10px] text-emerald-300 transition"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* AI Calibration & Strategy Optimization Panel */}
            {aiCalibrationReport && pipelineMetrics && (
              <AICalibrationPanel
                report={aiCalibrationReport}
                metrics={pipelineMetrics}
                capitalPools={capitalPools}
                activeConflictPolicy={arbitrationConflictPolicy}
                minArbitrationScore={minArbitrationScore}
                maxConcurrentTrades={maxConcurrentTrades}
                activePresetId={activePresetId}
                savedPresets={savedPresets}
                onSelectPreset={handleSelectPreset}
                onSaveCurrentPreset={handleSaveCurrentPreset}
                onDeletePreset={handleDeletePreset}
                onSaveSingleStrategyTweak={handleSaveSingleStrategyTweak}
                onApplyAllRecommendations={handleApplyAllAICalibrations}
                onApplySingleTweak={handleApplySingleAITweak}
                onResetDefaults={handleResetDefaults}
                onDeployToLivePipeline={handleDeployToLivePipeline}
                isCalibrating={isCalibrating}
              />
            )}

            {/* Overall Portfolio Metrics Overview */}
            {pipelineMetrics && (
              <div id="portfolio-metrics-overview" className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
                      <TrendingUp className="w-4 h-4" />
                    </span>
                    <h3 className="font-semibold text-white text-base">Combined Portfolio Alpha Summary</h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    Evaluated across <strong className="text-white font-mono">{pipelineMetrics.evaluations.toLocaleString()}</strong> timeline bars
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
                    <span className="text-[11px] text-slate-400 block mb-1">Total Executed Trades</span>
                    <span className="text-base font-bold text-white font-mono">{pipelineMetrics.totalTrades}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">({pipelineMetrics.wins}W / {pipelineMetrics.losses}L)</span>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
                    <span className="text-[11px] text-slate-400 block mb-1">Win Rate</span>
                    <span className={`text-base font-bold font-mono ${pipelineMetrics.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {pipelineMetrics.winRate}%
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">TP1: {pipelineMetrics.tp1Hits} | TP2: {pipelineMetrics.tp2Hits}</span>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
                    <span className="text-[11px] text-slate-400 block mb-1">Profit Factor</span>
                    <span className="text-base font-bold text-white font-mono">{pipelineMetrics.profitFactor}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Avg Win: +{pipelineMetrics.avgWin}R</span>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
                    <span className="text-[11px] text-slate-400 block mb-1">Total Realized R</span>
                    <span className={`text-base font-bold font-mono ${pipelineMetrics.totalR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pipelineMetrics.totalR >= 0 ? `+${pipelineMetrics.totalR}R` : `${pipelineMetrics.totalR}R`}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Avg: {pipelineMetrics.avgR}R / trade</span>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
                    <span className="text-[11px] text-slate-400 block mb-1">Net Portfolio Return</span>
                    <span className={`text-base font-bold font-mono ${pipelineMetrics.netUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pipelineMetrics.netUsd >= 0 ? `+$${pipelineMetrics.netUsd.toLocaleString()}` : `-$${Math.abs(pipelineMetrics.netUsd).toLocaleString()}`}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Across Segregated Pools</span>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
                    <span className="text-[11px] text-slate-400 block mb-1">Max Drawdown</span>
                    <span className="text-base font-bold text-amber-400 font-mono">{pipelineMetrics.maxDrawdownPct}%</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Consecutive L: {pipelineMetrics.maxConsecLosses}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tabbed Results Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200">
              {/* Tab Selector Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-800 rounded-lg border border-slate-700/80">
                  <button
                    id="tab-btn-trades"
                    onClick={() => setActiveResultsTab('trades')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      activeResultsTab === 'trades'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Executed Trades ({filteredTrades.length})
                  </button>

                  <button
                    id="tab-btn-arbitration"
                    onClick={() => setActiveResultsTab('arbitration')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      activeResultsTab === 'arbitration'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Arbitration Audit Log ({filteredArbitrationEvents.length})
                  </button>

                  <button
                    id="tab-btn-alpha"
                    onClick={() => setActiveResultsTab('alpha_matrix')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      activeResultsTab === 'alpha_matrix'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Strategy Alpha Matrix ({strategyStats.length})
                  </button>

                  <button
                    id="tab-btn-equity"
                    onClick={() => setActiveResultsTab('equity')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      activeResultsTab === 'equity'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Portfolio Equity Curve
                  </button>

                  <button
                    id="tab-btn-rejections"
                    onClick={() => setActiveResultsTab('rejections')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      activeResultsTab === 'rejections'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Rejection Breakdown
                  </button>
                </div>

                {/* Asset Category Filter for Tab Views */}
                {activeResultsTab === 'trades' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Category:
                    </span>
                    {['all', 'forex', 'metals', 'crypto'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setTradeCategoryFilter(c)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md capitalize border transition-all ${
                          tradeCategoryFilter === c
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-semibold'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {activeResultsTab === 'arbitration' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Category:</span>
                      {['all', 'forex', 'metals', 'crypto'].map((c) => (
                        <button
                          key={c}
                          onClick={() => setArbCategoryFilter(c)}
                          className={`px-2 py-0.5 text-[11px] font-medium rounded capitalize border ${
                            arbCategoryFilter === c
                              ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tab Content 1: Executed Portfolio Trades */}
              {activeResultsTab === 'trades' && (
                <div className="pt-4 overflow-x-auto">
                  {filteredTrades.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No trades match the selected category filter. Try running with relaxed score or selecting all categories.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="py-2.5 px-3">Time</th>
                          <th className="py-2.5 px-3">Asset / Symbol</th>
                          <th className="py-2.5 px-3">Strategy</th>
                          <th className="py-2.5 px-3">Dir</th>
                          <th className="py-2.5 px-3 text-right">Entry Price</th>
                          <th className="py-2.5 px-3 text-right">Stop Loss</th>
                          <th className="py-2.5 px-3 text-right">Take Profit</th>
                          <th className="py-2.5 px-3 text-right">Exit Price</th>
                          <th className="py-2.5 px-3 text-center">Result</th>
                          <th className="py-2.5 px-3 text-right">PnL (R)</th>
                          <th className="py-2.5 px-3 text-right">Net PnL ($)</th>
                          <th className="py-2.5 px-3 text-right">Pool Return</th>
                          <th className="py-2.5 px-3">Reasoning</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredTrades.map((t) => {
                          const isWin = t.pnl_r > 0;
                          const pnlColor = isWin ? 'text-emerald-400' : 'text-rose-400';
                          const catBadge =
                            t.category === 'crypto'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : t.category === 'metals'
                              ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                              : t.category === 'indices'
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                              : 'bg-blue-500/10 text-blue-300 border-blue-500/30';

                          return (
                            <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{t.entryTime}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${catBadge}`}>
                                  {t.symbol}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-200 font-medium whitespace-nowrap">{t.strategy}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  t.direction === 'buy' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                                }`}>
                                  {t.direction}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-200 font-mono font-medium">
                                {t.entry.toLocaleString(undefined, { minimumFractionDigits: t.category === 'forex' ? 5 : 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-400 font-mono">
                                {t.stop_loss.toLocaleString(undefined, { minimumFractionDigits: t.category === 'forex' ? 5 : 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-400 font-mono">
                                {t.tp2.toLocaleString(undefined, { minimumFractionDigits: t.category === 'forex' ? 5 : 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300 font-mono">
                                {t.exitPrice ? t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: t.category === 'forex' ? 5 : 2 }) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  t.result === 'tp2_hit'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : t.result === 'tp1_hit'
                                    ? 'bg-teal-500/20 text-teal-300'
                                    : t.result === 'sl_hit'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}>
                                  {t.result.replace('_', ' ')}
                                </span>
                              </td>
                              <td className={`py-2.5 px-3 text-right font-bold font-mono ${pnlColor}`}>
                                {t.pnl_r >= 0 ? `+${t.pnl_r}R` : `${t.pnl_r}R`}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-bold font-mono ${pnlColor}`}>
                                {t.pnl_net_usd >= 0 ? `+$${t.pnl_net_usd.toLocaleString()}` : `-$${Math.abs(t.pnl_net_usd).toLocaleString()}`}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-mono ${pnlColor}`}>
                                {t.capitalPoolReturnPct >= 0 ? `+${t.capitalPoolReturnPct}%` : `${t.capitalPoolReturnPct}%`}
                              </td>
                              <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-xs truncate" title={t.reason}>
                                {t.reason}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Tab Content 2: Arbitration Audit Log */}
              {activeResultsTab === 'arbitration' && (
                <div className="pt-4 space-y-3">
                  {filteredArbitrationEvents.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No arbitration events recorded for this category.
                    </div>
                  ) : (
                    filteredArbitrationEvents.map((ev) => {
                      const isExecuted = ev.decision === 'executed';
                      const decisionBadge = isExecuted
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : ev.decision === 'rejected_conflict'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30';

                      return (
                        <div key={ev.id} className="p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-lg space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-400">{ev.time}</span>
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase ${decisionBadge}`}>
                                {ev.decision.replace('_', ' ')}
                              </span>
                            </div>
                            {ev.winner && (
                              <div className="flex items-center gap-2 text-xs font-mono">
                                <span className="text-slate-400">Winner:</span>
                                <strong className="text-emerald-300">{ev.winner.strategy}</strong>
                                <span className="text-slate-500">({ev.winner.symbol} {ev.winner.direction.toUpperCase()})</span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 font-bold border border-emerald-800/40 text-[10px]">
                                  {ev.winner.weightedScore} pts
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded border border-slate-800">
                            {ev.notes}
                          </div>

                          {/* Candidates breakdown */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {ev.candidates.map((c, cIdx) => (
                              <span
                                key={cIdx}
                                className={`px-2 py-1 rounded text-[10px] font-mono border flex items-center gap-1.5 ${
                                  ev.winner?.strategy === c.strategy
                                    ? 'bg-emerald-900/20 border-emerald-600/40 text-emerald-200 font-semibold'
                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                }`}
                              >
                                <span>{c.strategy} [{c.symbol}]</span>
                                <span className="text-slate-500">•</span>
                                <span>{c.direction.toUpperCase()}</span>
                                <span className="text-slate-500">•</span>
                                <span className="text-amber-300">{c.weightedScore}pts</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab Content 3: Strategy Alpha Matrix */}
              {activeResultsTab === 'alpha_matrix' && (
                <div className="pt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                        <th className="py-2.5 px-3">Strategy Model</th>
                        <th className="py-2.5 px-3">Asset Category</th>
                        <th className="py-2.5 px-3 text-center">AI Weight</th>
                        <th className="py-2.5 px-3 text-right">Candidates</th>
                        <th className="py-2.5 px-3 text-right">Arb Won</th>
                        <th className="py-2.5 px-3 text-right">Trades Taken</th>
                        <th className="py-2.5 px-3 text-right">Win Rate</th>
                        <th className="py-2.5 px-3 text-right">Profit Factor</th>
                        <th className="py-2.5 px-3 text-right">Total R</th>
                        <th className="py-2.5 px-3 text-right">Net PnL ($)</th>
                        <th className="py-2.5 px-3 text-right">Alpha Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {strategyStats.map((st) => {
                        const isPos = st.totalR > 0;
                        const color = isPos ? 'text-emerald-400' : st.totalR < 0 ? 'text-rose-400' : 'text-slate-400';

                        return (
                          <tr key={st.strategy} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-3 text-white font-medium">{st.displayName}</td>
                            <td className="py-2.5 px-3 uppercase text-slate-400 text-[10px]">{st.category}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-purple-300">{st.weight}x</td>
                            <td className="py-2.5 px-3 text-right text-slate-300">{st.candidatesCount}</td>
                            <td className="py-2.5 px-3 text-right text-indigo-300 font-semibold">{st.wonArbitrationCount}</td>
                            <td className="py-2.5 px-3 text-right text-slate-200 font-bold">{st.executedTrades}</td>
                            <td className="py-2.5 px-3 text-right text-slate-200">{st.winRate}%</td>
                            <td className="py-2.5 px-3 text-right text-slate-200">{st.profitFactor}</td>
                            <td className={`py-2.5 px-3 text-right font-bold ${color}`}>
                              {st.totalR >= 0 ? `+${st.totalR}R` : `${st.totalR}R`}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-bold ${color}`}>
                              {st.netUsd >= 0 ? `+$${st.netUsd.toLocaleString()}` : `-$${Math.abs(st.netUsd).toLocaleString()}`}
                            </td>
                            <td className="py-2.5 px-3 text-right text-blue-400 font-bold">{st.alphaSharePct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab Content 4: Portfolio Equity Curve */}
              {activeResultsTab === 'equity' && pipelineMetrics && (
                <div className="pt-4 space-y-4">
                  <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                    <h5 className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
                      <span>Timeline Equity Curve (Realized R-Multiples)</span>
                      <span className="text-slate-400 font-mono">Ending Equity: +{pipelineMetrics.totalR}R (${pipelineMetrics.netUsd.toLocaleString()})</span>
                    </h5>

                    {/* SVG Equity Chart */}
                    <div className="h-64 w-full relative">
                      <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="equityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Baseline Zero Line */}
                        <line x1="0" y1="100" x2="800" y2="100" stroke="#334155" strokeDasharray="4,4" strokeWidth="1" />

                        {(() => {
                          const pts = pipelineMetrics.equityCurve;
                          if (pts.length < 2) return null;
                          const rValues = pts.map((p) => p.equityR);
                          const maxR = Math.max(5, ...rValues);
                          const minR = Math.min(-5, ...rValues);
                          const range = maxR - minR || 1;

                          const coords = pts.map((p, idx) => {
                            const x = (idx / (pts.length - 1)) * 800;
                            const y = 200 - ((p.equityR - minR) / range) * 180 - 10;
                            return `${x},${y}`;
                          });

                          const pathStr = `M ${coords.join(' L ')}`;
                          const areaStr = `M 0,200 L ${coords.join(' L ')} L 800,200 Z`;

                          return (
                            <>
                              <path d={areaStr} fill="url(#equityGrad)" />
                              <path d={pathStr} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content 5: Rejection Breakdown */}
              {activeResultsTab === 'rejections' && pipelineMetrics && (
                <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(pipelineMetrics.rejectionReasons).map(([cause, count]) => (
                    <div key={cause} className="p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-lg flex items-center justify-between">
                      <div>
                        <h6 className="text-xs font-semibold text-slate-200 capitalize">{cause.replace(/_/g, ' ')}</h6>
                        <span className="text-[10px] text-slate-400">Institutional Risk Filter</span>
                      </div>
                      <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-rose-950/40 text-rose-300 border border-rose-800/40">
                        {count.toLocaleString()} vetoes
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SINGLE STRATEGY LAB VIEW ────────────────────────────────────────── */}
        {backtestMode === 'single_strategy' && (
          <SingleStrategyLab
            multiAssetFeeds={multiAssetFeeds}
            onSaveStrategyOverrides={(strat, weight, minScore, params) => {
              saveSingleStrategyConfig(strat, weight, minScore, params);
              const def = STRATEGY_DEFINITIONS[strat];
              if (def) {
                if (def.defaultAI) def.defaultAI.weight_multiplier = weight;
                if (def.defaultMeta) def.defaultMeta.min_score = minScore;
                if (def.defaultParams) Object.assign(def.defaultParams, params);
              }
            }}
          />
        )}

        {/* ─── INSTITUTIONAL PROP FIRM CLEARANCE LAB VIEW ────────────────────── */}
        {backtestMode === 'prop_firm_clearance' && (
          <PropClearanceLab
            multiAssetFeeds={multiAssetFeeds}
            capitalPools={capitalPools}
            selectedRange={selectedRange}
            onSelectRange={setSelectedRange}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            onSyncFeeds={handleSyncAllFeeds}
            isSyncingFeeds={isSyncingAll}
          />
        )}
      </div>
    </AdminLayout>
  );
}
