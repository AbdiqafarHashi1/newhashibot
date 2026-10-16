import { useState } from 'react';
import {
  Calculator,
  ShieldCheck,
  Zap,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface StrategyHistoricalMetric {
  id: string;
  name: string;
  winRate: number;      // p
  winLossRatio: number; // b = avg win / avg loss
  baseGkVol: number;
}

const STRATEGY_DATA: Record<string, StrategyHistoricalMetric> = {
  'crypto.micro-scalper': { id: 'crypto.micro-scalper', name: 'Crypto Micro Scalper (1m/5m)', winRate: 0.64, winLossRatio: 1.45, baseGkVol: 0.00030 },
  'crypto.quick-scalp': { id: 'crypto.quick-scalp', name: 'Crypto Quick Scalp (5m)', winRate: 0.62, winLossRatio: 1.50, baseGkVol: 0.00032 },
  'crypto.compression-breakout': { id: 'crypto.compression-breakout', name: 'Crypto Compression Breakout (15m)', winRate: 0.52, winLossRatio: 2.30, baseGkVol: 0.00045 },
  'crypto.swing-continuation': { id: 'crypto.swing-continuation', name: 'Crypto Swing Continuation (1h)', winRate: 0.48, winLossRatio: 2.75, baseGkVol: 0.00055 },
  'crypto.reversal-exhaustion': { id: 'crypto.reversal-exhaustion', name: 'Crypto Reversal Exhaustion (15m)', winRate: 0.58, winLossRatio: 1.80, baseGkVol: 0.00040 },
  'crypto.momentum-breakout': { id: 'crypto.momentum-breakout', name: 'Crypto Momentum Breakout (15m/1h)', winRate: 0.50, winLossRatio: 2.40, baseGkVol: 0.00050 },
  'forex.micro-scalper': { id: 'forex.micro-scalper', name: 'Forex Micro Scalper (1m/5m)', winRate: 0.66, winLossRatio: 1.35, baseGkVol: 0.00018 },
  'forex.london-breakout': { id: 'forex.london-breakout', name: 'Forex London Breakout (15m)', winRate: 0.54, winLossRatio: 2.10, baseGkVol: 0.00025 },
  'forex.new-york-continuation': { id: 'forex.new-york-continuation', name: 'Forex NY Continuation (15m)', winRate: 0.56, winLossRatio: 1.95, baseGkVol: 0.00028 },
  'forex.trend-pullback': { id: 'forex.trend-pullback', name: 'Forex Trend Pullback (1h)', winRate: 0.53, winLossRatio: 2.15, baseGkVol: 0.00022 },
  'gold.volatility-breakout': { id: 'gold.volatility-breakout', name: 'Gold Volatility Breakout (15m/1h)', winRate: 0.49, winLossRatio: 2.80, baseGkVol: 0.00095 },
  'macro.yield-differential': { id: 'macro.yield-differential', name: 'Macro Yield Differential (4h/1D)', winRate: 0.60, winLossRatio: 1.90, baseGkVol: 0.00020 },
};

export function KellyOptimizerVisualizer() {
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('crypto.compression-breakout');
  const [executionMode, setExecutionMode] = useState<'STRICT_PROP_GUARDRAIL' | 'AGGRESSIVE_PERSONAL'>('STRICT_PROP_GUARDRAIL');
  const [fractionMode, setFractionMode] = useState<'QUARTER_KELLY' | 'HALF_KELLY' | 'FULL_KELLY'>('QUARTER_KELLY');
  
  // Interactive inputs
  const [accountBalance, setAccountBalance] = useState<number>(100000);
  const [entryPrice, setEntryPrice] = useState<number>(64200);
  const [stopLossPrice, setStopLossPrice] = useState<number>(63200);
  const [consecutiveLosses, setConsecutiveLosses] = useState<number>(0);
  const [simulatedGkVol, setSimulatedGkVol] = useState<number>(0.00045);
  const [regimeMultiplier, setRegimeMultiplier] = useState<number>(1.15);

  const strat = STRATEGY_DATA[selectedStrategyId] || STRATEGY_DATA['crypto.compression-breakout'];

  // Math: Continuous Unconstrained Kelly
  // f* = (p * b - q) / b
  const p = strat.winRate;
  const b = strat.winLossRatio;
  const q = 1.0 - p;
  const rawKelly = Math.max(0, (p * b - q) / b);

  // Microstructural Volatility Damping
  const volRatio = Math.max(0.2, Math.min(5.0, simulatedGkVol / Math.max(1e-6, strat.baseGkVol)));
  const volDamping = 1.0 / Math.sqrt(volRatio);
  const dampedKelly = rawKelly * volDamping;

  // Regime Adjusting
  const regimeAdjustedKelly = dampedKelly * regimeMultiplier;

  // Fractional Multiplier
  let fractionMultiplier = 0.5; // Half
  if (executionMode === 'STRICT_PROP_GUARDRAIL') {
    fractionMultiplier = 0.25; // Quarter enforced
  } else {
    if (fractionMode === 'QUARTER_KELLY') fractionMultiplier = 0.25;
    if (fractionMode === 'HALF_KELLY') fractionMultiplier = 0.50;
    if (fractionMode === 'FULL_KELLY') fractionMultiplier = 1.00;
  }

  // Loss streak decay factor
  const lossStreakFactor = consecutiveLosses >= 2 ? Math.pow(0.5, consecutiveLosses - 1) : 1.0;

  // Sizing before guardrail cap
  const proposedFraction = regimeAdjustedKelly * fractionMultiplier * lossStreakFactor;

  // Stop Loss Distance %
  const slDistancePct = Math.max(0.002, Math.abs(entryPrice - stopLossPrice) / Math.max(1e-6, entryPrice));
  const maxRiskPct = executionMode === 'STRICT_PROP_GUARDRAIL' ? 0.015 : 0.080; // 1.5% prop vs 8.0% personal

  const proposedRiskPct = proposedFraction * slDistancePct;
  const isCapped = proposedRiskPct > maxRiskPct;
  const finalFraction = isCapped ? maxRiskPct / slDistancePct : proposedFraction;

  const allocatedMarginUsd = accountBalance * finalFraction;
  const notionalUsd = slDistancePct > 0 ? allocatedMarginUsd / slDistancePct : 0;
  const recommendedUnits = notionalUsd / Math.max(1e-6, entryPrice);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Calculator size={18} />
            </span>
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Continuous Dynamic Kelly Optimizer
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                f* FORMULA
              </span>
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Dynamic continuous fractional Kelly sizing with microstructural volatility damping and prop-firm safety guardrails.
          </p>
        </div>

        {/* Execution Mode Selector */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 self-start sm:self-auto">
          <button
            onClick={() => setExecutionMode('STRICT_PROP_GUARDRAIL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              executionMode === 'STRICT_PROP_GUARDRAIL'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldCheck size={14} /> PROP GUARDRAIL (1.5%)
          </button>
          <button
            onClick={() => setExecutionMode('AGGRESSIVE_PERSONAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              executionMode === 'AGGRESSIVE_PERSONAL'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap size={14} /> AGGRESSIVE PERSONAL
          </button>
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Strategy Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-zinc-400 uppercase font-bold">Quantitative Strategy</label>
          <select
            value={selectedStrategyId}
            onChange={(e) => setSelectedStrategyId(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-medium text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            {Object.values(STRATEGY_DATA).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (Win: {(s.winRate * 100).toFixed(0)}%, Odds: {s.winLossRatio.toFixed(2)}x)
              </option>
            ))}
          </select>
        </div>

        {/* Account Equity */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-zinc-400 uppercase font-bold">Account Balance (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-zinc-500 text-xs">$</span>
            <input
              type="number"
              value={accountBalance}
              onChange={(e) => setAccountBalance(Math.max(100, Number(e.target.value)))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Fraction Mode (Only configurable in Personal Mode) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-zinc-400 uppercase font-bold">Kelly Sizing Fraction</label>
          {executionMode === 'STRICT_PROP_GUARDRAIL' ? (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-400 flex items-center justify-between">
              <span>0.25x (Quarter Kelly Enforced)</span>
              <ShieldCheck size={14} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                onClick={() => setFractionMode('QUARTER_KELLY')}
                className={`py-1 text-[11px] font-mono font-bold rounded-lg ${
                  fractionMode === 'QUARTER_KELLY' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500'
                }`}
              >
                0.25x
              </button>
              <button
                onClick={() => setFractionMode('HALF_KELLY')}
                className={`py-1 text-[11px] font-mono font-bold rounded-lg ${
                  fractionMode === 'HALF_KELLY' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500'
                }`}
              >
                0.50x
              </button>
              <button
                onClick={() => setFractionMode('FULL_KELLY')}
                className={`py-1 text-[11px] font-mono font-bold rounded-lg ${
                  fractionMode === 'FULL_KELLY' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500'
                }`}
              >
                1.00x
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trade Parameters & Dynamic Modifiers */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Entry Price</label>
          <input
            type="number"
            value={entryPrice}
            onChange={(e) => setEntryPrice(Number(e.target.value))}
            className="w-full bg-transparent font-mono font-bold text-sm text-zinc-100 focus:outline-none"
          />
        </div>

        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Stop Loss Price</label>
          <input
            type="number"
            value={stopLossPrice}
            onChange={(e) => setStopLossPrice(Number(e.target.value))}
            className="w-full bg-transparent font-mono font-bold text-sm text-red-400 focus:outline-none"
          />
        </div>

        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">GK Volatility (σ_GK)</label>
          <input
            type="number"
            step="0.00005"
            value={simulatedGkVol}
            onChange={(e) => setSimulatedGkVol(Number(e.target.value))}
            className="w-full bg-transparent font-mono font-bold text-sm text-blue-400 focus:outline-none"
          />
        </div>

        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">Loss Streak (Backoff)</label>
          <input
            type="number"
            min="0"
            max="10"
            value={consecutiveLosses}
            onChange={(e) => setConsecutiveLosses(Math.max(0, Number(e.target.value)))}
            className="w-full bg-transparent font-mono font-bold text-sm text-zinc-100 focus:outline-none"
          />
        </div>

        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
          <label className="text-[10px] font-mono text-zinc-500 uppercase">HMM Regime Multiplier</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="2"
            value={regimeMultiplier}
            onChange={(e) => setRegimeMultiplier(Number(e.target.value))}
            className="w-full bg-transparent font-mono font-bold text-sm text-emerald-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Calculation Pipeline Stages */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Step 1: Raw Kelly */}
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
          <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">1. Raw Continuous Kelly</div>
          <div className="text-xl font-mono font-black text-indigo-400">
            {(rawKelly * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] text-zinc-400">
            f* = ({strat.winRate} × {strat.winLossRatio} - {q.toFixed(2)}) / {strat.winLossRatio}
          </div>
        </div>

        {/* Step 2: Damped Kelly */}
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
          <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">2. Volatility Damped</div>
          <div className="text-xl font-mono font-black text-blue-400">
            {(dampedKelly * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] text-zinc-400">
            Damping factor: {(volDamping * 100).toFixed(1)}%
          </div>
        </div>

        {/* Step 3: Regime Scaled */}
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
          <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">3. Regime & Streak Adjusted</div>
          <div className="text-xl font-mono font-black text-amber-400">
            {(proposedFraction * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] text-zinc-400">
            Streak Decay: {consecutiveLosses >= 2 ? `${(lossStreakFactor * 100).toFixed(0)}%` : 'None'}
          </div>
        </div>

        {/* Step 4: Final Margin & Risk */}
        <div className={`p-3.5 rounded-xl border space-y-1 ${
          isCapped ? 'bg-amber-950/20 border-amber-800/50' : 'bg-emerald-950/20 border-emerald-800/50'
        }`}>
          <div className="text-[10px] font-mono uppercase font-bold flex items-center justify-between">
            <span className={isCapped ? 'text-amber-400' : 'text-emerald-400'}>4. Final Margin Sizing</span>
            {isCapped ? <AlertTriangle size={12} className="text-amber-400" /> : <CheckCircle2 size={12} className="text-emerald-400" />}
          </div>
          <div className="text-xl font-mono font-black text-zinc-100">
            ${allocatedMarginUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-zinc-400 font-mono">
            Fraction: {(finalFraction * 100).toFixed(2)}% of equity
          </div>
        </div>
      </div>

      {/* Sizing Recommendation Banner */}
      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-zinc-400 uppercase font-bold flex items-center gap-1.5">
            <DollarSign size={14} className="text-emerald-400" /> Recommended Position Allocation
          </div>
          <div className="text-sm font-semibold text-zinc-200">
            Deploy <span className="font-mono text-emerald-400 font-bold">{recommendedUnits.toFixed(4)} Units</span> (${notionalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} notional) with <span className="font-mono text-zinc-100 font-bold">${allocatedMarginUsd.toFixed(2)}</span> margin.
          </div>
        </div>

        {isCapped && (
          <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 self-start sm:self-auto">
            <AlertTriangle size={14} /> Risk capped at {(maxRiskPct * 100).toFixed(1)}% by Guardrail
          </div>
        )}
      </div>
    </div>
  );
}

