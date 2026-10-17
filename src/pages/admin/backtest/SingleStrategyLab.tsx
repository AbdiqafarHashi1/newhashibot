import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Play,
  Sliders,
  Save,
  Check,
  RotateCcw,
  BarChart2,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import { STRATEGY_DEFINITIONS, StrategyName } from '../StrategyConfig';
import {
  AssetCategory,
  AssetClass,
  BtCandle,
  BtMetrics,
  BtTrade,
  MarketEnvironment,
  MultiAssetFeedItem,
  STRATEGY_ASSET_MAP,
} from './types';
import { generateSyntheticSessionData } from './syntheticData';
import { runSingleStrategyEngine } from './simulationEngine';
import { saveSingleStrategyConfig } from './presetStorage';
import { parseBrokerOhlcv } from '../../../lib/backtest/brokerCsv';
import { supabase } from '../../../lib/supabase';

interface SingleStrategyLabProps {
  multiAssetFeeds: Record<string, MultiAssetFeedItem>;
  onSaveStrategyOverrides?: (strategy: StrategyName, weight: number, minScore: number, params: Record<string, number>) => void;
}

const AVAILABLE_SYMBOLS: { symbol: string; displayName: string; category: AssetCategory; assetClass: AssetClass; pipOrPoint: number; defaultSpread: number }[] = [
  { symbol: 'EURUSD', displayName: 'EUR/USD (Forex Major)', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.0001, defaultSpread: 1.4 },
  { symbol: 'GBPUSD', displayName: 'GBP/USD (Forex Cable)', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.0001, defaultSpread: 1.8 },
  { symbol: 'USDJPY', displayName: 'USD/JPY (Forex Major)', category: 'forex', assetClass: 'forex_majors', pipOrPoint: 0.01, defaultSpread: 1.5 },
  { symbol: 'XAUUSD', displayName: 'Spot Gold / USD (Metals)', category: 'metals', assetClass: 'metals_gold', pipOrPoint: 0.01, defaultSpread: 35.0 },
  { symbol: 'BTCUSDT', displayName: 'Bitcoin / USDT (Crypto)', category: 'crypto', assetClass: 'crypto', pipOrPoint: 0.01, defaultSpread: 2.0 },
  { symbol: 'ETHUSDT', displayName: 'Ethereum / USDT (Crypto)', category: 'crypto', assetClass: 'crypto', pipOrPoint: 0.01, defaultSpread: 0.35 },
];

