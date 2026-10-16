import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { usePreviewViewer } from '../../contexts/OwnerPreviewContext';
import { supabase } from '../../lib/supabase';
import { AccessRequest, CustomerBotSetup, CustomerSubscription } from '../../lib/types';
import { Badge } from '../../components/ui/Badge';
import {
  User, Radio, Cpu, Lock, ArrowRight,
  MessageCircle, CheckCircle, Clock, Package, ShieldCheck, Send, AlertTriangle,
  Smartphone, Download, Sparkles
} from 'lucide-react';
import { botSetupStatusLabel, setupProgress } from '../../lib/botSetup';
import { isBotPackage, packageDisplayName, slugFromPackageValue } from '../../lib/packages';
import { usePWA } from '../../contexts/PWAContext';


function StatusDot({ active }: { active: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />;
}

export default function Account() {
  const { displayProfile: profile, subject: user } = usePreviewViewer();
  const { isInstalled, promptInstall } = usePWA();
  const [sub, setSub] = useState<CustomerSubscription | null>(null);

  const [latestRequest, setLatestRequest] = useState<AccessRequest | null>(null);
  const [botSetup, setBotSetup] = useState<CustomerBotSetup | null>(null);
  const [provisioning, setProvisioning] = useState<{id:string;product:string;provider:string|null;state:string;runtime_control:string;preferences:Record<string,unknown>} | null>(null);
  const [controlNotice,setControlNotice]=useState(''),[controlBusy,setControlBusy]=useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('access_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('customer_bot_setups').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.functions.invoke('customer-provisioning', { body: { action: 'my_status' } }),
    ]).then(([subRes, reqRes, setupRes, onboardingRes]) => {
      setSub(subRes.data ?? null);
      setLatestRequest(reqRes.data as AccessRequest | null);
      setBotSetup(setupRes.data as CustomerBotSetup | null);
      setProvisioning(onboardingRes.data?.onboarding?.[0] ?? null);
      setLoading(false);
    });
  }, [user]);

  async function setAccountControl(control: 'START'|'PAUSE_NEW_ENTRIES'|'RESUME'|'STOP_AFTER_FLAT') {
    if (!provisioning||controlBusy) return;setControlBusy(true);setControlNotice('');
    try {const {data, error } = await supabase.functions.invoke('customer-provisioning', { body: { action:'set_control', provisioning_id:provisioning.id, control } });
    if(error||data?.error)throw new Error(data?.reason??data?.error??error?.message);
    setProvisioning({...provisioning,runtime_control:data.runtime_control});setControlNotice('Account control recorded. Existing position protection remains active.');}catch(e){setControlNotice(e instanceof Error?e.message:'Account control was not confirmed.')}finally{setControlBusy(false)}
  }

  const hasAccess = sub?.access_status === 'active';
  const isPaid = sub?.payment_status === 'paid';
  const packageValue = botSetup?.package_slug || latestRequest?.product_slug || sub?.package_name;
  const hasBotPackage = isBotPackage(slugFromPackageValue(packageValue));
  const progress = setupProgress(botSetup, hasBotPackage);

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

        {provisioning && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="font-semibold mb-3">Trading status</div>
          <div className="grid grid-cols-2 gap-2 text-xs mb-4">
            <div>Product: <span className="text-zinc-200">{provisioning.product.replaceAll('_',' ')}</span></div>
            <div>Status: <span className="text-zinc-200">{provisioning.state.replaceAll('_',' ')}</span></div>
            <div>Provider: <span className="text-zinc-200">{provisioning.provider ?? 'Signals only'}</span></div>
            <div>Risk style: <span className="text-zinc-200">{String(provisioning.preferences?.riskStyle ?? 'Conservative')}</span></div>
          </div>
          {provisioning.product !== 'SIGNAL_ONLY' && <div className="flex flex-wrap gap-2">{(['START','PAUSE_NEW_ENTRIES','RESUME','STOP_AFTER_FLAT'] as const).map(control=><button key={control} onClick={()=>setAccountControl(control)} disabled={controlBusy||provisioning.state!=='ACTIVE'} className="px-3 py-2 rounded bg-zinc-800 disabled:opacity-40 text-xs">{control.replaceAll('_',' ')}</button>)}</div>}
          <p role="status" className="mt-3 text-xs text-amber-200">{controlNotice}</p><p className="text-xs text-zinc-500 mt-3">Pausing new entries does not stop protection or management of existing positions.</p>
        </div>}

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

        {/* Native Progressive Web App (PWA) Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-600/30 text-white">
                <Smartphone size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-white">Native Mobile App</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                    <Sparkles size={9} /> PWA
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {isInstalled 
                    ? 'Running in standalone native application mode with offline caching'
                    : 'Install to your home screen for instant trading alerts, offline shell, and notch-safe fullscreen'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 mt-3">
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${isInstalled ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-blue-400 animate-pulse'}`} />
              <span className="text-zinc-300 font-mono text-[11px]">
                {isInstalled ? 'STATUS: INSTALLED & ACTIVE' : 'STATUS: READY FOR INSTALL'}
              </span>
            </div>

            {!isInstalled && (
              <button
                onClick={() => promptInstall()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-xs transition-colors shadow-md shadow-blue-600/20"
              >
                <Download size={13} />
                Install App
              </button>
            )}
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

        {hasBotPackage ? (
          <div className="bg-zinc-900 border border-sky-500/20 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
              <Cpu size={14} className="text-sky-400" /> Bot Setup
              <Badge variant="blue" className="ml-auto capitalize">{botSetupStatusLabel(botSetup?.setup_status)}</Badge>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-zinc-800 rounded-lg px-3 py-2">
                  <div className="text-zinc-500 mb-0.5">Current package</div>
                  <div className="text-zinc-200">{packageDisplayName(packageValue)}</div>
                </div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2">
                  <div className="text-zinc-500 mb-0.5">Risk preset</div>
                  <div className="text-zinc-200">{botSetup?.risk_preset || latestRequest?.risk_preset || 'Not selected'}</div>
                </div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2">
                  <div className="text-zinc-500 mb-0.5">Bot type</div>
                  <div className="text-zinc-200 capitalize">{botSetup?.bot_type?.replace(/_/g, ' ') || 'Pending setup form'}</div>
                </div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2">
                  <div className="text-zinc-500 mb-0.5">Capital mode</div>
                  <div className="text-zinc-200 capitalize">{botSetup?.capital_mode || (packageValue?.includes('prop') ? 'prop' : 'personal')}</div>
                </div>
              </div>

              <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-4 py-4 space-y-2.5">
                <div className="text-xs font-medium text-zinc-400 mb-1">Setup checklist:</div>
                {progress.map((step, i) => (
                  <div key={step.label} className="flex items-start gap-2.5 text-xs">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${step.done ? 'bg-emerald-600/30' : 'bg-zinc-700'}`}>
                      {step.done ? <CheckCircle size={10} className="text-emerald-400" /> : <span className="text-zinc-500 text-xs leading-none">{i + 1}</span>}
                    </div>
                    <span className={step.done ? 'text-zinc-300' : 'text-zinc-500'}>{step.label}</span>
                  </div>
                ))}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-start gap-2.5">
                <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-100 leading-relaxed">Setup request only. Execution is not active until admin configuration and demo connector are completed. No orders are placed from this dashboard yet.</p>
              </div>

              <Link to={`/app/package-request?package=${botSetup?.package_slug || slugFromPackageValue(packageValue) || 'crypto_personal_bot'}`} className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors">
                Edit setup request <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Bot packages</h2>
            <div className="rounded-xl border bg-zinc-900 border-zinc-800 p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <Cpu size={16} className="text-zinc-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">Bot setup appears here after selecting a Bot package</span>
                  <Badge variant="gray">Setup only</Badge>
                  <Lock size={12} className="text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">Signal Room customers keep the normal Signal Mode flow. Full Bot setup fields are shown only for Crypto Personal Bot, Forex MT5 Personal Bot, or Forex MT5 Prop Bot requesters.</p>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-600 leading-relaxed">
          Bot packages include Signal Mode and show setup/status only until admin configuration is complete. No Start/Stop/Connect controls are shown.
        </p>

        {/* Signals shortcut */}
        {hasAccess && (
          <div className="flex gap-3 flex-wrap">
            <Link to="/app/signals" className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Radio size={13} /> View Live Signals <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

