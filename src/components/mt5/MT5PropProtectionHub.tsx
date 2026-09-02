import { useState } from 'react';
import { 
  ShieldCheck, Lock, Award, TrendingUp, Zap, 
  Activity, RefreshCw, Plus, ArrowUpRight,
  AlertOctagon
} from 'lucide-react';
import { 
  LiveMT5AccountState, 
  executeLiveMT5Order, 
  closeLiveMT5Position, 
  emergencyPanicCloseAll, 
  calculatePreciseLotSize
} from '../../lib/mt5LiveEngine';
import { LIVE_CONFLUENCE_SIGNALS, QuantitativeSignal } from '../../lib/tradeQualityEngine';

interface Props {
  accounts: LiveMT5AccountState[];
  selectedAccount: LiveMT5AccountState | null;
  onSelectAccount: (acc: LiveMT5AccountState) => void;
  onOpenConnectModal: () => void;
  onRefresh: () => void;
}

export function MT5PropProtectionHub({
  accounts,
  selectedAccount,
  onSelectAccount,
  onOpenConnectModal,
  onRefresh
}: Props) {
  const [executingSignalId, setExecutingSignalId] = useState<string | null>(null);
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [isPanicking, setIsPanicking] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [customRiskPct, setCustomRiskPct] = useState<number>(0.50);

  const account = selectedAccount;

  // Prop metrics calculations
  const initialBalance = account?.initialBalance || 100000;
  const equity = account?.equity || 100000;
  const balance = account?.balance || 100000;
  const todayStarting = account?.todayStartingBalance || balance;
  
  // Daily drawdown
  const todayLossDollar = Math.max(0, todayStarting - equity);
  const dailyLossPct = (todayLossDollar / todayStarting) * 100;
  const maxDailyAllowedPct = account?.maxDailyLossPct || 5.0;
  const dailyDrawdownRemainingPct = Math.max(0, maxDailyAllowedPct - dailyLossPct);

  // Total drawdown
  const peakEquity = account?.peakEquity || initialBalance;
  const totalDrawdownDollar = Math.max(0, peakEquity - equity);
  const totalDrawdownPct = (totalDrawdownDollar / initialBalance) * 100;
  const maxTotalAllowedPct = account?.maxTotalLossPct || 10.0;
  const totalDrawdownRemainingPct = Math.max(0, maxTotalAllowedPct - totalDrawdownPct);

  // Profit target
  const profitTargetPct = account?.profitTargetPct || 10.0;
  const currentProfitDollar = equity - initialBalance;
  const profitProgressPct = Math.min(100, Math.max(0, (currentProfitDollar / (initialBalance * (profitTargetPct / 100))) * 100));

  const isDailyDanger = dailyLossPct >= maxDailyAllowedPct * 0.7;
  const isHardLocked = dailyLossPct >= maxDailyAllowedPct * 0.85;

  const handleExecuteSignal = async (signal: QuantitativeSignal) => {
    if (!account) return;
    setExecutingSignalId(signal.id);
    setActionFeedback(null);

    const { lotSize, dollarRisk, pipDistance } = calculatePreciseLotSize({
      accountBalance: account.balance,
      riskPct: customRiskPct,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      symbol: signal.symbol
    });

    const result = await executeLiveMT5Order({
      accountId: account.id,
      symbol: signal.symbol,
      side: signal.direction,
      volume: lotSize,
      orderType: 'market',
      price: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.tp1,
      tp2: signal.tp2,
      riskPct: customRiskPct,
      strategyName: signal.strategyName,
      comment: `HashiBot Prop ${signal.strategyName}`,
      mode: 'prop'
    });

    setExecutingSignalId(null);
    if (result.success) {
      setActionFeedback({
        text: `✓ ${result.message} (Risk: $${dollarRisk} / ${customRiskPct}%, ${pipDistance} pips SL)`,
        type: 'success'
      });
      onRefresh();
    } else {
      setActionFeedback({ text: result.message, type: 'error' });
    }
  };

  const handleClosePosition = async (ticket: number) => {
    if (!account) return;
    setClosingTicket(ticket);
    const res = await closeLiveMT5Position(account.id, ticket, 'manual_prop_close');
    setClosingTicket(null);
    if (res.success) {
      setActionFeedback({ text: res.message, type: 'success' });
      onRefresh();
    } else {
      setActionFeedback({ text: res.message, type: 'error' });
    }
  };

  const handleEmergencyPanic = async () => {
    if (!account || !window.confirm('EMERGENCY ACTION: Are you sure you want to CLOSE ALL open positions on this prop account immediately?')) return;
    setIsPanicking(true);
    const res = await emergencyPanicCloseAll(account.id);
    setIsPanicking(false);
    if (res.success) {
      setActionFeedback({
        text: `✓ EMERGENCY FLAT: Successfully closed ${res.closedCount} positions. Realized Net PnL: ${res.totalPnl >= 0 ? '+' : ''}$${res.totalPnl} USD.`,
        type: 'success'
      });
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Account Switcher Bar */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/40 via-zinc-900 to-indigo-950/30 p-5 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                <Award size={12} />
                Prop Challenge Preservation Engine
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live MT5 Bridge
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              MT5 Prop Firm Account Governor
            </h1>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Engineered to strictly protect FTMO, FundedNext, and MFF challenge rules. Enforces hard 5% daily drawdown stops, news blackout protection, and dynamic 0.5% lot sizing.
            </p>
          </div>

          {/* Account Selector Dropdown & Connect Button */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-800 rounded-xl p-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold pl-2">
                Active Prop Account:
              </label>
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => {
                  const target = accounts.find(a => a.id === e.target.value);
                  if (target) onSelectAccount(target);
                }}
                className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-bold focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.nickname} — {acc.accountNumberMasked} (${acc.equity.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onOpenConnectModal}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-lg shadow-purple-900/30 transition-all"
            >
              <Plus size={14} />
              Connect Prop Account
            </button>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between animate-fadeIn ${
          actionFeedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span>{actionFeedback.text}</span>
          <button onClick={() => setActionFeedback(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Primary KPI & Prop Drawdown Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Daily Drawdown Meter */}
        <div className={`p-4 rounded-2xl border ${
          isHardLocked 
            ? 'bg-red-950/30 border-red-500/50 text-red-200' 
            : isDailyDanger 
            ? 'bg-amber-950/20 border-amber-500/40 text-amber-200' 
            : 'bg-zinc-900/80 border-zinc-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <ShieldCheck size={14} className={isHardLocked ? 'text-red-400' : 'text-purple-400'} />
              Daily Drawdown (Max {maxDailyAllowedPct}%)
            </span>
            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
              isHardLocked ? 'bg-red-500/20 text-red-300' : 'bg-zinc-800 text-zinc-300'
            }`}>
              {dailyDrawdownRemainingPct.toFixed(2)}% Left
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {dailyLossPct.toFixed(2)}%
            <span className="text-xs font-normal text-zinc-400 ml-1.5">
              (${todayLossDollar.toFixed(2)} / ${(todayStarting * (maxDailyAllowedPct / 100)).toFixed(0)})
            </span>
          </div>
          {/* Progress Bar */}
          <div className="w-full h-2 bg-zinc-800 rounded-full mt-3 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                dailyLossPct > 3.5 ? 'bg-red-500' : dailyLossPct > 2.0 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, (dailyLossPct / maxDailyAllowedPct) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">
            {isHardLocked ? '🚨 HARD CIRCUIT BREAKER ACTIVE' : '✓ Safe zone. Execution authorized.'}
          </p>
        </div>

        {/* Total Overall Drawdown Meter */}
        <div className="p-4 rounded-2xl border bg-zinc-900/80 border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Lock size={14} className="text-indigo-400" />
              Total Max Drawdown ({maxTotalAllowedPct}%)
            </span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {totalDrawdownRemainingPct.toFixed(2)}% Buffer
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {totalDrawdownPct.toFixed(2)}%
            <span className="text-xs font-normal text-zinc-400 ml-1.5">
              (Peak: ${peakEquity.toLocaleString()})
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full mt-3 overflow-hidden">
            <div 
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (totalDrawdownPct / maxTotalAllowedPct) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">
            Floor Limit: ${(initialBalance * (1 - maxTotalAllowedPct / 100)).toLocaleString()} USD
          </p>
        </div>

        {/* Profit Target Progress */}
        <div className="p-4 rounded-2xl border bg-zinc-900/80 border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <TrendingUp size={14} className="text-emerald-400" />
              Challenge Target (+{profitTargetPct}%)
            </span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              {profitProgressPct.toFixed(1)}% Completed
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            +${Math.max(0, currentProfitDollar).toFixed(2)}
            <span className="text-xs font-normal text-zinc-400 ml-1.5">
              / ${(initialBalance * (profitTargetPct / 100)).toLocaleString()} target
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full mt-3 overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${profitProgressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">
            Remaining to pass: ${Math.max(0, (initialBalance * (profitTargetPct / 100)) - currentProfitDollar).toFixed(2)} USD
          </p>
        </div>

        {/* Live Account Equity & Margin */}
        <div className="p-4 rounded-2xl border bg-zinc-900/80 border-zinc-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-zinc-400">Live Equity & Margin</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-2xl font-black text-white font-mono">
              ${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-zinc-400 mt-1 flex justify-between">
              <span>Floating PnL:</span>
              <span className={`font-mono font-bold ${(account?.floatingPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(account?.floatingPnl || 0) >= 0 ? '+' : ''}${(account?.floatingPnl || 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Server: {account?.server}</span>
            <span>Leverage: 1:{account?.leverage}</span>
          </div>
        </div>
      </div>

      {/* Non-Negotiable Challenge Safety Governor Controls */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-purple-400" />
            <h3 className="font-bold text-sm text-zinc-100">
              Active Challenge Safety Guards
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 font-semibold">Fixed Fractional Risk:</span>
              <select
                value={customRiskPct}
                onChange={(e) => setCustomRiskPct(Number(e.target.value))}
                className="bg-transparent text-purple-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value={0.25}>0.25% (Ultra Safe)</option>
                <option value={0.50}>0.50% (Recommended Prop)</option>
                <option value={0.75}>0.75% (Moderate)</option>
                <option value={1.00}>1.00% (Aggressive)</option>
              </select>
            </div>
            
            {account && account.openPositions.length > 0 && (
              <button
                onClick={handleEmergencyPanic}
                disabled={isPanicking}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/40 transition-all flex items-center gap-1.5"
              >
                <AlertOctagon size={13} />
                Panic Close All ({account.openPositions.length})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-400 font-semibold">News Blackout Guard</span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">ACTIVE</span>
            </div>
            <p className="text-xs font-mono text-zinc-200">±15m High Impact News Block</p>
            <p className="text-[10px] text-zinc-500 mt-1">Pauses signals before FOMC, NFP, CPI</p>
          </div>

          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-400 font-semibold">2-Loss Damping Rule</span>
              <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">ACTIVE</span>
            </div>
            <p className="text-xs font-mono text-zinc-200">50% Risk Reduction</p>
            <p className="text-[10px] text-zinc-500 mt-1">Auto-halves lots after 2 consecutive losses</p>
          </div>

          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-400 font-semibold">Weekend Auto-Flat</span>
              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">ARMED</span>
            </div>
            <p className="text-xs font-mono text-zinc-200">Friday 21:00 UTC Close</p>
            <p className="text-[10px] text-zinc-500 mt-1">Avoids Sunday weekend gap breaches</p>
          </div>

          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-zinc-400 font-semibold">Min R:R Filter</span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">≥ 1:2.0</span>
            </div>
            <p className="text-xs font-mono text-zinc-200">Positive Expectancy Only</p>
            <p className="text-[10px] text-zinc-500 mt-1">Rejects negative expectancy scalps</p>
          </div>
        </div>
      </div>

      {/* Active Open MT5 Positions Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-lg overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-purple-400" />
            <h3 className="font-bold text-sm text-zinc-100">
              Live MT5 Open Positions ({account?.openPositions?.length || 0})
            </h3>
          </div>
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {(!account?.openPositions || account.openPositions.length === 0) ? (
          <div className="p-8 text-center text-zinc-500 text-xs">
            No active positions open on {account?.nickname || 'selected MT5 account'}. Capital is 100% protected in cash.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/50 text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Side</th>
                  <th className="py-3 px-4">Volume</th>
                  <th className="py-3 px-4">Open Price</th>
                  <th className="py-3 px-4">Current</th>
                  <th className="py-3 px-4">SL / TP</th>
                  <th className="py-3 px-4">Unrealized PnL</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {account.openPositions.map((pos) => {
                  const isProfit = pos.unrealizedPnl >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 text-zinc-400 font-bold">#{pos.ticket}</td>
                      <td className="py-3 px-4 text-white font-bold">{pos.symbol}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pos.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {pos.side}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-200">{pos.volume} lots</td>
                      <td className="py-3 px-4 text-zinc-300">{pos.openPrice}</td>
                      <td className="py-3 px-4 text-zinc-100 font-bold">{pos.currentPrice}</td>
                      <td className="py-3 px-4 text-zinc-400 text-[11px]">
                        SL: {pos.stopLoss} | TP: {pos.takeProfit}
                      </td>
                      <td className={`py-3 px-4 font-bold text-sm ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} USD
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleClosePosition(pos.ticket)}
                          disabled={closingTicket === pos.ticket}
                          className="px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-300 transition-colors"
                        >
                          {closingTicket === pos.ticket ? 'Closing...' : 'Close'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* High-Confluence Prop Signals Filter Feed */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-purple-400" />
              <h3 className="font-bold text-sm text-zinc-100">
                Institutional High-Confluence Prop Signals (Curated)
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Filtered through 4-layer quantitative confluence (HMM regime + FVG + 1:2.0 R:R + spread clear). Ready for instant execution.
            </p>
          </div>
          <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2.5 py-1 rounded-lg">
            Fixed Risk per setup: {customRiskPct}% (${((account?.balance || 100000) * (customRiskPct / 100)).toFixed(0)} USD)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {LIVE_CONFLUENCE_SIGNALS.map((sig) => {
            const isApproved = sig.propVerdict === 'PROP_APPROVED';
            const { lotSize, dollarRisk, pipDistance } = calculatePreciseLotSize({
              accountBalance: account?.balance || 100000,
              riskPct: customRiskPct,
              entryPrice: sig.entryPrice,
              stopLoss: sig.stopLoss,
              symbol: sig.symbol
            });

            return (
              <div 
                key={sig.id}
                className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/60 hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-white font-mono">{sig.symbol}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sig.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {sig.direction}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-semibold">{sig.timeframe}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isApproved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {sig.propVerdict}
                      </span>
                      <span className="text-xs font-black text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                        {sig.confluenceScore}% Confluence
                      </span>
                    </div>
                  </div>

                  <p className="text-xs font-bold text-zinc-200">{sig.strategyName}</p>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{sig.rationale}</p>

                  <div className="grid grid-cols-3 gap-2 mt-3 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Entry</span>
                      <span className="font-bold text-zinc-200">{sig.entryPrice}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Stop Loss ({pipDistance} pips)</span>
                      <span className="font-bold text-red-400">{sig.stopLoss}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Take Profit (1:2 R:R)</span>
                      <span className="font-bold text-emerald-400">{sig.tp1}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <div className="text-[11px] text-zinc-400">
                    Calculated: <strong className="text-purple-300 font-mono">{lotSize} lots</strong> (${dollarRisk} max loss)
                  </div>

                  <button
                    onClick={() => handleExecuteSignal(sig)}
                    disabled={executingSignalId === sig.id || isHardLocked}
                    className={`px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg transition-all ${
                      isHardLocked
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/30'
                    }`}
                  >
                    {executingSignalId === sig.id ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Executing MT5...
                      </>
                    ) : (
                      <>
                        <ArrowUpRight size={14} />
                        Execute on MT5 Prop
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
