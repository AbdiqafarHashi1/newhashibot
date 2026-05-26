import { useEffect, useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { statusBadge } from '../../components/ui/Badge';
import { Send, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface TelegramLink {
  id: string;
  telegram_username: string;
  telegram_chat_id: string;
  status: string;
  notes: string;
  created_at: string;
}

const steps = [
  { n: 1, title: 'Open Telegram', desc: 'Open the Telegram app on your phone or desktop.' },
  { n: 2, title: 'Create a channel or group', desc: 'Create a private Telegram channel (e.g. "My HashiBot Signals") or use an existing personal chat. You can also add the bot to a group.' },
  { n: 3, title: 'Find the HashiBot bot', desc: 'Ask your admin for the bot username. Add the bot as an admin to your channel or group. It needs permission to post messages.' },
  { n: 4, title: 'Get your Chat ID', desc: 'Forward any message from your channel to @userinfobot on Telegram. It will reply with your Chat ID (channels start with -100).' },
  { n: 5, title: 'Submit your details below', desc: 'Fill in your Telegram username and Chat ID in the form below and submit. Your request will be reviewed by the admin.' },
  { n: 6, title: 'Wait for confirmation', desc: 'Once approved, your status will change to "Connected" and you will start receiving signals in your Telegram channel.' },
];

export default function TelegramSetup() {
  const { user } = useAuth();
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [username, setUsername] = useState('');
  const [chatId, setChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('telegram_links').select('*').maybeSingle()
      .then(({ data }) => {
        const d = data as TelegramLink | null;
        setLink(d);
        if (d) { setUsername(d.telegram_username); setChatId(d.telegram_chat_id); }
        setLoading(false);
      });
  }, []);

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
      setMsg('Request submitted. Admin will review and connect your channel.');
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
        <p className="text-sm text-zinc-500 mt-0.5">Connect your Telegram channel to receive live signals</p>
      </div>

      <div className="max-w-2xl space-y-5">
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
                <label className="block text-xs text-zinc-500 mb-1">Telegram Chat ID (required for signal delivery)</label>
                <input
                  type="text"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-zinc-600 mt-1">Channel chat IDs start with -100. Personal chat IDs are positive numbers.</p>
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
          <span>Signals are generated by automated strategies and must be validated before live trading. Forex signals use demo data.</span>
        </div>
      </div>
    </AppLayout>
  );
}
