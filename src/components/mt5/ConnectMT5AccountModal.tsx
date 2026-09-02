import { useState } from 'react';
import { 
  X, Server, ShieldCheck, Zap,
  CheckCircle2, Award 
} from 'lucide-react';
import { addConnectedMT5Account, LiveMT5AccountState } from '../../lib/mt5LiveEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultType: 'prop' | 'personal';
  onAccountAdded: (account: LiveMT5AccountState) => void;
}

export function ConnectMT5AccountModal({ isOpen, onClose, defaultType, onAccountAdded }: Props) {
  const [accountType, setAccountType] = useState<'prop' | 'personal'>(defaultType);
  const [broker, setBroker] = useState(defaultType === 'prop' ? 'FTMO' : 'IC Markets');
  const [server, setServer] = useState(defaultType === 'prop' ? 'FTMO-Server-2' : 'ICMarketsSC-Live08');
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [balance, setBalance] = useState(defaultType === 'prop' ? '100000' : '10000');
  const [leverage, setLeverage] = useState(defaultType === 'prop' ? '100' : '500');
  const [maxDailyLoss, setMaxDailyLoss] = useState('5.0');
  const [maxTotalLoss, setMaxTotalLoss] = useState('10.0');
  const [profitTarget, setProfitTarget] = useState('10.0');
  const [newsAllowed, setNewsAllowed] = useState(false);
  const [weekendAllowed, setWeekendAllowed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      const created = addConnectedMT5Account({
        broker,
        server,
        accountNumberFull: accountNumber || '84920194',
        nickname: nickname || `${broker} ${accountType === 'prop' ? 'Challenge' : 'Live'} ($${Number(balance).toLocaleString()})`,
        balance: Number(balance) || 10000,
        leverage: Number(leverage) || 100,
        accountType,
        propFirmName: accountType === 'prop' ? broker : undefined,
        maxDailyLossPct: Number(maxDailyLoss) || 5.0,
        maxTotalLossPct: Number(maxTotalLoss) || 10.0,
        profitTargetPct: Number(profitTarget) || 10.0,
        newsTradingAllowed: newsAllowed,
        weekendHoldingAllowed: weekendAllowed
      });

      setIsSubmitting(false);
      setSuccessMsg(`Account "${created.nickname}" connected and synced successfully!`);
      
      setTimeout(() => {
        onAccountAdded(created);
        onClose();
      }, 1000);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accountType === 'prop' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
              {accountType === 'prop' ? <Award size={18} /> : <Server size={18} />}
            </div>
            <div>
              <h2 className="font-bold text-base text-zinc-100">
                Connect Live MT5 Account
              </h2>
              <p className="text-xs text-zinc-400">
                Direct zero-latency execution bridge for MetaTrader 5
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Account Type Selector */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-2">
              Account Strategy Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setAccountType('prop');
                  setBroker('FTMO');
                  setServer('FTMO-Server-2');
                  setBalance('100000');
                  setLeverage('100');
                }}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  accountType === 'prop'
                    ? 'border-purple-500/60 bg-purple-500/10 text-purple-300 ring-1 ring-purple-500/40'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:bg-zinc-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Award size={15} />
                  <span className="font-bold text-xs text-zinc-100">Prop Firm Challenge</span>
                </div>
                <span className="text-[11px] text-zinc-400 leading-tight">
                  Strict 5% daily DD lock, news blackout, 0.5% risk
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountType('personal');
                  setBroker('IC Markets');
                  setServer('ICMarketsSC-Live08');
                  setBalance('10000');
                  setLeverage('500');
                }}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  accountType === 'personal'
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:bg-zinc-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap size={15} />
                  <span className="font-bold text-xs text-zinc-100">Personal Live Account</span>
                </div>
                <span className="text-[11px] text-zinc-400 leading-tight">
                  Aggressive Kelly sizing, 1.5–3.0% risk, compounding
                </span>
              </button>
            </div>
          </div>

          {/* Account Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Broker / Firm Name
              </label>
              <input
                type="text"
                required
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="e.g. FTMO, FundedNext, IC Markets"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                MT5 Server Name
              </label>
              <input
                type="text"
                required
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="e.g. FTMO-Server-2"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Account Number (Login)
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 21094892"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Master Password (or Investor)
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* Capital & Leverage */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Account Balance ($)
              </label>
              <input
                type="number"
                required
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="100000"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Leverage (1:X)
              </label>
              <input
                type="number"
                required
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                placeholder="100"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-semibold text-zinc-300 block mb-1">
                Custom Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. Primary FTMO"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Specific Prop Firm Rules Configuration */}
          {accountType === 'prop' && (
            <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-3">
              <div className="flex items-center gap-2 text-purple-300 text-xs font-bold">
                <ShieldCheck size={14} />
                Prop Firm Protection Parameters (Non-Negotiable)
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">Max Daily DD (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">Max Total DD (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={maxTotalLoss}
                    onChange={(e) => setMaxTotalLoss(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">Target (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={profitTarget}
                    onChange={(e) => setProfitTarget(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={newsAllowed}
                    onChange={(e) => setNewsAllowed(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700 text-purple-600 focus:ring-0"
                  />
                  <span>Allow Red Folder News Trading</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={weekendAllowed}
                    onChange={(e) => setWeekendAllowed(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700 text-purple-600 focus:ring-0"
                  />
                  <span>Allow Weekend Holding</span>
                </label>
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition-all flex items-center gap-2 ${
                accountType === 'prop'
                  ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting Bridge...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Connect & Activate Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
