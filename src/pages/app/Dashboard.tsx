import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerBotSetup, Signal, TelegramLink, CustomerSubscription, Package } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import {
  Radio, ArrowRight, Lock, MessageCircle, AlertTriangle,
  Send, Package as PackageIcon, Clock, ShieldCheck, BookOpen,
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
import { botSetupStatusLabel, setupProgress } from '../../lib/botSetup';

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
      supabase.from('signals').select('*').in('status', ['waiting', 'active']).order('created_at', { ascending: false }).limit(5),
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

  useEffect(() => { load(); }, [load]);

  const pkg = useMemo(() => packages.find(p => p.id === sub?.package_id || p.name === sub?.package_name || p.slug === latestRequest?.product_slug), [packages, sub, latestRequest]);
  const cryptoPackage = packages.find(p => p.slug === 'crypto_signal_room');
  const requestedPackage = botSetup?.package_slug ?? latestRequest?.product_slug ?? sub?.package_name;
  const accessState = getCustomerAccessState(sub, latestRequest);
  const hasAccess = hasFullSignalAccess(sub, latestRequest);
  const isPending = ['pending', 'pending_payment', 'pending_admin_approval'].includes(accessState);
  const isExpired = accessState === 'expired';
  const noPackage = accessState === 'no_package';
  const accessTone = hasAccess ? 'green' : isPending ? 'yellow' : isExpired ? 'red' : 'gray';
  const hasBotPackage = isBotPackage(slugFromPackageValue(requestedPackage));
  const botProgress = setupProgress(botSetup, hasBotPackage);

  const expiresInDays = sub?.expires_at
    ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)
    : null;
  const expiringWarning = hasAccess && expiresInDays !== null && expiresInDays <= 7 && expiresInDays >= 0;

  const telegramState = sub?.telegram_status === 'joined' || tgLink?.status === 'connected'
    ? 'joined'
    : tgLink?.status === 'pending' || sub?.telegram_status === 'invited'
      ? 'pending'
      : 'not linked';

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Welcome to your Signal Room</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Hi {profile?.full_name || profile?.email || 'there'} — here is your access, package, Telegram, and signal status.
        </p>
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
                  <Link to="/app/package-request" className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors">
                    Choose / Request Package <ArrowRight size={12} />
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
            <h2 className="font-semibold">Package</h2>
          </div>
          {sub || latestRequest ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Package" value={sub?.package_name || pkg?.name || packageDisplayName(latestRequest?.product_slug)} />
              <Info label="Price" value={formatPackagePrice(pkg, sub)} />
              <Info label="Billing period" value={billingPeriod(pkg)} />
              <Info label="Payment" value={
                (() => {
                  const status = sub?.payment_status || latestRequest?.status || 'pending';
                  if (status === 'paid' || status === 'approved' || status === 'converted_to_access') return 'Paid / Approved';
                  if (status === 'pending_payment') return 'Pending payment';
                  if (status === 'pending_admin_approval' || status === 'pending') return 'Pending admin approval';
                  if (status === 'rejected') return 'Rejected';
                  if (status === 'expired') return 'Expired';
                  return status.replace(/_/g, ' ');
                })()
              } />
              <Info label="Start date" value={formatDate(sub?.starts_at)} />
              <Info label="Expiry date" value={sub?.expires_at ? formatDate(sub.expires_at) : 'No expiry set'} />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">No package is assigned yet. Start with Crypto Signal Room for manual paid access.</p>
              <div className="bg-zinc-800/60 rounded-lg px-4 py-3 text-sm">
                <div className="font-medium text-zinc-100">Crypto Signal Room</div>
                <div className="text-zinc-500">{cryptoPackage ? formatPackagePrice(cryptoPackage) : '5,000 KES'} / month · admin approval required</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className={panelClass('blue')}>
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle size={16} className="text-sky-400" />
            <h2 className="font-semibold">Telegram access</h2>
          </div>
          <div className="text-sm capitalize mb-1">Status: <span className="text-zinc-200">{telegramState}</span></div>
          <p className="text-xs text-zinc-400 leading-relaxed mb-4">
            Submit your Telegram username or link. Admin will verify payment/access and invite you manually; private invite links are not exposed here.
          </p>
          {(tgLink?.telegram_username || sub?.telegram_username) && (
            <div className="text-xs text-zinc-500 mb-4">Submitted: @{tgLink?.telegram_username || sub?.telegram_username}</div>
          )}
          <Link to="/app/telegram" className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors">
            Setup Telegram Access <Send size={12} />
          </Link>
        </div>

        <div className={panelClass('gray')}>
          <div className="flex items-center gap-2 mb-3">
            <Radio size={16} className="text-emerald-400" />
            <h2 className="font-semibold">Signal access</h2>
          </div>
          <div className="space-y-2">
            <QuickLink to="/app/signals" icon={<Radio size={13} />} title="Active Signals" locked={!hasAccess} />
            <QuickLink to="/app/signals" icon={<BookOpen size={13} />} title="Risk Rules" locked={false} subtitle="Guidance is shown on every signal" />
          </div>
        </div>

        {hasBotPackage && (
          <div className={panelClass('blue')}>
            <div className="flex items-center gap-2 mb-3">
              <PackageIcon size={16} className="text-sky-400" />
              <h2 className="font-semibold">Bot setup status</h2>
              <Badge variant="blue" className="ml-auto capitalize">{botSetupStatusLabel(botSetup?.setup_status)}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <Info label="Risk preset" value={botSetup?.risk_preset || latestRequest?.risk_preset || 'Not selected'} />
              <Info label="Signal Mode" value="Included" />
            </div>
            <div className="space-y-1.5 mb-4">
              {botProgress.slice(0, 4).map(step => (
                <div key={step.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${step.done ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  <span className={step.done ? 'text-zinc-300' : 'text-zinc-500'}>{step.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">Setup request only. Execution is not active until admin configuration and demo connector are completed. No orders are placed from this dashboard yet.</p>
            <Link to={`/app/package-request?package=${botSetup?.package_slug || slugFromPackageValue(requestedPackage) || 'crypto_personal_bot'}`} className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors">
              Manage setup details <ArrowRight size={12} />
            </Link>
          </div>
        )}

        <div className={panelClass('gray')}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-400" />
            <h2 className="font-semibold">Risk disclaimer</h2>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            HashiBot signals are educational trading tools, not guaranteed profit and not financial advice. Risk/leverage guidance is informational only. You decide whether and how to trade.
          </p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Performance snapshot</h2>
            <p className="text-xs text-zinc-500">Waiting and active live setups only</p>
          </div>
          {!hasAccess && <Badge variant="gray">Locked preview</Badge>}
        </div>
        {hasAccess ? (
          <div className="bg-zinc-800">
            <SnapshotList title="Active now" signals={signals} empty="No waiting or active signals right now." />
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <Lock size={22} className="text-zinc-700 mx-auto mb-3" />
            <div className="text-sm font-medium text-zinc-300 mb-1">Full performance snapshot is locked</div>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              {noPackage ? 'Choose a package and submit manual payment details.' : isPending ? 'Your account is created and waiting for admin approval.' : 'Renew access to view active signals.'}
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

function QuickLink({ to, icon, title, locked, subtitle }: { to: string; icon: ReactNode; title: string; locked: boolean; subtitle?: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 bg-zinc-800/60 hover:bg-zinc-800 rounded-lg px-3 py-2 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <div>
          <div className="text-sm text-zinc-200">{title}</div>
          {subtitle && <div className="text-xs text-zinc-600">{subtitle}</div>}
        </div>
      </div>
      {locked ? <Lock size={12} className="text-zinc-600" /> : <ArrowRight size={12} className="text-zinc-500" />}
    </Link>
  );
}

function SnapshotList({ title, signals, empty }: { title: string; signals: Signal[]; empty: string }) {
  return (
    <div className="bg-zinc-900 p-5">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
      {signals.length === 0 ? (
        <div className="text-xs text-zinc-600">{empty}</div>
      ) : (
        <div className="space-y-2">
          {signals.map(sig => (
            <Link key={sig.id} to={`/app/signals/${sig.id}`} className="block bg-zinc-800/60 hover:bg-zinc-800 rounded-lg px-3 py-2 transition-colors">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono text-sm font-semibold">{sig.symbol}</span>
                {directionBadge(sig.direction)}
                {gradeBadge(sig.grade)}
                {statusBadge(sig.status)}
              </div>
              <div className="text-xs text-zinc-500">{sig.timeframe} · {sig.strategy_name} · {new Date(sig.created_at).toLocaleDateString()}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
