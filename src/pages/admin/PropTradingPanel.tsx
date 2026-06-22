import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Target, TrendingUp, TrendingDown, Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw, Plus, CreditCard as Edit3, ChevronDown, ChevronUp, BarChart2, Zap, Clock, DollarSign, Activity, Lock, PauseCircle, PlayCircle, Info } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface PropAccount {
  id: string;
  label: string;
  firm_name: string;
  account_type: 'challenge' | 'funded' | 'evaluation';
  status: 'active' | 'passed' | 'failed' | 'paused' | 'pending';
  account_size_usd: number;
  current_balance_usd: number | null;
  peak_balance_usd: number | null;
  starting_balance_usd: number | null;
  unrealized_pnl_usd: number;
  profit_target_pct: number;
  max_daily_loss_pct: number;
  max_total_drawdown_pct: number;
  trailing_drawdown_pct: number | null;
  max_open_positions: number;
  max_leverage: number;
  governor_state: 'normal' | 'defensive' | 'paused' | 'locked';
  prop_readiness_score: number;
  prop_readiness_tier: 'green' | 'yellow' | 'red';
  trading_days_completed: number;
  min_trading_days: number;
  notes: string | null;
  created_at: string;
  challenge_passed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  is_archived: boolean;
  news_trading_allowed: boolean;
  weekend_holding_allowed: boolean;
}

interface DailySession {
  id: string;
  account_id: string;
  session_date: string;
  opening_balance_usd: number;
  daily_loss_limit_usd: number;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  total_pnl_usd: number;
  trades_taken: number;
  trades_won: number;
  trades_lost: number;
  win_rate: number;
  daily_limit_breached: boolean;
  session_locked: boolean;
}

// ── Helper utils ──────────────────────────────────────────────
function pct(value: number | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  return `${(value * 100).toFixed(1)}%`;
}