export const SingleStrategyLab: React.FC<SingleStrategyLabProps> = ({
  multiAssetFeeds,
  onSaveStrategyOverrides,
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyName>('LondonBreakout');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('15m');
  const [dataSourceMode, setDataSourceMode] = useState<'live' | 'feed' | 'csv' | 'synthetic'>('live');
  const [dataStatus, setDataStatus] = useState<string>('');
  const [barsCount, setBarsCount] = useState<number>(1500);
  const [csvCandles, setCsvCandles] = useState<BtCandle[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Strategy Parameters
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>(() => {
    return { ...(STRATEGY_DEFINITIONS.LondonBreakout?.defaultParams || {}) };
  });
  const [strategyWeight, setStrategyWeight] = useState<number>(1.0);
  const [strategyMinScore, setStrategyMinScore] = useState<number>(80);

  // Environment & Risk Settings
  const [env, setEnv] = useState<MarketEnvironment>({
    assetClass: 'forex_majors',
    symbol: 'EURUSD',
    pipOrPointSize: 0.0001,
    spreadPipsOrPts: 1.4,
    feePctPerSide: 0.0,
    accountSizeUsd: 10000,
    riskPctPerTrade: 1.0,
    fridayWeekendClose: true,
    enforceSessionWindows: true,
  });

  // Results State
  const [metrics, setMetrics] = useState<BtMetrics | null>(null);
  const [trades, setTrades] = useState<BtTrade[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'wins' | 'losses'>('all');

  // Sync symbol and params when strategy changes
  const handleStrategySelect = (strat: StrategyName) => {
    setSelectedStrategy(strat);
    const def = STRATEGY_DEFINITIONS[strat];
    if (def) {
      setStrategyParams({ ...(def.defaultParams || {}) });
      setStrategyWeight(def.defaultAI?.weight_multiplier ?? 1.0);
      setStrategyMinScore(def.defaultMeta?.min_score ?? 80);

      const mapping = STRATEGY_ASSET_MAP[strat];
      if (mapping) {
        setSelectedSymbol(mapping.defaultSymbol);
        const symbolDef = AVAILABLE_SYMBOLS.find((s) => s.symbol === mapping.defaultSymbol);
        if (symbolDef) {
          setEnv((prev) => ({
            ...prev,
            symbol: symbolDef.symbol,
            assetClass: symbolDef.assetClass,
            pipOrPointSize: symbolDef.pipOrPoint,
            spreadPipsOrPts: symbolDef.defaultSpread,
            enforceSessionWindows: symbolDef.category === 'forex',
            fridayWeekendClose: symbolDef.category !== 'crypto',
          }));
        }
      }
    }
  };

  const importCsv = useCallback(async (file: File) => {
    const parsed = parseBrokerOhlcv(await file.text());
    if (parsed.length < 20) throw new Error('CSV contains fewer than 20 valid OHLC rows');
    setCsvCandles(parsed);
    setDataSourceMode('csv');
    setDataStatus(`Imported ${parsed.length.toLocaleString()} CSV bars from ${file.name}`);
  }, []);

  // Run the Single Strategy Simulation
  const handleRunBacktest = useCallback(async () => {
    setIsRunning(true);

    try {
      let candles: BtCandle[] = [];
      const mapping = STRATEGY_ASSET_MAP[selectedStrategy] || { category: 'forex' };
      const feed = multiAssetFeeds[selectedSymbol] || multiAssetFeeds[mapping.category];

      if (dataSourceMode === 'live') {
        setDataStatus('Reading canonical browser cache...');
        try {
          if(!feed||feed.status!=='ready'||feed.candles.length<20)throw new Error('Canonical dataset is not ready');
          candles=feed.candles;
          setDataStatus(`Canonical cached data: ${candles.length} candles (${feed.source})`);
        } catch {
          // A failed live feed must never be silently replaced with generated bars.
          // Doing so would make a result selected as "live" materially misleading.
          setDataStatus('Live fetch failed — no backtest was run. Select Synthetic data explicitly to run a simulation.');
          setIsRunning(false);
          return;
        }
      } else if (dataSourceMode === 'csv') {
        if (csvCandles.length < 20) throw new Error('Import a valid OHLCV CSV before running CSV replay');
        candles = csvCandles;
        setDataStatus(`CSV replay: ${candles.length.toLocaleString()} imported bars`);
      } else if (dataSourceMode === 'feed' && feed && feed.candles && feed.candles.length >= 20) {
        candles = feed.candles;
        setDataStatus(`Multi-asset feed: ${candles.length} candles`);
      } else {
        const symDef = AVAILABLE_SYMBOLS.find((s) => s.symbol === selectedSymbol) || AVAILABLE_SYMBOLS[0];
        const basePrice = symDef.category === 'forex' ? 1.085 : symDef.category === 'metals' ? 2480.0 : 88000.0;
        candles = generateSyntheticSessionData(symDef.symbol, symDef.assetClass, basePrice, barsCount, 15);
        setDataStatus(`Synthetic data: ${candles.length} candles`);
      }

      const result = runSingleStrategyEngine(
        candles,
        selectedStrategy,
        strategyParams,
        env,
        24,
        strategyMinScore
      );

      setMetrics(result.metrics);
      setTrades(result.trades);
      if (result.canonicalCompletedTrades.length) {
        const first = result.canonicalCompletedTrades[0];
        const runHash = `${first.strategyId}:${first.strategyVersion}:${first.configurationVersion}:${first.datasetIds.join(',')}:${result.canonicalCompletedTrades.map((trade) => trade.runReference).join('|')}`;
        const { error } = await supabase.from('backtest_runs').insert({ mode_slug: 'canonical_single_strategy', strategy_name: first.strategyId, symbol: first.symbol, timeframe: first.primaryTimeframe, dataset_name: feed?.datasetId ?? first.datasetIds.join(','), status: 'completed', result_summary: { strategyId: first.strategyId, strategyVersion: first.strategyVersion, datasetIds: feed?.datasetId ? [feed.datasetId] : first.datasetIds, executionModelVersion: first.costs.version, runHash, dataQuality: feed?.qualityEvidence ? { status: feed.qualityEvidence.invalidBars || feed.qualityEvidence.score < 50 ? 'FAIL' : feed.qualityEvidence.duplicates || feed.qualityEvidence.outOfOrder || feed.qualityEvidence.missingRanges.length || feed.qualityEvidence.staleFinalBar || feed.qualityEvidence.unrealisticJumps ? 'WARNING' : 'PASS', report: feed.qualityEvidence } : { status: 'QUALITY_EVIDENCE_UNAVAILABLE' }, canonicalCompletedTrades: result.canonicalCompletedTrades } });
        if (error) setDataStatus(`Backtest completed, but canonical run persistence failed: ${error.message}`);
      }
    } catch (err) {
      setDataStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setIsRunning(false);
    }
  }, [selectedStrategy, strategyParams, env, strategyMinScore, dataSourceMode, multiAssetFeeds, selectedSymbol, barsCount, csvCandles]);

  // Save current single strategy params
  const handleSaveToConfig = () => {
    saveSingleStrategyConfig(selectedStrategy, strategyWeight, strategyMinScore, strategyParams);
    onSaveStrategyOverrides?.(selectedStrategy, strategyWeight, strategyMinScore, strategyParams);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  // Reset to default
  const handleResetStrategy = () => {
    const def = STRATEGY_DEFINITIONS[selectedStrategy];
    if (def) {
      setStrategyParams({ ...(def.defaultParams || {}) });
      setStrategyWeight(1.0);
      setStrategyMinScore(80);
    }
  };

  const filteredTrades = useMemo(() => {
    if (tradeFilter === 'wins') return trades.filter((t) => t.pnl_r > 0);
    if (tradeFilter === 'losses') return trades.filter((t) => t.pnl_r <= 0);
    return trades;
  }, [trades, tradeFilter]);

  const def = STRATEGY_DEFINITIONS[selectedStrategy];

  return (
    <div className="space-y-6 min-w-0 max-w-full overflow-hidden">
      {/* Strategy & Asset Selection Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 text-slate-200 shadow-md min-w-0 max-w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg shrink-0">
                <Sliders className="w-4 h-4" />
              </span>
              <h3 className="font-bold text-white text-base">Single Strategy & Asset Isolated Backtest Lab</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Test an individual algorithmic strategy against historical session data in full isolation with customizable risk, spreads, and parameters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              id="btn-run-single-backtest"
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all"
            >
              <Play className={`w-3.5 h-3.5 shrink-0 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Simulating Strategy...' : 'Run Single Backtest'}</span>
            </button>

            <button
              id="btn-save-single-strategy"
              onClick={handleSaveToConfig}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all ${
                isSaved
                  ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Persist this strategy's parameters to Strategy Config"
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Saved ✓</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span>Save Parameters</span>
                </>
              )}
            </button>

            <button
              onClick={handleResetStrategy}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 transition-all shrink-0"
              title="Reset strategy parameters to defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Strategy, Asset, and Feed Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 pb-4">
          {/* Strategy Dropdown */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Quantitative Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => handleStrategySelect(e.target.value as StrategyName)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-indigo-500"
            >
              {Object.keys(STRATEGY_DEFINITIONS).map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_DEFINITIONS[s as StrategyName]?.displayName || s}
                </option>
              ))}
            </select>
          </div>

          {/* Symbol / Asset Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target Asset & Instrument</label>
            <select
              value={selectedSymbol}
              onChange={(e) => {
                setSelectedSymbol(e.target.value);
                const symDef = AVAILABLE_SYMBOLS.find((s) => s.symbol === e.target.value);
                if (symDef) {
                  setEnv((prev) => ({
                    ...prev,
                    symbol: symDef.symbol,
                    assetClass: symDef.assetClass,
                    pipOrPointSize: symDef.pipOrPoint,
                    spreadPipsOrPts: symDef.defaultSpread,
                  }));
                }
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-indigo-500"
            >
              {AVAILABLE_SYMBOLS.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Data Source Mode & Timeframe */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-400">Feed & Timeframe</label>
              <div className="flex gap-1">
                {['5m', '15m', '1h'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${
                      selectedTimeframe === tf
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <select
              value={dataSourceMode}
              onChange={(e) => setDataSourceMode(e.target.value as 'live' | 'feed' | 'csv' | 'synthetic')}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-indigo-500"
            >
              <option value="live">Live Market Data (Real Binance / Yahoo Finance)</option>
              <option value="feed">Synchronized Multi-Asset Feeds</option>
              <option value="csv">Uploaded Broker CSV (OHLCV)</option>
              <option value="synthetic">Synthetic Multi-Session Engine</option>
            </select>
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importCsv(file).catch((error: unknown) => setDataStatus(`CSV import failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
              event.target.value = '';
            }} />
            <button type="button" onClick={() => csvInputRef.current?.click()} className="mt-2 w-full rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-2 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-900/40">
              Import broker OHLCV CSV
            </button>
          </div>

          {/* Candle Horizon */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Candle Horizon Depth</label>
            <div className="flex gap-1.5">
              {[500, 1500, 3000, 5000].map((b) => (
                <button
                  key={b}
                  onClick={() => setBarsCount(b)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all text-center ${
                    barsCount === b
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Data Source Status Indicator */}
        {dataStatus && (
          <div className={`px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-2 ${
            dataStatus.startsWith('Live data')
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : dataStatus.startsWith('Live fetch failed') || dataStatus.startsWith('Error')
              ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              : 'bg-slate-800/60 border border-slate-700 text-slate-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              dataStatus.startsWith('Live data') ? 'bg-emerald-400 animate-pulse' : dataStatus.startsWith('Live fetch failed') || dataStatus.startsWith('Error') ? 'bg-rose-400' : 'bg-slate-500'
            }`} />
            {dataStatus}
          </div>
        )}

        {/* Strategy Description Bar */}
        {def && (
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-purple-300 font-medium">{def.displayName}: </strong>
              <span>{def.description}</span>
            </div>
          </div>
        )}
      </div>

      {/* Strategy Parameters & Risk Environment Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Parameter Sliders */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200 space-y-4">
          <h4 className="font-semibold text-white text-sm flex items-center justify-between">
            <span>Strategy Quantitative Parameters</span>
            <span className="text-xs text-slate-400 font-normal">Live Dynamic Tuning</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Min Quality Score */}
            <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
              <label className="block text-[11px] text-slate-400 mb-1 flex justify-between">
                <span>Min Quality Score</span>
                <strong className="text-indigo-400 font-mono">{strategyMinScore} pts</strong>
              </label>
              <input
                type="number"
                min="50"
                max="95"
                value={strategyMinScore}
                onChange={(e) => setStrategyMinScore(parseInt(e.target.value, 10) || 80)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* AI Weight Multiplier */}
            <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
              <label className="block text-[11px] text-slate-400 mb-1 flex justify-between">
                <span>Arbitration Weight</span>
                <strong className="text-purple-400 font-mono">{strategyWeight}x</strong>
              </label>
              <input
                type="number"
                step="0.05"
                min="0.2"
                max="2.5"
                value={strategyWeight}
                onChange={(e) => setStrategyWeight(parseFloat(e.target.value) || 1.0)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Strategy Specific Dynamic Params */}
            {Object.entries(strategyParams).map(([paramKey, val]) => (
              <div key={paramKey} className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
                <label className="block text-[11px] text-slate-400 mb-1 capitalize flex items-center justify-between">
                  <span className="truncate max-w-[120px]">{paramKey.replace(/_/g, ' ')}</span>
                  <strong className="text-indigo-400 font-mono">{val}</strong>
                </label>
                <input
                  type="number"
                  step={val < 1 ? '0.05' : val < 10 ? '0.1' : '1'}
                  value={val}
                  onChange={(e) =>
                    setStrategyParams((prev) => ({
                      ...prev,
                      [paramKey]: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: Market Environment & Risk Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200 space-y-4">
          <h4 className="font-semibold text-white text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            Environment & Capital Risk
          </h4>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 flex justify-between">
                <span>Account Size ($)</span>
                <strong className="text-white font-mono">${env.accountSizeUsd.toLocaleString()}</strong>
              </label>
              <input
                type="number"
                step="1000"
                value={env.accountSizeUsd}
                onChange={(e) => setEnv((prev) => ({ ...prev, accountSizeUsd: parseFloat(e.target.value) || 10000 }))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 flex justify-between">
                <span>Risk Per Trade (%)</span>
                <strong className="text-emerald-400 font-mono">{env.riskPctPerTrade}%</strong>
              </label>
              <input
                type="number"
                step="0.25"
                min="0.1"
                max="5.0"
                value={env.riskPctPerTrade}
                onChange={(e) => setEnv((prev) => ({ ...prev, riskPctPerTrade: parseFloat(e.target.value) || 1.0 }))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 flex justify-between">
                <span>Spread ({env.assetClass.includes('forex') ? 'pips' : 'pts'})</span>
                <strong className="text-amber-400 font-mono">{env.spreadPipsOrPts}</strong>
              </label>
              <input
                type="number"
                step="0.1"
                value={env.spreadPipsOrPts}
                onChange={(e) => setEnv((prev) => ({ ...prev, spreadPipsOrPts: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={env.enforceSessionWindows}
                  onChange={(e) => setEnv((prev) => ({ ...prev, enforceSessionWindows: e.target.checked }))}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span className="text-[11px] text-slate-300">Enforce Session Kill-Zones (London/NY)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={env.fridayWeekendClose}
                  onChange={(e) => setEnv((prev) => ({ ...prev, fridayWeekendClose: e.target.checked }))}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span className="text-[11px] text-slate-300">Cut Trades Before Friday Weekend</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics Cards */}
      {metrics && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              Isolated Performance Metrics: {selectedStrategy} ({env.symbol})
            </h4>
            <span className="text-xs text-slate-400 font-mono">
              Tested on {metrics.evaluations?.toLocaleString() ?? 'Not recorded'} bar evaluations
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
              <span className="text-[11px] text-slate-400 block mb-1">Total Trades</span>
              <span className="text-base font-bold text-white font-mono">{metrics.totalTrades}</span>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
              <span className="text-[11px] text-slate-400 block mb-1">Win Rate</span>
              <span className="text-base font-bold text-emerald-400 font-mono">{metrics.winRate}%</span>
              <span className="text-[10px] text-slate-400 block">({metrics.wins}W / {metrics.losses}L)</span>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
              <span className="text-[11px] text-slate-400 block mb-1">Profit Factor</span>
              <span className="text-base font-bold text-white font-mono">{metrics.profitFactor}</span>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
              <span className="text-[11px] text-slate-400 block mb-1">Total Return (R)</span>
              <span className={`text-base font-bold font-mono ${metrics.totalR >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                {metrics.totalR >= 0 ? `+${metrics.totalR}R` : `${metrics.totalR}R`}
              </span>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
              <span className="text-[11px] text-slate-400 block mb-1">Net Realized PnL</span>
              <span className={`text-base font-bold font-mono ${metrics.netUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.netUsd >= 0 ? `+$${metrics.netUsd.toLocaleString()}` : `-$${Math.abs(metrics.netUsd).toLocaleString()}`}
              </span>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/60 text-center">
              <span className="text-[11px] text-slate-400 block mb-1">Max Drawdown</span>
              <span className="text-base font-bold text-amber-400 font-mono">{metrics.maxDrawdownPct}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Trade Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h4 className="font-semibold text-white text-sm">Execution Trade Log ({filteredTrades.length})</h4>
            <p className="text-xs text-slate-400 mt-0.5">Chronological trade exits, R-multiples, and setup rationale.</p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-800 rounded-lg border border-slate-700">
            {(['all', 'wins', 'losses'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setTradeFilter(filter)}
                className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-all ${
                  tradeFilter === filter
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No trades executed under current parameters. Try lowering the Min Quality Score to 75-80.
          </div>
        ) : (
          <div className="pt-3 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3 text-right">Entry</th>
                  <th className="py-2.5 px-3 text-right">Stop Loss</th>
                  <th className="py-2.5 px-3 text-right">TP1 / TP2</th>
                  <th className="py-2.5 px-3 text-right">Exit Price</th>
                  <th className="py-2.5 px-3 text-center">Result</th>
                  <th className="py-2.5 px-3 text-right">Return (R)</th>
                  <th className="py-2.5 px-3 text-right">Net PnL ($)</th>
                  <th className="py-2.5 px-3">Setup Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTrades.slice(0, 100).map((t) => {
                  const isWin = t.pnl_r > 0;
                  const resultBadge =
                    t.result === 'tp2_hit'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : t.result === 'tp1_hit'
                      ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                      : t.result === 'sl_hit'
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30';

                  return (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400">{t.entryTime}</td>
                      <td className="py-2.5 px-3 text-white font-semibold">{t.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${
                            t.direction === 'buy' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.direction === 'buy' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {t.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{t.entry}</td>
                      <td className="py-2.5 px-3 text-right text-rose-300/80">{t.stop_loss}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-300/80">
                        {t.tp1} / {t.tp2}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{t.exitPrice ?? '-'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase ${resultBadge}`}>
                          {t.result.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnl_r >= 0 ? `+${t.pnl_r}R` : `${t.pnl_r}R`}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnl_net_usd >= 0 ? `+$${t.pnl_net_usd.toLocaleString()}` : `-$${Math.abs(t.pnl_net_usd).toLocaleString()}`}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-sans text-[11px] max-w-xs truncate">{t.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
