import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Signal, TelegramLink, CustomerSubscription } from '../../lib/types';
import { StatCard } from '../../components/ui/StatCard';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import {
  Radio, ArrowRight, Lock, MessageCircle, AlertTriangle, History,
  CheckCircle, Send, Package, Clock, CreditCard, ShieldCheck,
} from 'lucide-react';

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [tgLink, setTgLink] = useState<TelegramLink | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    const [subRes, sigRes, tgRes] = await Promise.all([
      supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('signals').select('*').in('status', ['waiting', 'active']).order('created_at', { ascending: false }).limit(5),
      supabase.from('telegram_links').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    setSub(subRes.data ?? null);
    setSignals(sigRes.data ?? []);
    setTgLink(tgRes.data ?? null);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  const hasAccess = sub?.access_status === 'active';
  const isPaid = sub?.payment_status === 'paid';
  const isExpired = sub?.access_status === 'expired' || sub?.payment_status === 'expired';
  const hasPending = sub?.payment_status === 'pending';

  // Expiry warning: active but expires within 7 days
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Welcome back, {profile?.full_name || profile?.email}</p>
      </div>

      {/* Status cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Subscription"
          value={sub?.package_name || (hasAccess ? 'Active' : 'No Plan')}
          color={hasAccess ? 'green' : hasPending ? 'yellow' : 'gray'}
          icon={<Package size={16} />}
          sub={
            hasAccess && sub?.expires_at
              ? `Expires ${new Date(sub.expires_at).toLocaleDateString()}`
              : hasAccess
                ? 'No expiry set'
                : hasPending
                  ? 'Payment pending — contact admin'
                  : 'Contact admin to get access'
          }
        />
        <StatCard
          label="Active Signals"
          value={hasAccess ? signals.length : '—'}
          color="blue"
          icon={<Radio size={16} />}
          sub={hasAccess ? 'Waiting or active setups' : 'Requires active access'}
        />
        <StatCard
          label="Telegram"
          value={tgLink ? tgLink.status.charAt(0).toUpperCase() + tgLink.status.slice(1) : (sub?.telegram_status === 'joined' ? 'Joined' : 'Not set up')}
          color={
            tgLink?.status === 'connected' || sub?.telegram_status === 'joined' ? 'green'
            : sub?.telegram_status === 'invited' ? 'yellow'
            : 'gray'
          }
          icon={<MessageCircle size={16} />}
          sub={
            sub?.telegram_status === 'joined' ? 'Signal group member'
            : sub?.telegram_status === 'invited' ? 'Invite sent — join the group'
            : tgLink?.telegram_username ? `@${tgLink.telegram_username}`
            : 'Telegram alerts not yet active'
          }
        />
      </div>

      {/* Expiry warning */}
      {expiringWarning && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 flex items-start gap-3 mb-6">
          <Clock size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-amber-300">Your access expires in {expiresInDays} day{expiresInDays !== 1 ? 's' : ''}.</span>
            <span className="text-zinc-400 ml-1">Contact admin to renew your subscription.</span>
          </div>
        </div>
      )}

      {/* No access / gated state */}
      {!hasAccess && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-zinc-800 flex items-center gap-3">
            <Lock size={18} className="text-zinc-600 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">
                {isExpired ? 'Subscription expired' : hasPending ? 'Payment pending' : 'Signal access required'}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {isExpired
                  ? 'Your subscription has expired. Contact admin to renew.'
                  : hasPending
                    ? 'Your payment is being reviewed. Access will be unlocked once confirmed.'
                    : 'You do not have an active subscription. Contact admin or see pricing below.'}
              </p>
            </div>
          </div>

          {/* Subscription info if exists */}
          {sub && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-zinc-800 border-b border-zinc-800">
              {[
                { label: 'Package', value: sub.package_name || '—' },
                { label: 'Payment', value: sub.payment_status.charAt(0).toUpperCase() + sub.payment_status.slice(1) },
                { label: 'Access', value: sub.access_status.charAt(0).toUpperCase() + sub.access_status.slice(1) },
                { label: 'Expires', value: sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : '—' },
              ].map(c => (
                <div key={c.label} className="bg-zinc-900 px-4 py-3">
                  <div className="text-xs text-zinc-600">{c.label}</div>
                  <div className="text-sm font-medium text-zinc-200 mt-0.5">{c.value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="px-6 py-4 flex flex-wrap gap-3">
            <Link to="/pricing"
              className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Package size={14} /> View Packages
            </Link>
            <Link to="/app/telegram"
              className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
              <MessageCircle size={14} /> Telegram Setup
            </Link>
          </div>
        </div>
      )}

      {/* Active subscription info panel */}
      {hasAccess && sub && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500" /> Your Subscription
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-800">
            {[
              { label: 'Package', value: sub.package_name || '—', color: 'text-zinc-100' },
              { label: 'Payment', value: isPaid ? 'Paid' : sub.payment_status, color: isPaid ? 'text-emerald-400' : 'text-yellow-400' },
              { label: 'Expires', value: sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : 'No expiry', color: expiringWarning ? 'text-amber-400' : 'text-zinc-100' },
              { label: 'Telegram', value: sub.telegram_status === 'joined' ? 'In group' : sub.telegram_status === 'invited' ? 'Invite sent' : 'Not invited', color: sub.telegram_status === 'joined' ? 'text-emerald-400' : sub.telegram_status === 'invited' ? 'text-sky-400' : 'text-zinc-500' },
            ].map(c => (
              <div key={c.label} className="bg-zinc-900 px-4 py-3">
                <div className="text-xs text-zinc-500">{c.label}</div>
                <div className={`text-sm font-semibold mt-0.5 ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Telegram invite instructions */}
          <div className="px-5 py-4 border-t border-zinc-800">
            {sub.telegram_status === 'not_invited' && (
              <div className="flex items-start gap-3">
                <MessageCircle size={14} className="text-zinc-600 mt-0.5 shrink-0" />
                <div className="text-xs text-zinc-500">
                  <span className="font-medium text-zinc-300">Telegram group invite pending.</span>{' '}
                  Your admin will send an invite link once your access is confirmed.
                </div>
              </div>
            )}
            {sub.telegram_status === 'invited' && (
              <div className="flex items-start gap-3 bg-sky-500/8 border border-sky-500/20 rounded-lg px-4 py-3">
                <Send size={14} className="text-sky-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-medium text-sky-300 mb-0.5">Telegram invite sent!</div>
                  <div className="text-zinc-400">Check your Telegram for an invite link. Join the group to receive live signal alerts. Contact admin if you did not receive it.</div>
                </div>
              </div>
            )}
            {sub.telegram_status === 'joined' && (
              <div className="flex items-start gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-4 py-3">
                <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-medium text-emerald-300 mb-0.5">You are in the Telegram signal group.</div>
                  <div className="text-zinc-400">Live signal alerts will be delivered to the group. Make sure notifications are on.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active signals (gated) */}
      {hasAccess && (
        <>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Active Signals</h2>
              <Link to="/app/signals" className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {signals.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center mb-4">
                <Radio size={24} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No active signals right now.</p>
                <p className="text-xs text-zinc-600 mt-1">The scanner is watching the markets.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {signals.map(sig => (
                  <Link key={sig.id} to={`/app/signals/${sig.id}`}
                    className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-semibold text-sm">{sig.symbol}</span>
                        <span className="text-xs text-zinc-600">{sig.timeframe}</span>
                        {directionBadge(sig.direction)}
                        {gradeBadge(sig.grade)}
                        {statusBadge(sig.status)}
                        <Badge variant={sig.data_source === 'REAL DATA' ? 'green' : 'orange'} className="text-xs">
                          {sig.data_source === 'REAL DATA' ? 'REAL DATA' : 'PROVIDER UNVERIFIED'}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-500">{sig.strategy_name} · {sig.regime}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-zinc-400">{sig.risk_reward}R</div>
                      <div className="text-xs text-zinc-600">{sig.confidence_score}%</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Shortcuts */}
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            <Link to="/app/history" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition-colors group">
              <History size={16} className="text-zinc-500 group-hover:text-sky-400 transition-colors" />
              <div>
                <div className="text-sm font-medium">Signal History</div>
                <div className="text-xs text-zinc-600">Completed &amp; closed signals</div>
              </div>
            </Link>
            <Link to="/app/telegram" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition-colors group">
              <MessageCircle size={16} className="text-zinc-500 group-hover:text-sky-400 transition-colors" />
              <div>
                <div className="text-sm font-medium">Telegram Setup</div>
                <div className="text-xs text-zinc-600">{tgLink?.status === 'connected' ? 'Connected' : sub?.telegram_status === 'joined' ? 'In signal group' : 'Not connected yet'}</div>
              </div>
            </Link>
            <Link to="/app/account" className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition-colors group">
              <CreditCard size={16} className="text-zinc-500 group-hover:text-sky-400 transition-colors" />
              <div>
                <div className="text-sm font-medium">Account</div>
                <div className="text-xs text-zinc-600">Subscription &amp; billing details</div>
              </div>
            </Link>
          </div>
        </>
      )}

      {/* Risk disclaimer */}
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle size={14} className="text-zinc-600 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-600 leading-relaxed">
          Signals are generated by automated rule-based strategies and must be independently validated before live trading.
          Crypto signals use Binance public market data. Forex signals use demo data and are not real market prices.
          Past setups do not guarantee future results. Trade responsibly.
        </p>
      </div>
    </AppLayout>
  );
}
