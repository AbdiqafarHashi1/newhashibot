import { useState } from 'react';
import { 
  Zap, Server, TrendingUp, RefreshCw, Plus, ArrowUpRight, 
  Activity, Flame, AlertOctagon,
  Sparkles
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

export function MT5PersonalAlphaHub({
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
  const [kellyRiskPct, setKellyRiskPct] = useState<number>(2.00); // Aggressive default 2.0%
  const [enableRunnerScaling, setEnableRunnerScaling] = useState(true);

  const account = selectedAccount;

  const balance = account?.balance || 10000;
  const equity = account?.equity || 10000;
  const initialBalance = account?.initialBalance || 10000;
  const totalGainsDollar = equity - initialBalance;
  const totalGainsPct = (totalGainsDollar / initialBalance) * 100;
  const todayRealized = account?.todayRealizedPnl || 0;

  const handleExecuteSignal = async (signal: QuantitativeSignal) => {
    if (!account) return;
    setExecutingSignalId(signal.id);
    setActionFeedback(null);

    const { lotSize, dollarRisk, pipDistance } = calculatePreciseLotSize({
      accountBalance: account.balance,
      riskPct: kellyRiskPct,
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
      tp2: enableRunnerScaling ? signal.tp2 : undefined,
      riskPct: kellyRiskPct,
      strategyName: signal.strategyName,
      comment: `HashiBot Personal Aggressive Alpha`,
      mode: 'personal'
    });

    setExecutingSignalId(null);
    if (result.success) {
      setActionFeedback({
        text: `✓ ${result.message} (Aggressive Risk: $${dollarRisk} / ${kellyRiskPct}%, ${pipDistance} pips SL)`,
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
    const res = await closeLiveMT5Position(account.id, ticket, 'manual_personal_close');
    setClosingTicket(null);
    if (res.success) {
      setActionFeedback({ text: res.message, type: 'success' });
      onRefresh();
    } else {
      setActionFeedback({ text: res.message, type: 'error' });
    }
  };

  const handleEmergencyPanic = async () => {
    if (!account || !window.confirm('Are you sure you want to CLOSE ALL open positions on this Personal Live account immediately?')) return;
    setIsPanicking(true);
    const res = await emergencyPanicCloseAll(account.id);
    setIsPanicking(false);
    if (res.success) {
      setActionFeedback({
        text: `✓ Successfully liquidated ${res.closedCount} positions. Realized Net PnL: ${res.totalPnl >= 0 ? '+' : ''}$${res.totalPnl} USD.`,
        type: 'success'
      });
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Personal Account Switcher Bar */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-teal-950/30 p-5 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <Zap size={12} />
                Personal Live Compounding Engine
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Raw Spread Direct MT5
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Personal MT5 High-Alpha Portal
            </h1>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Unrestricted quantitative execution for your personal broker accounts (IC Markets, Exness, Pepperstone). Optimized for aggressive Kelly lot-sizing (1.5–3.0%), trend compounding, and multi-target runner scalps.
            </p>
          </div>

          {/* Account Selector Dropdown & Connect Button */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-800 rounded-xl p-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold pl-2">
                Active Personal Account:
              </label>
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => {
                  const target = accounts.find(a => a.id === e.target.value);
                  if (target) onSelectAccount(target);
                }}
                className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
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
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 transition-all"
            >
              <Plus size={14} />
              Connect Live Account
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

      {/* Primary KPI & Compounding Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Compounded Return */}
        <div className="p-4 rounded-2xl border bg-zinc-900/80 border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <TrendingUp size={14} className="text-emerald-400" />
              Total Growth
            </span>
            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
              totalGainsDollar >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {totalGainsPct >= 0 ? '+' : ''}{totalGainsPct.toFixed(1)}%
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {totalGainsDollar >= 0 ? '+' : ''}${totalGainsDollar.toFixed(2)}
            <span className="text-xs font-normal text-zinc-400 ml-1.5">USD</span>
          </div>
          <p className="text-[10px] text-zinc-400 mt-3">
            Initial Capital: ${initialBalance.toLocaleString()} USD
          </p>
        </div>

        {/* Live Balance & Equity */}
        <div className="p-4 rounded-2xl border bg-zinc-900/80 border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Server size={14} className="text-teal-400" />
              Live MT5 Equity
            </span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
              1:{account?.leverage || 500} Leverage
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            ${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-zinc-400 mt-2 flex justify-between">
            <span>Free Margin:</span>
            <span className="font-mono text-zinc-200 font-semibold">${(account?.freeMargin || equity).toLocaleString()}</span>
          </div>
        </div>

        {/* Today Realized PnL */}
        <div className="p-4 rounded-2xl border bg-zinc-900/80 border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
              <Activity size={14} className="text-blue-400" />
              Today Realized PnL
            </span>
            <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
              Session
            </span>
          </div>
          <div className={`text-2xl font-black font-mono ${todayRealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {todayRealized >= 0 ? '+' : ''}${todayRealized.toFixed(2)}
          </div>
          <p className="text-[10px] text-zinc-400 mt-3">
            Floating Open: <strong className="text-white font-mono">${(account?.floatingPnl || 0).toFixed(2)}</strong>
          </p>
        </div>

        {/* Dynamic Kelly Sizing Engine */}
        <div className="p-4 rounded-2xl border bg-zinc-900/80 border-zinc-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1">
                <Sparkles size={14} className="text-amber-400" />
                Aggressive Kelly Scaling
              </span>
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                High Alpha
              </span>
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono">
              {kellyRiskPct}% <span className="text-xs font-normal text-zinc-400">/ trade</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              Max Risk: ${(balance * (kellyRiskPct / 100)).toFixed(0)} USD
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">Trailing Runners:</span>
            <span className="text-emerald-400 font-semibold">{enableRunnerScaling ? 'Enabled (TP1+TP2)' : 'Single TP'}</span>
          </div>
        </div>
      </div>

      {/* Aggressive Execution Controls Bar */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Flame size={16} className="text-emerald-400" />
            <h3 className="font-bold text-sm text-zinc-100">
              Personal High-Alpha Strategy Engine Settings
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 font-semibold">Kelly Risk Multiplier:</span>
              <select
                value={kellyRiskPct}
                onChange={(e) => setKellyRiskPct(Number(e.target.value))}
                className="bg-transparent text-emerald-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value={1.00}>1.00% (Standard Live)</option>
                <option value={1.50}>1.50% (Dynamic Alpha)</option>
                <option value={2.00}>2.00% (Aggressive Compounding)</option>
                <option value={3.00}>3.00% (Max Kelly Alpha)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
              <input
                type="checkbox"
                checked={enableRunnerScaling}
                onChange={(e) => setEnableRunnerScaling(e.target.checked)}
                className="rounded bg-zinc-900 border-zinc-700 text-emerald-600 focus:ring-0"
              />
              <span>Multi-Target TP2 Runners</span>
            </label>
            
            {account && account.openPositions.length > 0 && (
              <button
                onClick={handleEmergencyPanic}
                disabled={isPanicking}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/40 transition-all flex items-center gap-1.5"
              >
                <AlertOctagon size={13} />
                Liquidate All ({account.openPositions.length})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <span className="text-[11px] text-zinc-400 font-semibold block mb-1">Breakeven Protection</span>
            <p className="font-mono text-zinc-200">Auto Move SL at 1:1 R:R</p>
            <p className="text-[10px] text-zinc-500 mt-1">Locks in zero risk once position gains 1R</p>
          </div>

          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <span className="text-[11px] text-zinc-400 font-semibold block mb-1">Trailing ATR Runner</span>
            <p className="font-mono text-zinc-200">50% Volume Closes at TP1</p>
            <p className="text-[10px] text-zinc-500 mt-1">Remaining 50% trails trend to TP2 target</p>
          </div>

          <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <span className="text-[11px] text-zinc-400 font-semibold block mb-1">News Window Policy</span>
            <p className="font-mono text-emerald-400">Unrestricted Volatility Trading</p>
            <p className="text-[10px] text-zinc-500 mt-1">Personal accounts permitted to scalp spikes</p>
          </div>
        </div>
      </div>

      {/* Active Live MT5 Positions Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-lg overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-emerald-400" />
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
            No active positions open on {account?.nickname || 'selected MT5 account'}. All capital ready for deployment.
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
                  <th className="py-3 px-4">SL / TP1 / TP2</th>
                  <th className="py-3 px-4">Floating PnL</th>
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
                        SL: {pos.stopLoss} | TP: {pos.takeProfit} {pos.tp2 ? `| TP2: ${pos.tp2}` : ''}
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

      {/* High-Alpha Signals Stream */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-emerald-400" />
              <h3 className="font-bold text-sm text-zinc-100">
                High-Alpha Quantitative Signals (Forex & Gold)
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              High-volatility institutional setups for maximum compounding with dynamic multi-target take-profit runners.
            </p>
          </div>
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
            Aggressive Sizing: {kellyRiskPct}% (${((account?.balance || 10000) * (kellyRiskPct / 100)).toFixed(0)} USD)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {LIVE_CONFLUENCE_SIGNALS.map((sig) => {
            const { lotSize, dollarRisk, pipDistance } = calculatePreciseLotSize({
              accountBalance: account?.balance || 10000,
              riskPct: kellyRiskPct,
              entryPrice: sig.entryPrice,
              stopLoss: sig.stopLoss,
              symbol: sig.symbol
            });

            return (
              <div 
                key={sig.id}
                className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/60 hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-3"
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
                      <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        {sig.confluenceScore}% Alpha
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
                      <span className="text-[10px] text-zinc-500 block">TP1 / TP2</span>
                      <span className="font-bold text-emerald-400">{sig.tp1} {sig.tp2 ? `/ ${sig.tp2}` : ''}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <div className="text-[11px] text-zinc-400">
                    Sizing: <strong className="text-emerald-300 font-mono">{lotSize} lots</strong> (${dollarRisk} risk)
                  </div>

                  <button
                    onClick={() => handleExecuteSignal(sig)}
                    disabled={executingSignalId === sig.id}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30 transition-all"
                  >
                    {executingSignalId === sig.id ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Executing MT5...
                      </>
                    ) : (
                      <>
                        <ArrowUpRight size={14} />
                        Execute Live MT5
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
