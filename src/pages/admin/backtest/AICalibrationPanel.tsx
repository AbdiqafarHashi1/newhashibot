import React, { useState } from 'react';
import {
  Sparkles,
  Sliders,
  AlertTriangle,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save,
  Check,
  Bookmark,
  Trash2,
  X,
  Rocket,
} from 'lucide-react';
import {
  AICalibrationReport,
  StrategyTweakProposal,
  AssetCategory,
  AssetCapitalPool,
  BtMetrics,
} from './types';
import { StrategyName } from '../StrategyConfig';
import { CalibrationPreset } from './presetStorage';

interface AICalibrationPanelProps {
  report: AICalibrationReport;
  metrics: BtMetrics;
  capitalPools?: Record<AssetCategory, AssetCapitalPool>;
  activeConflictPolicy: 'highest_score' | 'strict_no_conflict' | 'trend_priority';
  minArbitrationScore: number;
  maxConcurrentTrades: number;
  activePresetId: string;
  savedPresets: CalibrationPreset[];
  onSelectPreset: (preset: CalibrationPreset) => void;
  onSaveCurrentPreset: (name: string, description: string) => void;
  onDeletePreset: (presetId: string) => void;
  onApplyAllRecommendations: (report: AICalibrationReport) => void;
  onApplySingleTweak: (proposal: StrategyTweakProposal) => void;
  onSaveSingleStrategyTweak: (proposal: StrategyTweakProposal) => void;
  onResetDefaults: () => void;
  onDeployToLivePipeline?: (preset: CalibrationPreset) => Promise<void>;
  isCalibrating: boolean;
}

