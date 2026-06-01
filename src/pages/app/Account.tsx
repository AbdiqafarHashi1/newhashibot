import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { CustomerSubscription } from '../../lib/types';
import { Badge } from '../../components/ui/Badge';
import {
  User, Radio, Cpu, Zap, Lock, ArrowRight,
  MessageCircle, CheckCircle, Clock, Package, ShieldCheck, Send,
} from 'lucide-react';

function StatusDot({ active }: { active: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />;
}

export default function Account() {
  const { profile, user } = useAuth();
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { setSub(data ?? null); setLoading(false); });
  }, [user]);

  const hasAccess = sub?.access_status === 'active';
  const isPaid = sub?.payment_status === 'paid';

  const expiresInDays = sub?.expires_at
    ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)
    : null;
  const expiringWarning = hasAccess && expiresInDays !== null && expiresInDays <= 7 && expiresInDays >= 0;

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Your profile, subscription, and access details</p>
      </div>

      <div className="max-w-2xl space-y-5">

        {/* Profile card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <User size={18} className="text-zinc-400" />
            </div>
            <div>
              <div className="font-semibold">{profile?.full_name || 'No name set'}</div>
              <div className="text-sm text-zinc-500">{profile?.email}</div>
            </div>
            <Badge variant={profile?.role === 'admin' ? 'orange' : 'blue'} className="ml-auto capitalize">
              {profile?.role}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-zinc-800 rounded-lg px-3 py-2">
              <div className="text-zinc-500 mb-0.5">Member since</div>
              <div className="text-zinc-200">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</div>
            </div>
            <div className="bg-zinc-800 rounded-lg px-3 py-2">
              <div className="text-zinc-500 mb-0.5">Signal Access</div>
              <div className={`flex items-center gap-1.5 ${hasAccess ? 'text-emerald-400' : 'text-zinc-500'}`}>
                <StatusDot active={hasAccess} />
                {hasAccess ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        </div>

        {/* Subscription card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <Package size={14} className="text-zinc-500" /> Subscription
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-zinc-600 text-sm">Loading…</div>
          ) : !sub ? (
            <div className="px-5 py-6">
              <div className="flex items-start gap-3 mb-4">
                <Lock size={16} className="text-zinc-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-zinc-300 mb-1">No active subscription</div>
                  <div className="text-xs text-zinc-500">You don't have a subscription yet. Contact admin or view available packages.</div>
                </div>
              </div>
              <Link to="/pricing"
                className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Package size={13} /> View Packages <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <>
              {expiringWarning && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-3 flex items-center gap-2 text-xs">
                  <Clock size={12} className="text-amber-400 shrink-0" />
                  <span className="text-amber-300 font-medium">Expires in {expiresInDays} day{expiresInDays !== 1 ? 's' : ''}</span>
                  <span className="text-zinc-500">— contact admin to renew.</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-zinc-800">
                {[
                  { label: 'Package', value: sub.package_name || '—', color: 'text-zinc-100' },
                  { label: 'Access Status', value: sub.access_status.charAt(0).toUpperCase() + sub.access_status.slice(1), color: hasAccess ? 'text-emerald-400' : 'text-zinc-500' },
                  { label: 'Payment Status', value: sub.payment_status.charAt(0).toUpperCase() + sub.payment_status.slice(1), color: isPaid ? 'text-emerald-400' : sub.payment_status === 'pending' ? 'text-yellow-400' : 'text-red-400' },
                  { label: 'Starts', value: sub.starts_at ? new Date(sub.starts_at).toLocaleDateString() : '—', color: 'text-zinc-300' },
                  { label: 'Expires', value: sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : 'No expiry', color: expiringWarning ? 'text-amber-400' : 'text-zinc-300' },
                  { label: 'Payment Method', value: sub.payment_method ? sub.payment_method.replace('_', ' ') : '—', color: 'text-zinc-400' },
                ].map(c => (
                  <div key={c.label} className="bg-zinc-900 px-4 py-3">
                    <div className="text-xs text-zinc-500">{c.label}</div>
                    <div className={`text-sm font-semibold mt-0.5 capitalize ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>

              {sub.admin_note && (
                <div className="px-5 py-3 border-t border-zinc-800 text-xs text-zinc-500">
                  <span className="text-zinc-400 font-medium">Admin note: </span>{sub.admin_note}
                </div>
              )}
            </>
          )}
        </div>

        {/* Telegram access card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <MessageCircle size={14} className="text-zinc-500" /> Telegram Access
          </div>
          <div className="px-5 py-5 space-y-4">

            {/* Status indicator */}
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                sub?.telegram_status === 'joined' ? 'bg-emerald-600/20 border border-emerald-600/30' :
                sub?.telegram_status === 'invited' ? 'bg-sky-600/20 border border-sky-600/30' :
                'bg-zinc-800 border border-zinc-700'
              }`}>
                <MessageCircle size={16} className={
                  sub?.telegram_status === 'joined' ? 'text-emerald-400' :
                  sub?.telegram_status === 'invited' ? 'text-sky-400' :
                  'text-zinc-500'
                } />
              </div>
              <div>
                <div className="text-sm font-medium">
                  {sub?.telegram_status === 'joined' ? 'Active — in signal group'
                    : sub?.telegram_status === 'invited' ? 'Invite sent — awaiting join'
                    : sub?.telegram_status === 'removed' ? 'Removed from group'
                    : 'Not yet invited'}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {sub?.telegram_username ? `@${sub.telegram_username}` : 'No Telegram username on file'}
                </div>
              </div>
            </div>

            {/* Step-by-step workflow */}
            <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-4 py-4 space-y-2.5">
              <div className="text-xs font-medium text-zinc-400 mb-1">How Telegram access works:</div>
              {[
                { done: isPaid, text: 'Complete payment — admin marks your subscription as paid' },
                { done: hasAccess, text: 'Admin activates your access' },
                { done: ['invited', 'joined'].includes(sub?.telegram_status ?? ''), text: 'Admin sends you a Telegram group invite link' },
                { done: sub?.telegram_status === 'joined', text: 'You join the group and receive live signal alerts' },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${step.done ? 'bg-emerald-600/30' : 'bg-zinc-700'}`}>
                    {step.done
                      ? <CheckCircle size={10} className="text-emerald-400" />
                      : <span className="text-zinc-500 text-xs leading-none">{i + 1}</span>}
                  </div>
                  <span className={step.done ? 'text-zinc-300' : 'text-zinc-500'}>{step.text}</span>
                </div>
              ))}
            </div>

            {sub?.telegram_status === 'invited' && (
              <div className="bg-sky-500/8 border border-sky-500/20 rounded-lg px-4 py-3 flex items-start gap-2.5">
                <Send size={13} className="text-sky-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-medium text-sky-300 mb-0.5">Invite sent</div>
                  <div className="text-zinc-400">Check your Telegram DMs or the group search for an invite from the admin. If you haven't received it, contact admin with your Telegram username.</div>
                </div>
              </div>
            )}

            {sub?.telegram_status === 'joined' && (
              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-4 py-3 flex items-start gap-2.5">
                <ShieldCheck size={13} className="text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-medium text-emerald-300 mb-0.5">All set</div>
                  <div className="text-zinc-400">You are in the signal group. Live alerts are delivered automatically when new signals are published. Keep notifications on.</div>
                </div>
              </div>
            )}

            <Link to="/app/telegram" className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors">
              Manage Telegram details <ArrowRight size={11} />
            </Link>
          </div>
        </div>

        {/* Products — coming soon */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Coming Soon</h2>
          <div className="space-y-3">
            <div className="rounded-xl border bg-zinc-900 border-zinc-800 p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <Cpu size={16} className="text-zinc-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">Crypto Personal Bot</span>
                  <Badge variant="gray">Admin setup</Badge>
                  <Lock size={12} className="text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Crypto Bot setup/status is admin-enabled. Signal Mode is included; execution is not live until configuration is complete and no orders are placed from this app.</p>
              </div>
            </div>
            <div className="rounded-xl border bg-zinc-900 border-zinc-800 p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <Cpu size={16} className="text-zinc-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">Forex MT5 Personal Bot</span>
                  <Badge variant="gray">Admin setup</Badge>
                  <Lock size={12} className="text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Forex MT5 setup/status is admin-enabled. Signal Mode is included; execution is not live until configuration is complete and no orders are placed from this app.</p>
              </div>
            </div>
            <div className="rounded-xl border bg-zinc-900 border-zinc-800 p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <Zap size={16} className="text-zinc-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">Forex MT5 Prop Bot</span>
                  <Badge variant="gray">Admin setup</Badge>
                  <Lock size={12} className="text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Forex MT5 prop-safe setup/status is admin-enabled with Conservative / Prop Safe risk. Signal Mode is included; no orders are placed from this app.</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-600 leading-relaxed">
          Bot packages include Signal Mode and show setup/status only until admin configuration is complete. No fake live execution controls are shown.
        </p>

        {/* Signals shortcut */}
        {hasAccess && (
          <div className="flex gap-3 flex-wrap">
            <Link to="/app/signals" className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Radio size={13} /> View Live Signals <ArrowRight size={13} />
            </Link>
            <Link to="/app/history" className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors">
              Signal History
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
