import { useEffect, useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CustomerSubscription } from '../../lib/types';
import { accessStateLabel, getCustomerAccessState } from '../../lib/customerAccess';
import { statusBadge } from '../../components/ui/Badge';
import { Send, CheckCircle, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

interface TelegramLink {
  id: string;
  telegram_username: string;
  telegram_chat_id: string;
  status: string;
  notes: string;
  created_at: string;
}

const steps = [
  { n: 1, title: 'Submit your Telegram handle or profile link', desc: 'Send the username you want admin to invite, for example @yourusername. A Chat ID is optional for manual Signal Room access.' },
  { n: 2, title: 'Wait for payment/access review', desc: 'Admin checks your package, manual payment status, and subscription dates before approving Telegram access.' },
  { n: 3, title: 'Receive a manual invite', desc: 'Private Signal Room invite links are not exposed automatically here. Admin will invite or message you after approval.' },
  { n: 4, title: 'Join the Signal Room', desc: 'Once joined, keep Telegram notifications on so you do not miss active crypto Signal Mode alerts.' },
];

export default function TelegramSetup() {
  const { user } = useAuth();
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [sub, setSub] = useState<CustomerSubscription | null>(null);
  const [username, setUsername] = useState('');
  const [chatId, setChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('telegram_links').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('customer_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
    ]).then(([linkRes, subRes]) => {
      const d = linkRes.data as TelegramLink | null;
      setLink(d);
      setSub(subRes.data ?? null);
      if (d) { setUsername(d.telegram_username); setChatId(d.telegram_chat_id); }
      else if (subRes.data?.telegram_username) setUsername(subRes.data.telegram_username);
      setLoading(false);
    });
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!username.trim() && !chatId.trim()) {
      setMsg('Please enter at least your Telegram username or Chat ID.'); setMsgType('err'); return;
    }
    setSubmitting(true);
    setMsg('');

    const payload = {
      user_id: user.id,
      telegram_username: username.trim(),
      telegram_chat_id: chatId.trim(),
      status: 'pending',
    };

    let error;
    if (link) {
      ({ error } = await supabase.from('telegram_links').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', link.id));
    } else {
      ({ error } = await supabase.from('telegram_links').insert(payload));
    }

    if (error) {
      setMsg(`Error: ${error.message}`); setMsgType('err');
    } else {
      setMsg('Telegram details submitted. Admin will review payment/access and send the private invite manually if approved.');
      setMsgType('ok');
      const { data } = await supabase.from('telegram_links').select('*').maybeSingle();
      setLink(data as TelegramLink | null);
    }
    setSubmitting(false);
  }

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Telegram Setup</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Submit your Telegram details for manual Signal Room invite approval</p>
      </div>

      <div className="max-w-2xl space-y-5">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck size={16} className="text-sky-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium mb-1">Customer access status: {accessStateLabel(getCustomerAccessState(sub))}</div>
            <p className="text-xs text-zinc-500 leading-relaxed">Admin approves Telegram access after your package and manual payment are approved. This page never reveals a private invite link automatically.</p>
          </div>
        </div>
        {/* Current status */}
        {link && (
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${
            link.status === 'connected' ? 'bg-emerald-500/10 border-emerald-500/20'
            : link.status === 'pending' ? 'bg-yellow-500/10 border-yellow-500/20'
            : 'bg-zinc-900 border-zinc-800'
          }`}>
            {link.status === 'connected'
              ? <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
              : <Clock size={16} className="text-yellow-400 mt-0.5 shrink-0" />}
            <div>
              <div className="text-sm font-medium mb-1 flex items-center gap-2">
                Telegram Connection Status {statusBadge(link.status)}
              </div>
              {link.telegram_username && (
                <div className="text-xs text-zinc-400">Username: @{link.telegram_username}</div>
              )}
              {link.telegram_chat_id && (
                <div className="text-xs text-zinc-400">Chat ID: {link.telegram_chat_id}</div>
              )}
              {link.status === 'pending' && (
                <div className="text-xs text-yellow-300/80 mt-1">Your request is pending admin approval.</div>
              )}
              {link.status === 'connected' && (
                <div className="text-xs text-emerald-300/80 mt-1">Your channel is connected. Signals will be delivered here.</div>
              )}
              {link.status === 'revoked' && (
                <div className="text-xs text-zinc-400 mt-1">Your connection was revoked. Submit a new request below.</div>
              )}
              {link.notes && (
                <div className="text-xs text-zinc-400 mt-1 italic">Admin note: {link.notes}</div>
              )}
            </div>
          </div>
        )}

        {/* Setup steps */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3">
            <div className="text-sm font-semibold">How to connect</div>
          </div>
          <div className="divide-y divide-zinc-800">
            {steps.map(step => (
              <div key={step.n} className="px-5 py-4 flex gap-4">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center shrink-0 text-xs font-bold text-blue-400">
                  {step.n}
                </div>
                <div>
                  <div className="font-medium text-sm mb-0.5">{step.title}</div>
                  <div className="text-xs text-zinc-500 leading-relaxed">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submission form */}
        {(link?.status !== 'connected') && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-sm font-semibold mb-4">
              {link ? 'Update your Telegram details' : 'Submit your Telegram details'}
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Telegram Username (optional)</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="@yourusername"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Telegram Chat ID or profile link (optional)</label>
                <input
                  type="text"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="optional chat ID or t.me/yourusername"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-zinc-600 mt-1">For Signal Room launch, your @username or t.me link is enough. Add Chat ID only if admin asks for it.</p>
              </div>
              {msg && (
                <div className={`text-xs px-3 py-2 rounded-lg border ${
                  msgType === 'err' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  {msg}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {submitting ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={14} />}
                {link ? 'Update Request' : 'Submit Request'}
              </button>
            </form>
          </div>
        )}

        {/* Signal format preview */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-sm font-medium">Signal format preview</span>
          </div>
          <pre className="text-xs text-zinc-400 leading-relaxed bg-zinc-950 rounded-lg p-4 overflow-x-auto">{`HASHIBOT A+ SIGNAL

Symbol: BTCUSDT
Market: CRYPTO (REAL DATA)
Timeframe: 1h
Direction: BUY
Entry: 67240.00 – 67380.00
Stop Loss: 66890.00
TP1: 67720.00
TP2: 68400.00
Risk/Reward: 2.80R
Strategy: TrendContinuation
Regime: trend_up
Confidence: 88%
Reason: trend_up pullback to EMA zone

HashiBot Trading Intelligence`}</pre>
        </div>

        <div className="flex items-start gap-2 text-xs text-zinc-600">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>Signals are educational tools and must be validated before live trading. Crypto Signal Mode is active; Forex Signal Mode may be available only when enabled by admin.</span>
        </div>
      </div>
    </AppLayout>
  );
}
