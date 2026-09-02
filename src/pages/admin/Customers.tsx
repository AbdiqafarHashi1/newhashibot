import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { CustomerSubscription, Package, PaymentStatus, AccessStatus, TelegramStatus, CustomerBotSetup as CustomerBotSetupType } from '../../lib/types';
import type { MT5Account } from '../../lib/exchange/mt5';
import { ExecutionAccount } from '../../lib/executionAccounts';
import { 
  Users, Plus, Search, RefreshCw, ChevronDown, ChevronUp, 
  X, MessageCircle, CalendarPlus, Cpu, SlidersHorizontal, Shield, 
  Server, CheckCircle2 
} from 'lucide-react';

// ─── Status badge helpers ─────────────────────────────────────────────────────

function paymentBadge(s: PaymentStatus) {
  const map: Record<PaymentStatus, string> = {
    paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    failed: 'bg-red-500/15 text-red-400 border-red-500/25',
    expired: 'bg-zinc-500/15 text-zinc-500 border-zinc-600/25',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/25',
  };
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded border font-medium capitalize ${map[s] ?? ''}`}>{s}</span>;
}

function accessBadge(s: AccessStatus) {
  const map: Record<AccessStatus, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    inactive: 'bg-zinc-500/15 text-zinc-500 border-zinc-600/25',
    expired: 'bg-red-500/15 text-red-400 border-red-500/25',
  };
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded border font-medium capitalize ${map[s] ?? ''}`}>{s}</span>;
}

