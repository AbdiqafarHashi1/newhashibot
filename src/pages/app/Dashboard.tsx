import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerBotSetup, Signal, TelegramLink, CustomerSubscription, Package } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import {
  Radio, ArrowRight, Lock, Package as PackageIcon, Clock, ShieldCheck,
  Zap, Server, Award, Sliders, Compass, Activity, TrendingUp, Layers
} from 'lucide-react';
import {
  accessStateDescription,
  accessStateLabel,
  billingPeriod,
  formatDate,
  formatPackagePrice,
  getCustomerAccessState,
  hasFullSignalAccess,
} from '../../lib/customerAccess';
import { isBotPackage, normalizePackage, packageDisplayName, slugFromPackageValue } from '../../lib/packages';
import { formatEATTime, formatRelativeTime, getSignalFreshness } from '../../lib/timeUtils';
import { LiveSignalNotifier } from '../../components/signals/LiveSignalNotifier';

function panelClass(tone: 'green' | 'yellow' | 'red' | 'gray' | 'blue') {
  const tones = {
    green: 'bg-emerald-500/10 border-emerald-500/25',
    yellow: 'bg-yellow-500/10 border-yellow-500/25',
    red: 'bg-red-500/10 border-red-500/25',
    gray: 'bg-zinc-900 border-zinc-800',
    blue: 'bg-sky-500/10 border-sky-500/25',
  };
  return `rounded-xl border p-5 ${tones[tone]}`;
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [tgLink, setTgLink] = useState<TelegramLink | null>(null);
  const [latestRequest, setLatestRequest] = useState<AccessRequest | null>(null);
  const [botSetup, setBotSetup] = useState<CustomerBotSetup | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async function load() {
    if (!user) return;
    const [subRes, pkgRes, sigRes, tgRes, reqRes, setupRes] = await Promise.all([
      supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('signals').select('*').in('status', ['waiting', 'active']).order('created_at', { ascending: false }).limit(6),
      supabase.from('telegram_links').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('customer_bot_setups').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    setSub(subRes.data ?? null);
    setPackages(((pkgRes.data ?? []) as Package[]).map(normalizePackage));
    setSignals(sigRes.data ?? []);
    setTgLink(tgRes.data ?? null);
    setLatestRequest(reqRes.data as AccessRequest | null);
    setBotSetup(setupRes.data as CustomerBotSetup | null);
    setLoading(false);
  }, [user]);

  useEffect(() => { 
    load(); 
    const channel = supabase
      .channel('dashboard_signal_stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const pkg = useMemo(() => packages.find(p => p.id === sub?.package_id || p.name === sub?.package_name || p.slug === latestRequest?.product_slug), [packages, sub, latestRequest]);
  const requestedPackage = botSetup?.package_slug ?? latestRequest?.product_slug ?? sub?.package_name;
  const accessState = getCustomerAccessState(sub, latestRequest);
  const hasAccess = hasFullSignalAccess(sub, latestRequest);
  const isPending = ['pending', 'pending_payment', 'pending_admin_approval'].includes(accessState);
  const isExpired = accessState === 'expired';
  const noPackage = accessState === 'no_package';
  const accessTone = hasAccess ? 'green' : isPending ? 'yellow' : isExpired ? 'red' : 'gray';
  const hasBotPackage = isBotPackage(slugFromPackageValue(requestedPackage));
  const isSignalOnly = !hasBotPackage;

  const expiresInDays = sub?.expires_at
    ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)
    : null;
  const expiringWarning = hasAccess && expiresInDays !== null && expiresInDays <= 7 && expiresInDays >= 0;

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      {/* Live Header with Audio Notifications & Status */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-white">Trading Command Center</h1>
            <span className="text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full">
              {isSignalOnly ? 'VIP SIGNALS MODE' : 'AUTO-EXECUTION SUITE'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Welcome, {profile?.full_name || profile?.email || 'Trader'} · Keep this tab open for real-time harmonic chimes on new setups.
          </p>
        </div>

        {/* Real-time audio notifier controls */}
        <LiveSignalNotifier hasAccess={hasAccess} />
      </div>

      {/* Mode Clarity Banner (Signals Mode vs Bot Execution Mode) */}
      <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSignalOnly ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'}`}>
            {isSignalOnly ? <Radio size={20} /> : <Zap size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm sm:text-base">
                {isSignalOnly ? 'VIP Signal Room Active' : 'Automated Bot Fleet Mode'}
              </span>
              <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 max-w-xl">
              {isSignalOnly
                ? 'You are receiving real-time signals with optimal entry windows, SL, and TP levels for manual execution. No bot API keys required.'
                : 'Your automated execution bot is connected to your MT5 / Exchange keys with strict drawdown circuit-breakers.'}
            </p>
          </div>
        </div>

        {isSignalOnly ? (
          <Link
            to="/app/bot-setup"
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-zinc-700 transition-all shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>Want Hands-Free Auto-Trading?</span>
            <ArrowRight size={13} />
          </Link>
        ) : (
          <Link
            to="/app/bot-setup"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span>Manage Bot Parameters</span>
            <Sliders size={13} />
          </Link>
        )}
      </div>

      {/* Product Portals Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/app/signals" className="bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded-2xl p-4 transition-all group">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Radio size={16} className="text-emerald-400" />
            </div>
            <ArrowRight size={14} className="text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="font-bold text-sm text-white mb-0.5">Live Signal Feed</div>
          <p className="text-xs text-zinc-500">Real-time setups & timestamps</p>
        </Link>

        <Link to="/app/crypto-execution" className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-2xl p-4 transition-all group">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Zap size={16} className="text-amber-400" />
            </div>
            <ArrowRight size={14} className="text-zinc-600 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="font-bold text-sm text-white mb-0.5">Crypto Automation</div>
          <p className="text-xs text-zinc-500">Binance / Bybit sub-second execution</p>
        </Link>

        <Link to="/app/mt5-personal" className="bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 rounded-2xl p-4 transition-all group">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Server size={16} className="text-blue-400" />
            </div>
            <ArrowRight size={14} className="text-zinc-600 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="font-bold text-sm text-white mb-0.5">MT5 Personal Bot</div>
          <p className="text-xs text-zinc-500">Forex & Gold terminal connector</p>
        </Link>

        <Link to="/app/mt5-prop" className="bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 rounded-2xl p-4 transition-all group">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Award size={16} className="text-amber-400" />
            </div>
            <ArrowRight size={14} className="text-zinc-600 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="font-bold text-sm text-white mb-0.5">MT5 Prop Challenge</div>
          <p className="text-xs text-zinc-500">4.5% drawdown lockdown guard</p>
        </Link>
      </div>

      {/* Real-time Market Regime Bar */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 mb-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Compass size={16} />
            </span>
            <div>
              <span className="text-xs font-bold text-zinc-200">Continuous Market Regime & Multi-Asset Scanner</span>
              <p className="text-[11px] text-zinc-400">Live HMM state filter & institutional orderflow confirmation.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 self-start sm:self-auto">
            <Activity size={12} /> Scanner Active · East Africa Time Feed
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80">
            <div className="text-[10px] font-mono uppercase text-zinc-500">Crypto BTC/ETH Regime</div>
            <div className="font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
              <TrendingUp size={13} /> Distribution Trend (84%)
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">Expansion momentum favored. Scalp multiplier: 1.15x</div>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80">
            <div className="text-[10px] font-mono uppercase text-zinc-500">Forex Majors & Gold</div>
            <div className="font-bold text-blue-400 flex items-center gap-1.5 mt-0.5">
              <Layers size={13} /> Accumulation Grid (78%)
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">Mean reversion active. London breakout throttled.</div>
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80">
            <div className="text-[10px] font-mono uppercase text-zinc-500">Prop Firm Risk Guardrail</div>
            <div className="font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
              <ShieldCheck size={13} /> Quarter Kelly Enforced (0.25x)
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">Max 1.5% risk cap with 4.5% daily drawdown tripwire.</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className={panelClass(accessTone)}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${hasAccess ? 'bg-emerald-500/20' : isPending ? 'bg-yellow-500/20' : isExpired ? 'bg-red-500/20' : 'bg-zinc-800'}`}>
              {hasAccess ? <ShieldCheck size={18} className="text-emerald-400" /> : <Lock size={18} className="text-zinc-400" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="font-semibold">Access status</h2>
                <Badge variant={hasAccess ? 'green' : isPending ? 'yellow' : isExpired ? 'red' : 'gray'}>{accessStateLabel(accessState)}</Badge>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">{accessStateDescription(accessState, sub?.package_name ?? latestRequest?.product_slug)}</p>
              {expiringWarning && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
                  <Clock size={12} /> Access expires in {expiresInDays} day{expiresInDays !== 1 ? 's' : ''}. Contact admin to renew.
                </div>
              )}
              {!hasAccess && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  <Link to="/pricing" className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors">
                    Renew / Choose Package <ArrowRight size={12} />
                  </Link>
                  <Link to="/app/package-request" className="inline-flex items-center gap-1.5 border border-zinc-700 text-zinc-300 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors">
                    Update package request
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={panelClass('gray')}>
          <div className="flex items-center gap-2 mb-4">
            <PackageIcon size={16} className="text-sky-400" />
            <h2 className="font-semibold">Active Plan</h2>
          </div>
          {sub || latestRequest ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Package" value={sub?.package_name || pkg?.name || packageDisplayName(latestRequest?.product_slug)} />
              <Info label="Price" value={formatPackagePrice(pkg, sub)} />
              <Info label="Billing period" value={billingPeriod(pkg)} />
              <Info label="Telegram Access" value={tgLink?.telegram_username ? `@${tgLink.telegram_username}` : sub?.telegram_status === 'joined' ? 'Connected' : 'Pending Link'} />
              <Info label="Start date" value={formatDate(sub?.starts_at)} />
              <Info label="Expiry date" value={sub?.expires_at ? formatDate(sub.expires_at) : 'No expiry set'} />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">No package is assigned yet. Start with VIP Signal Room for instant setups.</p>
              <div className="bg-zinc-800/60 rounded-lg px-4 py-3 text-sm">
                <div className="font-medium text-zinc-100">VIP Signal Room</div>
                <div className="text-zinc-500">3,500 KES / month (or 1,200 KES / week)</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Snapshot List with Timestamps and Freshness */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
        <div className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">Live Execution Signal Stream</h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                TIMESTAMPS ATTACHED
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Active setups ranked by entry freshness</p>
          </div>
          <Link to="/app/signals" className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1">
            <span>View All Signals</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {hasAccess ? (
          <SnapshotList title="Active Setups in Execution Window" signals={signals} empty="No waiting or active signals right now. Scanner running..." />
        ) : (
          <div className="px-5 py-8 text-center">
            <Lock size={22} className="text-zinc-700 mx-auto mb-3" />
            <div className="text-sm font-medium text-zinc-300 mb-1">Live Signal Stream is locked</div>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              {noPackage ? 'Choose a package and submit manual M-Pesa payment.' : isPending ? 'Your payment is pending admin approval.' : 'Renew access to unlock live signals.'}
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className="text-zinc-200 capitalize">{value || '—'}</div>
    </div>
  );
}

function SnapshotList({ title, signals, empty }: { title: string; signals: Signal[]; empty: string }) {
  return (
    <div className="p-5">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
      {signals.length === 0 ? (
        <div className="text-xs text-zinc-500 p-4 text-center bg-zinc-950/40 rounded-xl">{empty}</div>
      ) : (
        <div className="space-y-2.5">
          {signals.map(sig => {
            const freshness = getSignalFreshness(sig.created_at);
            return (
              <Link
                key={sig.id}
                to={`/app/signals/${sig.id}`}
                className="block bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-zinc-700 rounded-xl p-3.5 transition-all group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-extrabold text-white">{sig.symbol}</span>
                    <span className="text-xs text-zinc-500 font-mono bg-zinc-900 px-1.5 py-0.5 rounded">{sig.timeframe}</span>
                    {directionBadge(sig.direction)}
                    {gradeBadge(sig.grade)}
                    {statusBadge(sig.status)}

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${freshness.badgeClass}`}>
                      <span className={`w-1 h-1 rounded-full ${freshness.dotColor}`} />
                      <span>{freshness.label}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                    <Clock size={12} className="text-zinc-500" />
                    <span className="text-zinc-200 font-bold">{formatRelativeTime(sig.created_at)}</span>
                    <span className="text-zinc-500 text-[11px]">({formatEATTime(sig.created_at)})</span>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                  <div className="font-mono">
                    Entry: <strong className="text-zinc-200">{sig.entry_low}–{sig.entry_high}</strong> · SL: <strong className="text-red-400">{sig.stop_loss}</strong> · TP1: <strong className="text-emerald-400">{sig.tp1}</strong>
                  </div>
                  <div className="text-[11px] text-zinc-500 hidden md:block">
                    {freshness.subtext}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
