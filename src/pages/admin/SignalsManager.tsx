import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { Signal } from '../../lib/types';
import { gradeBadge, directionBadge, statusBadge, Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { Send, RefreshCw, AlertTriangle } from 'lucide-react';

export default function SignalsManager() {
  const { session } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [sending, setSending] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [allowDemoTg, setAllowDemoTg] = useState(false);

  async function load() {
    const [sigRes, cfgRes] = await Promise.all([
      (() => {
        const q = supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(100);
        if (filter === 'active') q.in('status', ['waiting', 'active']);
        else if (filter !== 'all') q.eq('status', filter);
        return q;
      })(),
      supabase.from('scanner_config').select('allow_demo_telegram_sending').eq('id', 1).maybeSingle(),
    ]);
    setSignals(sigRes.data ?? []);
    setAllowDemoTg(cfgRes.data?.allow_demo_telegram_sending ?? false);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  function flash(text: string, type: 'ok' | 'err' = 'ok') {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  }

  async function sendToTelegram(sig: Signal) {
    if (!session) return;
    const isDemo = sig.market_type === 'forex';
    if (isDemo && !allowDemoTg) {
      flash('Demo data signal — Telegram sending is blocked. Enable "Allow demo Telegram sending" in Scanner Config.', 'err');
      return;
    }
    setSending(sig.id);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: sig.id }),
      });
      const data = await res.json();
      if (data.success) flash('Signal sent to Telegram successfully.');
      else flash(`Error: ${data.error}`, 'err');
    } catch (e) {
      flash(`Error: ${e instanceof Error ? e.message : 'unknown'}`, 'err');
    }
    setSending(null);
  }

  async function updateStatus(sig: Signal, newStatus: string) {
    const { error } = await supabase.from('signals').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', sig.id);
    if (!error) {
      await supabase.from('audit_logs').insert({
        actor_user_id: session?.user.id ?? null,
        action: 'signal_status_updated',
        entity_type: 'signals',
        entity_id: sig.id,
        metadata: { from: sig.status, to: newStatus },
      });
    }
    await load();
  }

  const statuses = ['active', 'all', 'tp1_hit', 'tp2_hit', 'sl_hit', 'expired', 'cancelled'];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Signals Manager</h1>
          <p className="text-sm text-zinc-500 mt-0.5">View, update status, and send signals to Telegram</p>
        </div>
        <Link to="/admin/signals/new"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
          + Create Signal
        </Link>
      </div>

      {!allowDemoTg && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg text-xs border bg-orange-500/10 border-orange-500/20 text-orange-300">
          <AlertTriangle size={13} className="shrink-0" />
          Demo data signals (forex) cannot be sent to Telegram. "Allow demo Telegram sending" is disabled in Scanner Config.
          <Link to="/admin/scanner-config" className="ml-auto underline shrink-0">Configure</Link>
        </div>
      )}

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          msgType === 'err' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          {msg}
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-6">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}>
            {s === 'active' ? 'Active / Waiting' : s === 'all' ? 'All' : s.replace(/_/g, ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No signals found. Run the scanner or create a manual signal.
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map(sig => {
            const isDemo = sig.market_type === 'forex';
            const canSendTg = !isDemo || allowDemoTg;

            return (
              <div key={sig.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-mono font-bold text-sm">{sig.symbol}</span>
                      <span className="text-xs text-zinc-600">{sig.timeframe}</span>
                      {directionBadge(sig.direction)}
                      {gradeBadge(sig.grade)}
                      {statusBadge(sig.status)}
                      <Badge variant={isDemo ? 'orange' : 'green'} className="text-xs">
                        {isDemo ? 'DEMO DATA' : 'REAL DATA'}
                      </Badge>
                      {sig.source === 'manual' && <Badge variant="cyan">MANUAL</Badge>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
                      <div><span className="text-zinc-600">Entry:</span> <span className="font-mono text-zinc-300">{Number(sig.entry_low).toFixed(4)}–{Number(sig.entry_high).toFixed(4)}</span></div>
                      <div><span className="text-zinc-600">SL:</span> <span className="font-mono text-red-400">{Number(sig.stop_loss).toFixed(4)}</span></div>
                      <div><span className="text-zinc-600">TP1:</span> <span className="font-mono text-blue-400">{Number(sig.tp1).toFixed(4)}</span></div>
                      <div><span className="text-zinc-600">R/R:</span> <span className="text-zinc-300">{sig.risk_reward}R · {sig.confidence_score}%</span></div>
                    </div>
                    <div className="text-xs text-zinc-600">{sig.strategy_name} · {sig.regime} · {new Date(sig.created_at).toLocaleString()}</div>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => sendToTelegram(sig)}
                      disabled={sending === sig.id || !canSendTg}
                      title={!canSendTg ? 'Demo data — Telegram sending disabled' : 'Send to Telegram'}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                        canSendTg
                          ? 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30'
                          : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'
                      } disabled:opacity-50`}>
                      {sending === sig.id ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                      Send TG
                    </button>
                    <select
                      value={sig.status}
                      onChange={e => updateStatus(sig, e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500">
                      {['waiting','active','tp1_hit','tp2_hit','sl_hit','expired','cancelled'].map(s => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