export const AICalibrationPanel: React.FC<AICalibrationPanelProps> = ({
  report,
  metrics,
  activeConflictPolicy,
  minArbitrationScore,
  maxConcurrentTrades,
  activePresetId,
  savedPresets,
  onSelectPreset,
  onSaveCurrentPreset,
  onDeletePreset,
  onApplyAllRecommendations,
  onApplySingleTweak,
  onSaveSingleStrategyTweak,
  onResetDefaults,
  onDeployToLivePipeline,
  isCalibrating,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyName | 'all'>('all');
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [presetDescInput, setPresetDescInput] = useState<string>('');
  const [savedStrategies, setSavedStrategies] = useState<Record<string, boolean>>({});
  const [isDeploying, setIsDeploying] = useState<boolean>(false);

  const isLosing = metrics.totalR < 0 || metrics.netUsd < 0;
  const isHighDrawdown = metrics.maxDrawdownPct > 6.0;

  const filteredProposals =
    selectedStrategy === 'all'
      ? report.recommendations
      : report.recommendations.filter((r) => r.strategy === selectedStrategy);

  const activePreset = savedPresets.find((p) => p.id === activePresetId) || savedPresets[0];

  const handleOpenSaveModal = () => {
    const defaultName = `AI Calibration (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`;
    setPresetNameInput(defaultName);
    setPresetDescInput(`Calibrated with ${activeConflictPolicy.replace(/_/g, ' ')} policy, ${minArbitrationScore} min score, and optimized strategy weights.`);
    setShowSaveModal(true);
  };

  const handleConfirmSavePreset = () => {
    if (!presetNameInput.trim()) return;
    onSaveCurrentPreset(presetNameInput.trim(), presetDescInput.trim());
    setShowSaveModal(false);
  };

  const handleSaveSingleStrategy = (prop: StrategyTweakProposal) => {
    onSaveSingleStrategyTweak(prop);
    setSavedStrategies((prev) => ({ ...prev, [prop.strategy]: true }));
    setTimeout(() => {
      setSavedStrategies((prev) => ({ ...prev, [prop.strategy]: false }));
    }, 2500);
  };

  const handleDeployToLive = async () => {
    if (!onDeployToLivePipeline || !activePreset) return;
    setIsDeploying(true);
    try {
      await onDeployToLivePipeline(activePreset);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div
      id="ai-strategy-calibration-panel"
      className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-purple-800/40 rounded-xl p-4 sm:p-5 mb-6 text-slate-200 shadow-lg relative overflow-hidden min-w-0 max-w-full"
    >
      {/* Subtle Ambient Glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-lg shadow-sm shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-white text-base tracking-wide flex items-center gap-2 flex-wrap">
              <span>AI Strategy Calibration & Optimization Engine</span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  report.overallHealth === 'PROFITABLE'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : report.overallHealth === 'HEALTHY'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {report.overallHealth.replace('_', ' ')}
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated quant diagnostics detecting capital bleed, chop over-trading, and suboptimal risk-reward ratios with 1-click calibration.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* 1-Click AI Apply */}
          <button
            id="btn-apply-all-ai-calibrations"
            onClick={() => onApplyAllRecommendations(report)}
            disabled={isCalibrating}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-purple-500/20 transition-all disabled:opacity-50 text-center"
            title="Apply all AI recommendations and recalibrate arbitration weights"
          >
            <Zap className={`w-3.5 h-3.5 shrink-0 ${isCalibrating ? 'animate-bounce' : 'text-amber-300'}`} />
            <span>{isCalibrating ? 'Calibrating...' : '✨ Apply AI Calibration'}</span>
          </button>

          {/* Direct Deploy to Live/Demo Pipeline */}
          {onDeployToLivePipeline && (
            <button
              id="btn-deploy-to-live-pipeline"
              onClick={handleDeployToLive}
              disabled={isDeploying || isCalibrating}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-emerald-500/20 transition-all disabled:opacity-50 text-center"
              title="Commit active calibration preset directly into production & demo strategy configurations"
            >
              <Rocket className={`w-3.5 h-3.5 shrink-0 ${isDeploying ? 'animate-spin' : 'text-emerald-200'}`} />
              <span>{isDeploying ? 'Deploying...' : '🚀 Deploy Preset'}</span>
            </button>
          )}

          {/* Save All Settings as Preset Button */}
          <button
            id="btn-save-all-preset"
            onClick={handleOpenSaveModal}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 text-xs font-semibold rounded-lg border border-emerald-500/40 transition-all shadow-sm"
            title="Save current calibration & arbitration conflict policy as a named preset profile"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Save Profile</span>
          </button>

          {/* Reset Defaults Button */}
          <button
            id="btn-reset-ai-calibrations"
            onClick={onResetDefaults}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition-all"
            title="Reset strategy parameters, weights, and conflict policy back to base system defaults"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Reset Defaults</span>
          </button>

          {/* Toggle Accordion */}
          <button
            id="btn-toggle-ai-panel"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all shrink-0"
            title={isExpanded ? 'Collapse Calibration Panel' : 'Expand Calibration Panel'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Preset Reference & Switcher Bar */}
      <div className="py-2.5 px-3.5 bg-slate-950/70 border-b border-slate-800/80 -mx-4 sm:-mx-5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Bookmark className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-slate-400 whitespace-nowrap">Active Profile:</span>
          <select
            id="select-calibration-preset"
            value={activePreset?.id || 'base_default'}
            onChange={(e) => {
              const selected = savedPresets.find((p) => p.id === e.target.value);
              if (selected) onSelectPreset(selected);
            }}
            className="bg-slate-800 border border-purple-500/40 rounded-lg px-2.5 py-1 text-xs text-purple-200 font-semibold focus:outline-none focus:border-purple-400 cursor-pointer max-w-full"
          >
            {savedPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.isBaseDefault ? '★ ' : p.isBuiltin ? '◆ ' : '● '} {p.name}
              </option>
            ))}
          </select>

          {/* Conflict Policy Badge */}
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
            Policy: <strong className="text-purple-300 uppercase">{activeConflictPolicy.replace(/_/g, ' ')}</strong>
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
            Min Score: <strong className="text-indigo-300">{minArbitrationScore}</strong>
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
            Max Trades: <strong className="text-amber-300">{maxConcurrentTrades}</strong>
          </span>
        </div>

        {/* Preset Description & Delete Option (if user preset) */}
        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span className="truncate max-w-xs text-slate-400">{activePreset?.description}</span>
          {!activePreset?.isBuiltin && (
            <button
              onClick={() => onDeletePreset(activePreset.id)}
              className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/40 rounded transition-all"
              title="Delete this saved preset"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="pt-4 space-y-4 relative z-10">
          {/* Diagnostic Alert Box */}
          {(isLosing || isHighDrawdown) && (
            <div className="p-3.5 bg-rose-950/30 border border-rose-800/40 rounded-xl flex items-start gap-3 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-slate-300">
                <div className="font-semibold text-rose-300">Loss & Drawdown Diagnostic Alert:</div>
                <ul className="list-disc pl-4 space-y-1 text-slate-300/90 text-[11px]">
                  {report.lossDiagnosis.map((d, i) => (
                    <li key={`loss-diag-${i}`}>{d}</li>
                  ))}
                  {report.drawdownDiagnosis.map((d, i) => (
                    <li key={`dd-diag-${i}`}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Forecasted Improvement Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-800/40 border border-slate-700/60 rounded-xl text-center">
            <div className="p-2 bg-slate-900/60 rounded-lg">
              <span className="text-[10px] text-slate-400 block mb-0.5">Projected Realized Return</span>
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-xs font-mono text-slate-400 line-through">
                  {metrics.totalR >= 0 ? `+${metrics.totalR}R` : `${metrics.totalR}R`}
                </span>
                <ArrowRight className="w-3 h-3 text-emerald-400" />
                <span className="text-sm font-bold font-mono text-emerald-400">
                  +{report.projectedPortfolioReturnR}R
                </span>
              </div>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5">Alpha expansion</span>
            </div>

            <div className="p-2 bg-slate-900/60 rounded-lg">
              <span className="text-[10px] text-slate-400 block mb-0.5">Target Win Rate</span>
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-xs font-mono text-slate-400 line-through">{metrics.winRate}%</span>
                <ArrowRight className="w-3 h-3 text-emerald-400" />
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {report.projectedWinRatePct}%
                </span>
              </div>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5">+Quality gate filtering</span>
            </div>

            <div className="p-2 bg-slate-900/60 rounded-lg">
              <span className="text-[10px] text-slate-400 block mb-0.5">Max Portfolio Drawdown</span>
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-xs font-mono text-rose-400 line-through">{metrics.maxDrawdownPct}%</span>
                <ArrowRight className="w-3 h-3 text-emerald-400" />
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {report.projectedDrawdownPct}%
                </span>
              </div>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5">Capital preservation</span>
            </div>
          </div>

          {/* Filter Bar for Strategy Proposals */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Strategy Tweak Proposals ({filteredProposals.length}):</span>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setSelectedStrategy('all')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded capitalize border ${
                  selectedStrategy === 'all'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-semibold'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                All Strategies ({report.recommendations.length})
              </button>
              {report.recommendations.map((r) => (
                <button
                  key={r.strategy}
                  onClick={() => setSelectedStrategy(r.strategy)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded border ${
                    selectedStrategy === r.strategy
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-semibold'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r.strategy}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy Tweak Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProposals.map((prop) => {
              const statusBadge =
                prop.status === 'PRIME_ALPHA'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : prop.status === 'CHOP_BLEED' || prop.status === 'OVER_TRADING'
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : 'bg-blue-500/10 text-blue-300 border-blue-500/30';

              const isSaved = Boolean(savedStrategies[prop.strategy]);

              return (
                <div
                  key={prop.strategy}
                  id={`ai-proposal-${prop.strategy}`}
                  className="p-3.5 bg-slate-800/50 border border-slate-700/70 rounded-xl hover:border-purple-600/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
                      <span className="font-semibold text-xs text-white truncate">{prop.strategy}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border ${statusBadge}`}>
                        {prop.status.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">{prop.rationale}</p>
                    <p className="text-[10px] text-emerald-400/90 mt-1 font-medium">{prop.expectedImprovement}</p>

                    {/* Parameter Diff Badges */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-800 text-[11px] font-mono">
                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-[10px] text-slate-400 block font-sans">Arbitration Weight:</span>
                        <span className="text-slate-400 line-through">{prop.currentWeight}x</span>
                        <span className="text-purple-300 font-bold ml-1.5">→ {prop.recommendedWeight}x</span>
                      </div>

                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-[10px] text-slate-400 block font-sans">Min Setup Score:</span>
                        <span className="text-slate-400 line-through">{prop.currentMinScore}</span>
                        <span className="text-indigo-300 font-bold ml-1.5">→ {prop.recommendedMinScore}</span>
                      </div>

                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-[10px] text-slate-400 block font-sans">Take-Profit 2 R:</span>
                        <span className="text-slate-400 line-through">{prop.currentTp2R}R</span>
                        <span className="text-emerald-400 font-bold ml-1.5">→ {prop.recommendedTp2R}R</span>
                      </div>

                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-[10px] text-slate-400 block font-sans">Stop Loss ATR:</span>
                        <span className="text-slate-400 line-through">{prop.currentStopAtrMult}x</span>
                        <span className="text-amber-400 font-bold ml-1.5">→ {prop.recommendedStopAtrMult}x</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Apply Tweak & Save to Strategy Config */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-800/80">
                    <button
                      id={`btn-apply-tweak-${prop.strategy}`}
                      onClick={() => onApplySingleTweak(prop)}
                      className="py-1.5 px-2.5 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/50 hover:border-purple-600 text-purple-200 text-[11px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1"
                      title="Apply this strategy tweak to the active simulation"
                    >
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      Apply Tweak
                    </button>

                    <button
                      id={`btn-save-strategy-${prop.strategy}`}
                      onClick={() => handleSaveSingleStrategy(prop)}
                      className={`py-1.5 px-2.5 text-[11px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1 border ${
                        isSaved
                          ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300'
                          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                      title="Save these parameters permanently to Strategy Config"
                    >
                      {isSaved ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Saved ✓
                        </>
                      ) : (
                        <>
                          <Save className="w-3 h-3 text-slate-400" />
                          Save to Config
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-purple-800/60 rounded-xl p-5 max-w-md w-full text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-purple-400" />
                <h4 className="font-bold text-white text-sm">Save Calibration Preset Profile</h4>
              </div>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Preset Profile Name</label>
                <input
                  type="text"
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  placeholder="e.g. AI Calibrated Alpha V1"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description / Notes</label>
                <textarea
                  value={presetDescInput}
                  onChange={(e) => setPresetDescInput(e.target.value)}
                  placeholder="Optional description of this profile's market regime..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-normal focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              {/* Policy & Parameter Snapshot */}
              <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1 font-mono text-[11px]">
                <div className="text-slate-400 font-sans font-semibold mb-1">Snapshot of Preserved Settings:</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Arbitration Conflict Policy:</span>
                  <strong className="text-purple-300 uppercase">{activeConflictPolicy.replace(/_/g, ' ')}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Min Arbitration Score:</span>
                  <strong className="text-indigo-300">{minArbitrationScore}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Concurrent Positions:</span>
                  <strong className="text-amber-300">{maxConcurrentTrades}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSavePreset}
                disabled={!presetNameInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                Save & Reference Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
