import React, { useState } from 'react';
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Calendar,
  Sparkles,
  Info,
  Globe
} from 'lucide-react';
import {
  MultiAssetFeedItem,
  DATE_RANGE_OPTIONS,
} from './types';

interface MultiAssetDataManagerProps {
  feeds: Record<string, MultiAssetFeedItem>;
  selectedRange: string;
  onSelectRange: (rangeKey: string) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomDateChange: (start: string, end: string) => void;
  selectedTimeframe: string;
  onTimeframeChange: (tf: string) => void;
  historyDepthBars?: number;
  onHistoryDepthChange?: (depth: number) => void;
  isSyncingAll: boolean;
  onSyncAllFeeds: () => void;
  onExportFeeds: () => void;
}

export const MultiAssetDataManager: React.FC<MultiAssetDataManagerProps> = ({
  feeds,
  selectedRange,
  onSelectRange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
  selectedTimeframe,
  onTimeframeChange,
  historyDepthBars = 2500,
  onHistoryDepthChange,
  isSyncingAll,
  onSyncAllFeeds,
  onExportFeeds,
}) => {
  const [viewScope, setViewScope] = useState<'universe' | 'categories'>('universe');
  const currentOption = DATE_RANGE_OPTIONS.find((o) => o.key === selectedRange) || DATE_RANGE_OPTIONS[2];

  const DEPTH_OPTIONS = [
    { value: 500, label: '500 Bars', desc: 'Fast' },
    { value: 1000, label: '1,000 Bars', desc: 'Standard' },
    { value: 2500, label: '2,500 Bars', desc: 'Deep' },
    { value: 5000, label: '5,000 Bars', desc: 'Institutional' },
    { value: 10000, label: '10,000 Bars', desc: 'Max (Uncapped)' },
  ];

  // Deduplicate feeds by symbol so that category alias keys ('forex', 'metals', 'crypto') do not duplicate cards
  const uniqueFeedMap = new Map<string, MultiAssetFeedItem>();
  Object.entries(feeds).forEach(([key, f]) => {
    if (!['forex', 'metals', 'crypto'].includes(key) || !uniqueFeedMap.has(f.symbol)) {
      uniqueFeedMap.set(f.symbol, f);
    }
  });
  const feedList = Array.from(uniqueFeedMap.values());
  const totalBarsSum = feedList.reduce((acc, f) => acc + (f.candles?.length || 0), 0);

  return (
    <div id="multi-asset-data-manager" className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 text-slate-200">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">
              <Layers className="w-4 h-4" />
            </span>
            <h3 className="font-semibold text-white text-base">Multi-Asset Synchronized Data Engine</h3>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {feedList.length} Cross-Asset Pipeline Feeds
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Synchronizes historical OHLCV candles across Forex Majors (EURUSD, GBPUSD, USDJPY, AUDUSD), Metals & Gold (XAUUSD, XAGUSD), and Crypto (BTC, ETH, SOL) into an aligned chronological timeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-sync-all-multi-asset"
            onClick={onSyncAllFeeds}
            disabled={isSyncingAll}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
            {isSyncingAll ? 'Synchronizing Cross-Asset Feeds...' : `Download & Auto-Sync Universe (${feedList.length} Assets)`}
          </button>

          <button
            id="btn-export-multi-asset"
            onClick={onExportFeeds}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition-all"
            title="Download full cross-asset candle dataset package as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            Export Dataset
          </button>
        </div>
      </div>

      {/* Date Range, History Horizon & Timeframe Selector Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-4 pb-4">
        {/* Date Range Presets */}
        <div className="md:col-span-5">
          <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            Backtest Date Horizon & Scope
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                id={`date-preset-${opt.key}`}
                onClick={() => onSelectRange(opt.key)}
                className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-all text-center truncate ${
                  selectedRange === opt.key
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-semibold'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title={opt.label}
              >
                {opt.label.replace('Last ', '').replace(' Days', 'd')}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-500" />
            {currentOption.description}
          </p>
        </div>

        {/* History Horizon / Bar Count Depth (Uncapped Selection) */}
        <div className="md:col-span-4">
          <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            Download History Depth (Bars)
          </label>
          <div className="grid grid-cols-5 gap-1">
            {DEPTH_OPTIONS.map((depth) => (
              <button
                key={depth.value}
                id={`depth-btn-${depth.value}`}
                onClick={() => onHistoryDepthChange?.(depth.value)}
                className={`py-1.5 px-1 text-[11px] font-medium rounded-lg border transition-all text-center truncate ${
                  historyDepthBars === depth.value
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title={`${depth.label} (${depth.desc})`}
              >
                {depth.value >= 1000 ? `${depth.value / 1000}k` : depth.value}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Target: <strong className="text-purple-300 font-mono">{historyDepthBars.toLocaleString()} bars</strong> per asset ({totalBarsSum.toLocaleString()} total in memory)
          </span>
        </div>

        {/* Timeframe & Custom Date Inputs */}
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            Base Resolution
          </label>
          <div className="flex gap-1">
            {['5m', '15m', '1h', '4h', '1d'].map((tf) => (
              <button
                key={tf}
                id={`tf-btn-${tf}`}
                onClick={() => onTimeframeChange(tf)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all text-center ${
                  selectedTimeframe === tf
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Auto-downloads matching multi-TF
          </span>
        </div>
      </div>

      {/* Custom Date Pickers (if custom selected) */}
      {selectedRange === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/60 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Start Date (UTC)</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => onCustomDateChange(e.target.value, customEndDate)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">End Date (UTC)</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => onCustomDateChange(customStartDate, e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* View Switcher Header */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800 mb-3">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-indigo-400" />
          Synchronized Asset Feeds Universe
        </span>
        <div className="flex items-center gap-1 p-0.5 bg-slate-800/80 rounded-lg border border-slate-700">
          <button
            onClick={() => setViewScope('universe')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded ${
              viewScope === 'universe' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Instruments ({feedList.length})
          </button>
          <button
            onClick={() => setViewScope('categories')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded ${
              viewScope === 'categories' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Category Benchmarks (3)
          </button>
        </div>
      </div>

      {/* Live Feed Status Badges Grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${viewScope === 'universe' ? 'lg:grid-cols-3' : 'md:grid-cols-3'} gap-3`}>
        {feedList
          .filter((f) => {
            if (viewScope === 'categories') {
              return ['EURUSD', 'XAUUSD', 'BTCUSDT'].includes(f.symbol);
            }
            return true;
          })
          .map((feed) => {
            const isOk = feed.status === 'ready' && feed.candles.length >= 50;
            const isLoading = feed.status === 'loading';
            const cat = feed.category;

            return (
              <div
                key={feed.symbol}
                id={`feed-card-${feed.symbol}`}
                className={`p-3 rounded-lg border transition-all ${
                  isOk
                    ? 'bg-slate-800/40 border-slate-700/80 hover:border-slate-600'
                    : isLoading
                    ? 'bg-blue-950/20 border-blue-800/50'
                    : 'bg-rose-950/20 border-rose-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-200">{feed.displayName}</span>
                    <span className="ml-1.5 text-[10px] font-mono text-slate-400">({feed.symbol})</span>
                  </div>
                  {isLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  ) : isOk ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ready ({feed.candles?.length || 0} bars)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-rose-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Error
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Category: <strong className="text-blue-300 uppercase font-mono">{cat}</strong></span>
                  <span>Spread: <strong className="text-amber-300 font-mono">{feed.spreadPipsOrPts} {cat === 'forex' ? 'pips' : 'pts'}</strong></span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Source: <strong className="capitalize text-slate-300">{feed.source}</strong></span>
                  <span>Decimals: <strong className="text-slate-300 font-mono">{feed.decimals}</strong></span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Data Source Explanation Note */}
      <div className="mt-4 p-3 bg-blue-950/20 border border-blue-900/30 rounded-lg flex items-start gap-2.5 text-xs text-slate-300">
        <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-blue-300 font-medium">Cross-Asset Timeline Synchronizer: </strong>
          Crypto assets (BTC, ETH, SOL) are retrieved from Binance exchange feeds; Forex Majors (EURUSD, GBPUSD, USDJPY, AUDUSD) and Precious Metals (Gold XAUUSD, Silver XAGUSD) are synced via live market APIs with session synthesis fallback. Every candle aligns across the unified timeline index with zero price cross-contamination.
        </div>
      </div>
    </div>
  );
};