function telegramBadge(s: TelegramStatus) {
  const map: Record<TelegramStatus, string> = {
    not_invited: 'bg-zinc-500/15 text-zinc-500 border-zinc-600/25',
    invited: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    joined: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    removed: 'bg-red-500/15 text-red-400 border-red-500/25',
  };
  const labels: Record<TelegramStatus, string> = { not_invited: 'Not Invited', invited: 'Invited', joined: 'Joined', removed: 'Removed' };
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded border font-medium ${map[s] ?? ''}`}>{labels[s]}</span>;
}

// ─── Enriched Customer Model ──────────────────────────────────────────────────

interface EnrichedCustomer {
  sub: CustomerSubscription;
  botSetup: CustomerBotSetupType | null;
  mt5Account: MT5Account | null;
  cryptoAccount: ExecutionAccount | null;
}

export default function Customers() {
  const [subs, setSubs] = useState<CustomerSubscription[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [botSetups, setBotSetups] = useState<CustomerBotSetupType[]>([]);
  const [mt5Accounts, setMt5Accounts] = useState<MT5Account[]>([]);
  const [cryptoAccounts, setCryptoAccounts] = useState<ExecutionAccount[]>([]);
  const [profiles, setProfiles] = useState<Array<{ id: string; email: string; full_name?: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAccess, setFilterAccess] = useState<AccessStatus | 'all'>('all');
  const [filterPayment, setFilterPayment] = useState<PaymentStatus | 'all'>('all');
  const [filterBotState, setFilterBotState] = useState<'all' | 'running' | 'paused' | 'not_configured'>('all');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedRulesCustomer, setSelectedRulesCustomer] = useState<EnrichedCustomer | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Load all records in parallel
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, pkgRes, botRes, mt5Res, cryptoRes, profRes] = await Promise.all([
        supabase.from('customer_subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('packages').select('*').order('sort_order'),
        supabase.from('customer_bot_setups').select('*'),
        supabase.from('mt5_accounts').select('*'),
        supabase.from('connected_execution_accounts').select('*'),
        supabase.from('profiles').select('id, email, full_name'),
      ]);

      setSubs((subRes.data ?? []) as CustomerSubscription[]);
      setPackages((pkgRes.data ?? []) as Package[]);
      setBotSetups((botRes.data ?? []) as CustomerBotSetupType[]);
      setMt5Accounts((mt5Res.data ?? []) as MT5Account[]);
      setCryptoAccounts((cryptoRes.data ?? []) as ExecutionAccount[]);
      setProfiles((profRes.data ?? []) as Array<{ id: string; email: string; full_name?: string }>);
    } catch (err) {
      console.error('Failed to load customer data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Map email & user_id to connected entities
  const enrichedCustomers = useMemo<EnrichedCustomer[]>(() => {
    const profileMap = new Map<string, string>(); // email -> user_id
    profiles.forEach(p => {
      if (p.email) profileMap.set(p.email.toLowerCase(), p.id);
    });

    return subs.map(sub => {
      const resolvedUserId = sub.user_id || profileMap.get(sub.email.toLowerCase()) || null;

      // Match bot setup
      const bot = botSetups.find(b => 
        (resolvedUserId && b.user_id === resolvedUserId) ||
        (b.subscription_id && b.subscription_id === sub.id)
      ) || null;

      // Match MT5 account
      const mt5 = mt5Accounts.find(m => 
        (resolvedUserId && m.user_id === resolvedUserId)
      ) || null;

      // Match crypto account
      const crypto = cryptoAccounts.find(c => 
        (resolvedUserId && c.customer_id === resolvedUserId) ||
        (c.customer_id === sub.id)
      ) || null;

      return {
        sub,
        botSetup: bot,
        mt5Account: mt5,
        cryptoAccount: crypto,
      };
    });
  }, [subs, botSetups, mt5Accounts, cryptoAccounts, profiles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enrichedCustomers.filter(({ sub, botSetup, mt5Account }) => {
      const matchesSearch =
        !q ||
        sub.email.toLowerCase().includes(q) ||
        (sub.full_name ?? '').toLowerCase().includes(q) ||
        (sub.package_name ?? '').toLowerCase().includes(q) ||
        (mt5Account?.account_number ?? '').toLowerCase().includes(q);

      const matchesAccess = filterAccess === 'all' || sub.access_status === filterAccess;
      const matchesPayment = filterPayment === 'all' || sub.payment_status === filterPayment;

      const botState = botSetup?.setup_status || 'not_configured';
      const matchesBot =
        filterBotState === 'all' ||
        (filterBotState === 'running' && botState === 'running') ||
        (filterBotState === 'paused' && botState === 'paused') ||
        (filterBotState === 'not_configured' && (botState === 'not_configured' || !botSetup));

      return matchesSearch && matchesAccess && matchesPayment && matchesBot;
    });
  }, [enrichedCustomers, search, filterAccess, filterPayment, filterBotState]);

  // Quick action: Toggle bot running/paused state
  const toggleCustomerBot = async (customer: EnrichedCustomer) => {
    const isCurrentlyRunning = customer.botSetup?.setup_status === 'running';
    const nextStatus = isCurrentlyRunning ? 'paused' : 'running';
    const nextExecutionEnabled = !isCurrentlyRunning;

    try {
      // 1. Update customer_bot_setups if exists
      if (customer.botSetup?.id) {
        await supabase
          .from('customer_bot_setups')
          .update({ setup_status: nextStatus, updated_at: new Date().toISOString() })
          .eq('id', customer.botSetup.id);
      }

      // 2. Update MT5 account execution if exists
      if (customer.mt5Account?.id) {
        await supabase
          .from('mt5_accounts')
          .update({ execution_enabled: nextExecutionEnabled, updated_at: new Date().toISOString() })
          .eq('id', customer.mt5Account.id);
      }

      // 3. Update crypto account execution if exists
      if (customer.cryptoAccount?.id) {
        await supabase
          .from('connected_execution_accounts')
          .update({ execution_enabled: nextExecutionEnabled })
          .eq('id', customer.cryptoAccount.id);
      }

      setNotice(`Updated ${customer.sub.email}: Execution bot is now ${nextStatus.toUpperCase()}`);
      setTimeout(() => setNotice(null), 4000);
      await load();
    } catch (err) {
      console.error('Failed to toggle bot:', err);
    }
  };

  const extendBy30Days = async (s: CustomerSubscription) => {
    const base = s.expires_at && new Date(s.expires_at).getTime() > Date.now() ? new Date(s.expires_at) : new Date();
    base.setDate(base.getDate() + 30);
    const { error } = await supabase.from('customer_subscriptions').update({
      expires_at: base.toISOString(),
      access_status: 'active',
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    }).eq('id', s.id);

    if (!error) {
      setNotice(`Extended 30 days access for ${s.email}`);
      setTimeout(() => setNotice(null), 4000);
      await load();
    }
  };

  const handleSaveSub = async (id: string, patch: Partial<CustomerSubscription>) => {
    const { error } = await supabase.from('customer_subscriptions').update(patch).eq('id', id);
    if (!error) await load();
  };

  const stats = useMemo(() => {
    const total = subs.length;
    const active = subs.filter(s => s.access_status === 'active').length;
    const paid = subs.filter(s => s.payment_status === 'paid').length;
    const runningBots = enrichedCustomers.filter(c => c.botSetup?.setup_status === 'running').length;
    const connectedProviders = enrichedCustomers.filter(c => c.mt5Account || c.cryptoAccount).length;
    return { total, active, paid, runningBots, connectedProviders };
  }, [subs, enrichedCustomers]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="text-xs uppercase tracking-widest text-blue-400 font-mono">
              VIP Customer Operations & Rules
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Users size={24} className="text-zinc-400" />
              Customer Management & Execution Control
            </h1>
            <p className="mt-1 text-sm text-zinc-400 max-w-3xl">
              Centralized customer administration: subscriptions, connected MT5 and crypto execution providers, 
              per-customer risk rules, and automated bot engine switches.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              to="/admin/customer-fleet"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
            >
              <Cpu size={14} className="text-blue-400" />
              Bot Fleet Matrix
            </Link>
            <Link
              to="/admin/execution"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-colors"
            >
              <Server size={14} className="text-blue-400" />
              Execution Adapters
            </Link>
          </div>
        </div>

        {/* Notice */}
        {notice && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="text-xs text-zinc-500 font-mono uppercase mb-1">Total Customers</div>
            <div className="text-2xl font-bold text-zinc-100 font-mono">{stats.total}</div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="text-xs text-zinc-500 font-mono uppercase mb-1">Active Subscriptions</div>
            <div className="text-2xl font-bold text-emerald-400 font-mono">{stats.active}</div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="text-xs text-zinc-500 font-mono uppercase mb-1">Paid Accounts</div>
            <div className="text-2xl font-bold text-sky-400 font-mono">{stats.paid}</div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="text-xs text-zinc-500 font-mono uppercase mb-1">Connected Providers</div>
            <div className="text-2xl font-bold text-purple-400 font-mono">{stats.connectedProviders}</div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="text-xs text-zinc-500 font-mono uppercase mb-1">Active Bot Engines</div>
            <div className="text-2xl font-bold text-emerald-400 font-mono">{stats.runningBots}</div>
          </div>
        </div>

        {/* Filters & Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search email, name, package, or MT5 login..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={filterAccess}
            onChange={e => setFilterAccess(e.target.value as AccessStatus | 'all')}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none"
          >
            <option value="all">All Access</option>
            <option value="active">Active Access</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={filterPayment}
            onChange={e => setFilterPayment(e.target.value as PaymentStatus | 'all')}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none"
          >
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={filterBotState}
            onChange={e => setFilterBotState(e.target.value as 'all' | 'running' | 'paused' | 'not_configured')}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none"
          >
            <option value="all">All Bot States</option>
            <option value="running">Bot Running</option>
            <option value="paused">Bot Paused</option>
            <option value="not_configured">Setup Required</option>
          </select>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
          >
            <Plus size={14} /> Add Customer
          </button>
        </div>

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-zinc-500 flex-col gap-2">
              <RefreshCw size={22} className="animate-spin text-blue-500" />
              <span className="text-xs">Loading customer directory & provider linkages...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-zinc-500 text-xs">
              {subs.length === 0 ? 'No customers registered yet.' : 'No customers match the current filter criteria.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-left uppercase tracking-wider text-[10px] font-mono bg-zinc-950/40">
                    <th className="px-4 py-3">Customer Identity</th>
                    <th className="px-4 py-3">Package & Status</th>
                    <th className="px-4 py-3">Connected Provider</th>
                    <th className="px-4 py-3">Execution Rules</th>
                    <th className="px-4 py-3 text-center">Bot Engine</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filtered.map(c => {
                    const { sub, botSetup, mt5Account, cryptoAccount } = c;
                    const isRunning = botSetup?.setup_status === 'running' || mt5Account?.execution_enabled;
                    const isExpanded = expandedId === sub.id;

                    return (
                      <Fragment key={sub.id}>
                        <tr className="hover:bg-zinc-800/30 transition-colors">
                          {/* Customer Identity */}
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-zinc-100">{sub.full_name || 'Customer'}</div>
                            <div className="text-zinc-400 font-mono text-[11px] mt-0.5">{sub.email}</div>
                            {sub.telegram_username && (
                              <div className="text-sky-400 text-[10px] flex items-center gap-1 mt-1">
                                <MessageCircle size={10} />
                                @{sub.telegram_username}
                              </div>
                            )}
                          </td>

                          {/* Package & Status */}
                          <td className="px-4 py-3.5 space-y-1">
                            <div className="font-medium text-zinc-200">{sub.package_name || 'VIP Package'}</div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {paymentBadge(sub.payment_status)}
                              {accessBadge(sub.access_status)}
                            </div>
                          </td>

                          {/* Connected Provider */}
                          <td className="px-4 py-3.5">
                            {mt5Account ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                    MT5
                                  </span>
                                  <span className="font-mono text-zinc-200 font-bold">#{mt5Account.account_number}</span>
                                </div>
                                <div className="text-[10px] text-zinc-400">
                                  {mt5Account.execution_mode === 'prop_challenge' ? 'Prop Challenge' : 'Personal Growth'} · ${(mt5Account.balance ?? 100000).toLocaleString()}
                                </div>
                              </div>
                            ) : cryptoAccount ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase">
                                    {cryptoAccount.provider}
                                  </span>
                                  <span className="font-mono text-zinc-200">{cryptoAccount.environment}</span>
                                </div>
                                <div className="text-[10px] text-zinc-400">Crypto Testnet Adapter</div>
                              </div>
                            ) : (
                              <span className="text-zinc-600 italic">No provider connected</span>
                            )}
                          </td>

                          {/* Execution Rules */}
                          <td className="px-4 py-3.5">
                            {botSetup ? (
                              <div className="space-y-0.5 font-mono text-[11px]">
                                <div className="text-zinc-200 font-semibold flex items-center gap-1">
                                  <Shield size={11} className="text-emerald-400" />
                                  {botSetup.risk_preset} ({botSetup.max_risk_per_trade_pct ?? 0.5}% / trade)
                                </div>
                                <div className="text-zinc-500 text-[10px]">
                                  Max Daily Loss: {botSetup.max_daily_loss_pct ?? 3}% · Max DD: {botSetup.drawdown_limit_pct ?? 5}%
                                </div>
                              </div>
                            ) : (
                              <span className="text-zinc-600 text-[11px]">Conservative (Default 0.5%)</span>
                            )}
                          </td>

                          {/* Bot Engine Switch */}
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => void toggleCustomerBot(c)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all shadow-sm ${
                                isRunning
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25'
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 hover:text-white'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                              {isRunning ? 'RUNNING' : 'PAUSED'}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setSelectedRulesCustomer(c)}
                                className="px-2.5 py-1 rounded-md bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                                title="Configure Rules & Providers"
                              >
                                <SlidersHorizontal size={12} />
                                Rules
                              </button>
                              <button
                                onClick={() => void extendBy30Days(sub)}
                                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-sky-300 transition-colors"
                                title="+30 Days Access"
                              >
                                <CalendarPlus size={14} />
                              </button>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                                title="Toggle details"
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="bg-zinc-950/60 border-b border-zinc-800/80">
                            <td colSpan={6} className="px-5 py-4">
                              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
                                <div>
                                  <div className="text-zinc-500 text-[10px] uppercase">Expires Date</div>
                                  <div className="text-zinc-200 mt-0.5">
                                    {sub.expires_at ? new Date(sub.expires_at).toLocaleString() : 'Permanent / Lifetime'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 text-[10px] uppercase">Payment Ref & Method</div>
                                  <div className="text-zinc-200 mt-0.5">
                                    {sub.payment_method || 'manual'} · {sub.payment_reference || 'N/A'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 text-[10px] uppercase">Telegram Status</div>
                                  <div className="text-zinc-200 mt-0.5">{telegramBadge(sub.telegram_status)}</div>
                                </div>
                                <div>
                                  <div className="text-zinc-500 text-[10px] uppercase">Allowed Symbols</div>
                                  <div className="text-zinc-200 mt-0.5">
                                    {botSetup?.preferred_symbols && Array.isArray(botSetup.preferred_symbols) && botSetup.preferred_symbols.length > 0
                                      ? botSetup.preferred_symbols.join(', ')
                                      : 'BTCUSDT, ETHUSDT, EURUSD, GBPUSD, XAUUSD'}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                                <span className="text-zinc-500">
                                  Customer ID: <code className="text-zinc-300">{sub.id}</code>
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveSub(sub.id, { access_status: 'active', payment_status: 'paid', updated_at: new Date().toISOString() })}
                                    className="px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 text-[11px]"
                                  >
                                    Activate & Confirm Payment
                                  </button>
                                  <button
                                    onClick={() => handleSaveSub(sub.id, { access_status: 'expired', payment_status: 'expired', updated_at: new Date().toISOString() })}
                                    className="px-2.5 py-1 rounded bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 text-[11px]"
                                  >
                                    Revoke Access
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Customer Rules & Provider Modal */}
        {selectedRulesCustomer && (
          <CustomerRulesDrawer
            customer={selectedRulesCustomer}
            onClose={() => setSelectedRulesCustomer(null)}
            onSaved={() => {
              setSelectedRulesCustomer(null);
              void load();
            }}
          />
        )}

        {/* New Customer Modal */}
        {showNew && (
          <NewCustomerModal
            packages={packages}
            onClose={() => setShowNew(false)}
            onSaved={() => {
              setShowNew(false);
              void load();
            }}
          />
        )}
      </div>
    </AdminLayout>
  );
}

// ─── Modal / Drawer for Editing Customer Rules & Providers ─────────────────────

function CustomerRulesDrawer({
  customer,
  onClose,
  onSaved,
}: {
  customer: EnrichedCustomer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { sub, botSetup, mt5Account } = customer;

  const [riskPreset, setRiskPreset] = useState<'Conservative' | 'Moderate' | 'Aggressive'>(
    (botSetup?.risk_preset as 'Conservative' | 'Moderate' | 'Aggressive') || 'Conservative'
  );
  const [maxRiskPerTrade, setMaxRiskPerTrade] = useState<number>(botSetup?.max_risk_per_trade_pct ?? 0.5);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(botSetup?.max_daily_loss_pct ?? 3.0);
  const [drawdownLimit, setDrawdownLimit] = useState<number>(botSetup?.drawdown_limit_pct ?? 5.0);
  const [capitalMode, setCapitalMode] = useState<'personal' | 'prop'>(
    (botSetup?.capital_mode as 'personal' | 'prop') || (mt5Account?.execution_mode === 'prop_challenge' ? 'prop' : 'personal')
  );
  const [botStatus, setBotStatus] = useState<string>(botSetup?.setup_status || (mt5Account?.execution_enabled ? 'running' : 'paused'));
  const [symbols, setSymbols] = useState<string>(
    botSetup?.preferred_symbols && Array.isArray(botSetup.preferred_symbols)
      ? botSetup.preferred_symbols.join(', ')
      : 'BTCUSDT, ETHUSDT, EURUSD, GBPUSD, XAUUSD'
  );

  // MT5 Provider Form fields
  const [mt5Login, setMt5Login] = useState<string>(mt5Account?.account_number || '');
  const [mt5Server, setMt5Server] = useState<string>(mt5Account?.broker_server || 'MetaQuotes-Demo');
  const [mt5Enabled, setMt5Enabled] = useState<boolean>(mt5Account?.execution_enabled ?? false);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);

    try {
      const parsedSymbols = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

      // 1. Persist or Upsert customer_bot_setups
      if (sub.user_id) {
        const { error: botErr } = await supabase.from('customer_bot_setups').upsert({
          user_id: sub.user_id,
          subscription_id: sub.id,
          package_slug: sub.package_name?.toLowerCase().includes('prop') ? 'forex_mt5_prop_bot' : 'forex_mt5_personal_bot',
          bot_type: capitalMode === 'prop' ? 'forex_mt5_prop' : 'forex_mt5_personal',
          capital_mode: capitalMode,
          setup_status: botStatus,
          risk_preset: riskPreset,
          max_risk_per_trade_pct: maxRiskPerTrade,
          max_daily_loss_pct: maxDailyLoss,
          drawdown_limit_pct: drawdownLimit,
          preferred_symbols: parsedSymbols,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id, package_slug' });

        if (botErr) console.warn('Could not upsert bot setup:', botErr.message);
      }

      // 2. Persist MT5 account settings
      if (mt5Account?.id) {
        const { error: mt5Err } = await supabase.from('mt5_accounts').update({
          account_number: mt5Login,
          broker_server: mt5Server,
          execution_enabled: mt5Enabled,
          execution_mode: capitalMode === 'prop' ? 'prop_challenge' : 'personal',
          policy: {
            risk_preset: riskPreset,
            max_risk_per_trade: maxRiskPerTrade,
            daily_drawdown_limit: maxDailyLoss,
            max_drawdown_limit: drawdownLimit,
            allowed_symbols: parsedSymbols,
            mode: capitalMode === 'prop' ? 'prop_challenge' : 'personal',
          },
          updated_at: new Date().toISOString(),
        }).eq('id', mt5Account.id);

        if (mt5Err) console.warn('Could not update MT5 account:', mt5Err.message);
      } else if (mt5Login && sub.user_id) {
        // Create new MT5 account for this customer
        await supabase.from('mt5_accounts').insert({
          user_id: sub.user_id,
          account_number: mt5Login,
          broker_server: mt5Server,
          account_label: `MT5 ${sub.full_name || sub.email}`,
          execution_enabled: mt5Enabled,
          execution_mode: capitalMode === 'prop' ? 'prop_challenge' : 'personal',
          balance: 100000,
          equity: 100000,
          leverage: 100,
          policy: {
            risk_preset: riskPreset,
            max_risk_per_trade: maxRiskPerTrade,
            daily_drawdown_limit: maxDailyLoss,
            max_drawdown_limit: drawdownLimit,
            allowed_symbols: parsedSymbols,
            mode: capitalMode === 'prop' ? 'prop_challenge' : 'personal',
          },
        });
      }

      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error updating customer settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
      <form
        onSubmit={handleSaveAll}
        className="w-full max-w-2xl space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-blue-400 font-mono">
              Per-Customer Configuration
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">
              Rules & Provider Hub: {sub.full_name || sub.email}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Set exact execution boundaries, risk parameters, and connect MetaTrader 5 or Crypto feeds.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {err && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {err}
          </div>
        )}

        {/* Section 1: Execution Engine & Mode */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
            <Cpu size={14} className="text-blue-400" />
            1. Execution Engine & Capital Mode
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Capital Profile</label>
              <select
                value={capitalMode}
                onChange={e => setCapitalMode(e.target.value as 'personal' | 'prop')}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="prop">Prop Challenge (Strict Drawdown Guard)</option>
                <option value="personal">Personal Growth (Compounding)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Engine Operational State</label>
              <select
                value={botStatus}
                onChange={e => setBotStatus(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="running">RUNNING (Active Execution)</option>
                <option value="paused">PAUSED (Suspended)</option>
                <option value="configured">CONFIGURED (Waiting for Verification)</option>
                <option value="disabled">DISABLED (Permanently Off)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Per-Customer Risk Rules */}
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
            <Shield size={14} className="text-emerald-400" />
            2. Per-Customer Risk Policy
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Risk Preset</label>
              <select
                value={riskPreset}
                onChange={e => {
                  const val = e.target.value as 'Conservative' | 'Moderate' | 'Aggressive';
                  setRiskPreset(val);
                  if (val === 'Conservative') setMaxRiskPerTrade(0.5);
                  if (val === 'Moderate') setMaxRiskPerTrade(1.0);
                  if (val === 'Aggressive') setMaxRiskPerTrade(1.5);
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="Conservative">Conservative (0.5%)</option>
                <option value="Moderate">Moderate (1.0%)</option>
                <option value="Aggressive">Aggressive (1.5%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Max Risk / Trade %</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5"
                value={maxRiskPerTrade}
                onChange={e => setMaxRiskPerTrade(parseFloat(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Max Daily Loss %</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={maxDailyLoss}
                onChange={e => setMaxDailyLoss(parseFloat(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Max Drawdown %</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="25"
                value={drawdownLimit}
                onChange={e => setDrawdownLimit(parseFloat(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Allowed Trading Symbols</label>
            <input
              value={symbols}
              onChange={e => setSymbols(e.target.value)}
              placeholder="BTCUSDT, ETHUSDT, EURUSD, GBPUSD, XAUUSD"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
            />
            <span className="text-[10px] text-zinc-500 mt-1 block">Comma-separated ticker symbols. Only matching signals will be traded.</span>
          </div>
        </div>

        {/* Section 3: Connected Provider (MT5) */}
        <div className="space-y-3 pt-2 border-t border-zinc-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
            <Server size={14} className="text-purple-400" />
            3. MetaTrader 5 Provider Credentials
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">MT5 Login Number</label>
              <input
                value={mt5Login}
                onChange={e => setMt5Login(e.target.value)}
                placeholder="5055164653"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Broker Server</label>
              <input
                value={mt5Server}
                onChange={e => setMt5Server(e.target.value)}
                placeholder="MetaQuotes-Demo"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="mt5_exec_toggle"
              checked={mt5Enabled}
              onChange={e => setMt5Enabled(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-0"
            />
            <label htmlFor="mt5_exec_toggle" className="text-xs text-zinc-300 select-none">
              Authorize live trade execution for this MetaTrader 5 account
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Saving Rules...' : 'Save Customer Execution Rules'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Modal for Adding a New Customer ──────────────────────────────────────────

function NewCustomerModal({
  packages,
  onClose,
  onSaved,
}: {
  packages: Package[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [packageId, setPackageId] = useState(packages[0]?.id || '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('active');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErr('Email address is required');
      return;
    }
    setSaving(true);
    setErr(null);

    try {
      const selectedPkg = packages.find(p => p.id === packageId);
      const pkgName = selectedPkg?.name || 'Custom VIP';
      const defaultExpires = new Date();
      defaultExpires.setDate(defaultExpires.getDate() + 30);

      const { error } = await supabase.from('customer_subscriptions').insert({
        email: email.trim().toLowerCase(),
        full_name: fullName.trim() || null,
        package_id: packageId || null,
        package_name: pkgName,
        payment_status: paymentStatus,
        access_status: accessStatus,
        telegram_username: telegramUsername.replace(/^@/, '').trim() || null,
        notes: notes.trim() || null,
        starts_at: new Date().toISOString(),
        expires_at: defaultExpires.toISOString(),
      });

      if (error) throw new Error(error.message);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to register customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm p-4 flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white">Add New Customer</h2>
            <p className="text-xs text-zinc-400">Register subscription & prepare execution linkage</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {err && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
            {err}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="trader@domain.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Full Name</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Alex Smith"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Package Plan</label>
            <select
              value={packageId}
              onChange={e => setPackageId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
            >
              {packages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.price_usd})
                </option>
              ))}
              <option value="">Custom Package</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={e => setPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Access Status</label>
              <select
                value={accessStatus}
                onChange={e => setAccessStatus(e.target.value as AccessStatus)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Telegram Username</label>
            <input
              value={telegramUsername}
              onChange={e => setTelegramUsername(e.target.value)}
              placeholder="trader_alex"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Notes / Special Instructions</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Funded challenge trader, aggressive prop account..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Customer'}
          </button>
        </div>
      </form>
    </div>
  );
}