function usd(value: number | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  const sign = value >= 0 ? '' : '-';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tierColor(tier: 'green' | 'yellow' | 'red' | string): string {
  if (tier === 'green') return 'text-emerald-400';
  if (tier === 'yellow') return 'text-yellow-400';
  return 'text-red-400';
}

function tierBg(tier: 'green' | 'yellow' | 'red' | string): string {
  if (tier === 'green') return 'border-emerald-500/30 bg-emerald-500/10';
  if (tier === 'yellow') return 'border-yellow-500/30 bg-yellow-500/10';
  return 'border-red-500/30 bg-red-500/10';
}

function statusBadge(status: string): string {
  if (status === 'active') return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
  if (status === 'passed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (status === 'paused') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
  return 'border-zinc-700 bg-zinc-900 text-zinc-400';
}

function govColor(state: string): string {
  if (state === 'normal') return 'text-emerald-400';
  if (state === 'defensive') return 'text-yellow-400';
  return 'text-red-400';
}

// ── Sub-components ────────────────────────────────────────────
function StatChip({ label, value, tone = 'zinc' }: { label: string; value: string | number; tone?: 'zinc' | 'green' | 'red' | 'yellow' | 'blue' }) {
  const colors = {
    zinc: 'border-zinc-800 bg-zinc-900/60 text-zinc-100',
    green: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    red: 'border-red-500/20 bg-red-500/10 text-red-200',
    yellow: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="text-base font-bold leading-tight">{value}</div>
    </div>
  );
}

function DrawdownBar({ usedPct, label, color }: { usedPct: number; label: string; color: string }) {
  const clamped = Math.min(100, Math.max(0, usedPct * 100));
  const barColor = clamped >= 90 ? 'bg-red-500' : clamped >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className={color}>{clamped.toFixed(1)}% used</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function ReadinessGauge({ score, tier }: { score: number; tier: 'green' | 'yellow' | 'red' }) {
  const color = tier === 'green' ? '#10b981' : tier === 'yellow' ? '#f59e0b' : '#ef4444';
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="#27272a" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="48" y="48" textAnchor="middle" dominantBaseline="central" fill={color} fontSize="18" fontWeight="bold">{score}</text>
      </svg>
      <span className={`text-xs font-bold uppercase tracking-wider ${tierColor(tier)}`}>{tier.toUpperCase()}</span>
    </div>
  );
}

// ── Account Form (create / edit) ──────────────────────────────
const DEFAULT_FORM: Partial<PropAccount> = {
  label: '',
  firm_name: 'bybit_prop',
  account_type: 'challenge',
  status: 'active',
  account_size_usd: 10000,
  profit_target_pct: 0.1,
  max_daily_loss_pct: 0.05,
  max_total_drawdown_pct: 0.10,
  trailing_drawdown_pct: null,
  max_open_positions: 5,
  max_leverage: 10,
  news_trading_allowed: true,
  weekend_holding_allowed: true,
  governor_state: 'normal',
  notes: '',
};

function AccountForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Partial<PropAccount>;
  onSave: (data: Partial<PropAccount>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<PropAccount>>({ ...DEFAULT_FORM, ...initial });
  const set = (k: keyof PropAccount, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Account Label *</label>
          <input className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.label ?? ''} onChange={e => set('label', e.target.value)} placeholder="e.g. FTMO $10K Challenge" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Firm</label>
          <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.firm_name ?? 'bybit_prop'} onChange={e => set('firm_name', e.target.value)}>
            <option value="bybit_prop">Bybit Prop</option>
            <option value="ftmo">FTMO</option>
            <option value="myfundedfx">MyFundedFX</option>
            <option value="topstep">TopStep</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Account Type</label>
          <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.account_type ?? 'challenge'} onChange={e => set('account_type', e.target.value as PropAccount['account_type'])}>
            <option value="challenge">Challenge</option>
            <option value="evaluation">Evaluation</option>
            <option value="funded">Funded</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Account Size (USD)</label>
          <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.account_size_usd ?? 10000} onChange={e => set('account_size_usd', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Profit Target %</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={(form.profit_target_pct ?? 0.1) * 100} onChange={e => set('profit_target_pct', Number(e.target.value) / 100)} placeholder="10" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Daily Loss %</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={(form.max_daily_loss_pct ?? 0.05) * 100} onChange={e => set('max_daily_loss_pct', Number(e.target.value) / 100)} placeholder="5" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Total Drawdown %</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={(form.max_total_drawdown_pct ?? 0.1) * 100} onChange={e => set('max_total_drawdown_pct', Number(e.target.value) / 100)} placeholder="10" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Trailing DD % (blank = fixed)</label>
          <input type="number" step="0.01" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.trailing_drawdown_pct != null ? form.trailing_drawdown_pct * 100 : ''}
            onChange={e => set('trailing_drawdown_pct', e.target.value === '' ? null : Number(e.target.value) / 100)}
            placeholder="Leave blank for fixed DD" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Open Positions</label>
          <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.max_open_positions ?? 5} onChange={e => set('max_open_positions', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Max Leverage</label>
          <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            value={form.max_leverage ?? 10} onChange={e => set('max_leverage', Number(e.target.value))} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded accent-blue-500"
            checked={form.news_trading_allowed ?? true} onChange={e => set('news_trading_allowed', e.target.checked)} />
          News trading allowed
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded accent-blue-500"
            checked={form.weekend_holding_allowed ?? true} onChange={e => set('weekend_holding_allowed', e.target.checked)} />
          Weekend holding allowed
        </label>
      </div>
      <div>
        <label className="text-xs text-zinc-500 block mb-1">Notes</label>
        <textarea rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 resize-none"
          value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
          Cancel
        </button>
        <button onClick={() => onSave(form)} disabled={saving || !form.label?.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors">
          {saving ? 'Saving...' : 'Save Account'}
        </button>
      </div>
    </div>
  );
}

// ── Account Card ──────────────────────────────────────────────
function AccountCard({
  account,
  session,
  expanded,
  onToggle,
  onEdit,
  onGovernorChange,
}: {
  account: PropAccount;
  session: DailySession | null;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onGovernorChange: (id: string, state: PropAccount['governor_state']) => void;
}) {
  const balance = account.current_balance_usd ?? account.account_size_usd;
  const peak = account.peak_balance_usd ?? balance;
  const starting = account.starting_balance_usd ?? account.account_size_usd;
  const equity = balance + (account.unrealized_pnl_usd ?? 0);

  const totalDdPct = (peak - equity) / account.account_size_usd;
  const ddUsedRatio = totalDdPct / account.max_total_drawdown_pct;

  const gained = (balance - starting) / account.account_size_usd;
  const targetProgress = gained / account.profit_target_pct;

  const dailyLossLimit = (session?.opening_balance_usd ?? balance) * account.max_daily_loss_pct;
  const dailyLossUsed = session ? -(session.realized_pnl_usd) : 0;
  const dailyLossRatio = dailyLossLimit > 0 ? dailyLossUsed / dailyLossLimit : 0;

  const score = account.prop_readiness_score ?? 100;
  const tier = account.prop_readiness_tier ?? 'green';

  return (
    <div className={`rounded-2xl border bg-zinc-900/70 shadow-lg shadow-black/10 overflow-hidden ${tierBg(tier)}`}>
      {/* Header */}
      <button onClick={onToggle} className="w-full text-left p-4 flex items-start gap-3 hover:bg-white/5 transition-colors">
        <div className="shrink-0 mt-0.5">
          <ReadinessGauge score={score} tier={tier} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-zinc-100 truncate">{account.label}</h3>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadge(account.status)}`}>
              {account.status}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400`}>
              {account.account_type}
            </span>
          </div>
          <div className="text-xs text-zinc-500 mb-2">{account.firm_name} · {usd(account.account_size_usd)} account</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-[10px] text-zinc-600">Balance</div>
              <div className="text-sm font-semibold text-zinc-200">{usd(balance)}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">P&L Progress</div>
              <div className={`text-sm font-semibold ${gained >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {pct(gained)} {targetProgress >= 1 ? '✓' : `/ ${pct(account.profit_target_pct)} target`}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">Total DD</div>
              <div className={`text-sm font-semibold ${ddUsedRatio >= 0.8 ? 'text-red-400' : ddUsedRatio >= 0.5 ? 'text-yellow-400' : 'text-zinc-300'}`}>
                {pct(totalDdPct)} / {pct(account.max_total_drawdown_pct)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600">Governor</div>
              <div className={`text-sm font-semibold capitalize ${govColor(account.governor_state)}`}>
                {account.governor_state}
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-zinc-600">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800/60 pt-4 space-y-4">
          {/* Drawdown bars */}
          <div className="space-y-2">
            <DrawdownBar usedPct={ddUsedRatio} label="Total drawdown" color={ddUsedRatio >= 0.8 ? 'text-red-400' : 'text-zinc-400'} />
            <DrawdownBar usedPct={dailyLossRatio} label={`Daily loss (limit: ${usd(dailyLossLimit)})`} color={dailyLossRatio >= 0.8 ? 'text-red-400' : 'text-zinc-400'} />
            <DrawdownBar usedPct={Math.max(0, targetProgress)} label={`Challenge progress (target: ${pct(account.profit_target_pct)})`} color="text-emerald-400" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatChip label="Unrealized PnL" value={usd(account.unrealized_pnl_usd)}
              tone={account.unrealized_pnl_usd > 0 ? 'green' : account.unrealized_pnl_usd < 0 ? 'red' : 'zinc'} />
            <StatChip label="Today Realized" value={usd(session?.realized_pnl_usd ?? null)}
              tone={(session?.realized_pnl_usd ?? 0) >= 0 ? 'green' : 'red'} />
            <StatChip label="Today Trades" value={session?.trades_taken ?? '—'} />
            <StatChip label="Today Win Rate" value={session ? pct(session.win_rate) : '—'}
              tone={(session?.win_rate ?? 0) >= 0.6 ? 'green' : (session?.win_rate ?? 0) >= 0.4 ? 'yellow' : 'red'} />
          </div>

          {/* Rules */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Max positions</div>
              <div className="text-zinc-200 font-medium">{account.max_open_positions}</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Max leverage</div>
              <div className="text-zinc-200 font-medium">{account.max_leverage}x</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Trailing DD</div>
              <div className="text-zinc-200 font-medium">
                {account.trailing_drawdown_pct != null ? pct(account.trailing_drawdown_pct) : 'Fixed'}
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Trading days</div>
              <div className="text-zinc-200 font-medium">{account.trading_days_completed} / {account.min_trading_days} min</div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">News trading</div>
              <div className={account.news_trading_allowed ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                {account.news_trading_allowed ? 'Allowed' : 'Blocked'}
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-2">
              <div className="text-zinc-600 mb-0.5">Weekend hold</div>
              <div className={account.weekend_holding_allowed ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                {account.weekend_holding_allowed ? 'Allowed' : 'Blocked'}
              </div>
            </div>
          </div>

          {/* Governor controls */}
          <div>
            <div className="text-xs text-zinc-500 mb-2">Governor state</div>
            <div className="flex flex-wrap gap-2">
              {(['normal', 'defensive', 'paused', 'locked'] as const).map(state => (
                <button key={state}
                  onClick={() => onGovernorChange(account.id, state)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                    account.governor_state === state
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                  }`}>
                  {state === 'normal' && <PlayCircle size={10} className="inline mr-1" />}
                  {state === 'defensive' && <Shield size={10} className="inline mr-1" />}
                  {state === 'paused' && <PauseCircle size={10} className="inline mr-1" />}
                  {state === 'locked' && <Lock size={10} className="inline mr-1" />}
                  {state}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700">
              <Edit3 size={11} /> Edit Rules
            </button>
          </div>

          {account.failure_reason && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
              <XCircle size={11} className="inline mr-1" />
              Failure reason: {account.failure_reason}
            </div>
          )}
          {account.notes && (
            <div className="bg-zinc-800/40 rounded-lg px-3 py-2 text-xs text-zinc-500 italic">
              <Info size={11} className="inline mr-1" />{account.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function PropTradingPanel() {
  const [accounts, setAccounts] = useState<PropAccount[]>([]);
  const [sessions, setSessions] = useState<Record<string, DailySession>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PropAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = supabase
      .from('bybit_prop_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!showArchived) query.eq('is_archived', false);
    const { data, error: err } = await query;
    if (err) { setError(err.message); setLoading(false); return; }
    setAccounts(data as PropAccount[]);

    if (data && data.length > 0) {
      const ids = data.map((a: PropAccount) => a.id);
      const today = new Date().toISOString().slice(0, 10);
      const { data: sess } = await supabase
        .from('prop_daily_sessions')
        .select('*')
        .in('account_id', ids)
        .eq('session_date', today);
      const sessionMap: Record<string, DailySession> = {};
      (sess ?? []).forEach((s: DailySession) => { sessionMap[s.account_id] = s; });
      setSessions(sessionMap);
    }
    setLoading(false);
  }, [showArchived]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const activeAccounts = accounts.filter(a => !a.is_archived || showArchived);
  const totalBalance = activeAccounts.reduce((s, a) => s + (a.current_balance_usd ?? a.account_size_usd), 0);
  const totalUnrealized = activeAccounts.reduce((s, a) => s + (a.unrealized_pnl_usd ?? 0), 0);
  const greenCount = activeAccounts.filter(a => a.prop_readiness_tier === 'green').length;
  const redCount = activeAccounts.filter(a => a.prop_readiness_tier === 'red').length;

  async function handleSave(form: Partial<PropAccount>) {
    setSaving(true);
    setFormError(null);
    const payload = {
      label: form.label?.trim(),
      firm_name: form.firm_name,
      account_type: form.account_type,
      status: form.status ?? 'active',
      account_size_usd: form.account_size_usd,
      profit_target_pct: form.profit_target_pct,
      max_daily_loss_pct: form.max_daily_loss_pct,
      max_total_drawdown_pct: form.max_total_drawdown_pct,
      trailing_drawdown_pct: form.trailing_drawdown_pct,
      max_open_positions: form.max_open_positions,
      max_leverage: form.max_leverage,
      news_trading_allowed: form.news_trading_allowed,
      weekend_holding_allowed: form.weekend_holding_allowed,
      notes: form.notes || null,
      governor_state: form.governor_state ?? 'normal',
      starting_balance_usd: editingAccount ? undefined : form.account_size_usd,
      current_balance_usd: editingAccount ? undefined : form.account_size_usd,
      peak_balance_usd: editingAccount ? undefined : form.account_size_usd,
    };

    let err: { message: string } | null = null;
    if (editingAccount) {
      const res = await supabase.from('bybit_prop_accounts').update(payload).eq('id', editingAccount.id);
      err = res.error;
    } else {
      const res = await supabase.from('bybit_prop_accounts').insert(payload);
      err = res.error;
    }

    if (err) { setFormError(err.message); setSaving(false); return; }
    setShowForm(false);
    setEditingAccount(null);
    await fetchAccounts();
    setSaving(false);
  }

  async function handleGovernorChange(id: string, state: PropAccount['governor_state']) {
    await supabase.from('bybit_prop_accounts').update({ governor_state: state }).eq('id', id);
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, governor_state: state } : a));
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <Target size={20} className="text-blue-400" />
              Prop Trading Framework
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Bybit prop accounts · challenge pass · capital preservation</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowArchived(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${showArchived ? 'bg-zinc-700 border-zinc-600 text-zinc-200' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-200'}`}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
            <button onClick={fetchAccounts} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => { setEditingAccount(null); setShowForm(true); setFormError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">
              <Plus size={11} /> Add Account
            </button>
          </div>
        </div>

        {/* Summary stats */}
        {activeAccounts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatChip label="Accounts" value={activeAccounts.length} />
            <StatChip label="Total Balance" value={usd(totalBalance)} tone="blue" />
            <StatChip label="Unrealized PnL" value={usd(totalUnrealized)}
              tone={totalUnrealized > 0 ? 'green' : totalUnrealized < 0 ? 'red' : 'zinc'} />
            <StatChip label="Readiness" value={`${greenCount}G · ${redCount}R`}
              tone={redCount > 0 ? 'red' : greenCount === activeAccounts.length ? 'green' : 'yellow'} />
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl">
            <h2 className="text-sm font-bold text-zinc-100 mb-4 flex items-center gap-2">
              <Edit3 size={14} className="text-blue-400" />
              {editingAccount ? `Edit: ${editingAccount.label}` : 'New Prop Account'}
            </h2>
            {formError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-xs px-3 py-2 rounded-lg mb-4">{formError}</div>
            )}
            <AccountForm
              initial={editingAccount ?? {}}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingAccount(null); }}
              saving={saving}
            />
          </div>
        )}

        {/* Errors */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Accounts list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeAccounts.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Target size={32} className="text-zinc-700 mx-auto" />
            <p className="text-zinc-500 text-sm">No prop accounts yet.</p>
            <p className="text-zinc-600 text-xs">Add your first Bybit prop account to get started.</p>
            <button onClick={() => { setEditingAccount(null); setShowForm(true); }}
              className="mt-2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={14} /> Add Account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAccounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                session={sessions[account.id] ?? null}
                expanded={expandedId === account.id}
                onToggle={() => setExpandedId(v => v === account.id ? null : account.id)}
                onEdit={() => { setEditingAccount(account); setShowForm(true); setFormError(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                onGovernorChange={handleGovernorChange}
              />
            ))}
          </div>
        )}

        {/* Info panel */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
            <Zap size={11} className="text-blue-400" /> Strategy & Signal Competition
          </h3>
          <div className="text-xs text-zinc-600 space-y-1.5">
            <p>Signals are ranked by the Arbitrator (<code className="text-zinc-400">calculateOpportunityRankScore</code>) — only the highest-scoring A1/A2 signals are approved for prop accounts.</p>
            <p>When a symbol is already in a strong trend and the score is A-tier, <strong className="text-zinc-400">Scalp 1% mode</strong> is recommended: TP1 = 1%, SL = 0.5% (2:1 R/R). This maximises win-rate for funded account longevity.</p>
            <p>Governor switches to <strong className="text-zinc-400">Defensive</strong> automatically when drawdown exceeds 50% of max, or daily loss exceeds 60% of limit. All trades switch to scalp mode.</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
